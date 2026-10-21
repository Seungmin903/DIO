import { GifReader } from 'omggif'
import { downscaleRgba, gifFrameDelays } from './gifExport.js'

// 효과용 PNG 프리뷰만 제한한다. 원본 GIF와 출력 데이터는 바꾸지 않는다.
export const STICKER_PLAYBACK_LIMITS = { frames: 60, side: 256, pixels: 2 * 1024 * 1024 }

// 기본 glowstar GIF는 첫 스트림 종료자 대신 두 번째 GIF 헤더가 붙어 있다.
// 압축 데이터 안의 우연한 문자열과 혼동하지 않도록 블록 경계에서만 첫 스트림을 닫는다.
export function playbackGifBytes(bytes) {
  if (!bytes?.length || bytes.length > 50 * 1024 * 1024) return bytes
  const fits = (at, size) => at >= 0 && at + size <= bytes.length
  const signature = (at) => fits(at, 6) && String.fromCharCode(...bytes.subarray(at, at + 6)).match(/^GIF8[79]a$/)
  if (!fits(0, 13) || !signature(0)) return bytes
  let offset = 13 + (bytes[10] & 128 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0)
  const blocks = () => {
    while (fits(offset, 1)) {
      const length = bytes[offset++]
      if (!length) return true
      if (!fits(offset, length)) return false
      offset += length
    }
    return false
  }
  let images = 0
  while (fits(offset, 1)) {
    if (images && signature(offset)) {
      const first = new Uint8Array(offset + 1)
      first.set(bytes.subarray(0, offset)); first[offset] = 0x3b
      return first
    }
    const kind = bytes[offset++]
    if (kind === 0x3b) return bytes
    if (kind === 0x21) { offset++; if (!blocks()) return bytes }
    else if (kind === 0x2c && fits(offset, 9)) {
      const packed = bytes[offset + 8]
      offset += 9 + (packed & 128 ? 3 * (1 << ((packed & 7) + 1)) : 0)
      offset++ // LZW 코드 크기
      if (!blocks()) return bytes
      images++
    } else return bytes
  }
  return bytes
}

export function playbackSteps(delays, maxFrames = STICKER_PLAYBACK_LIMITS.frames) {
  if (!delays.length || delays.some((d) => !Number.isFinite(d) || d <= 0)) throw new Error('Invalid GIF timing')
  if (delays.length <= maxFrames) return delays.map((duration, index) => ({ index, duration }))
  const total = delays.reduce((sum, d) => sum + d, 0), steps = []
  let index = 0, end = delays[0]
  for (let i = 0; i < maxFrames; i++) {
    const time = i * total / maxFrames
    while (time >= end && index < delays.length - 1) end += delays[++index]
    const duration = total / maxFrames
    if (steps.at(-1)?.index === index) steps.at(-1).duration += duration
    else steps.push({ index, duration })
  }
  return steps
}

/** GIF의 disposal 2/3·투명을 합성한 같은 장면을 원본과 모든 효과 레이어에 공급한다. */
export async function prepareStickerPlayback(bytes, createFrame, { signal, limits = STICKER_PLAYBACK_LIMITS, yieldFrame = () => new Promise((resolve) => setTimeout(resolve, 0)) } = {}) {
  bytes = playbackGifBytes(bytes)
  const delays = gifFrameDelays(bytes) // 기존 크기·파일 제한 검사 재사용
  const reader = new GifReader(bytes)
  const steps = playbackSteps(delays, limits.frames)
  const needed = new Set(steps.map((s) => s.index)), resources = new Map()
  const { width, height } = reader
  const scale = Math.min(1, limits.side / Math.max(width, height), Math.sqrt(limits.pixels / (width * height * needed.size)))
  const targetWidth = Math.max(1, Math.floor(width * scale)), targetHeight = Math.max(1, Math.floor(height * scale))
  const canvas = new Uint8Array(width * height * 4)
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    resources.forEach((resource) => resource.dispose())
    resources.clear()
  }
  try {
    const last = Math.max(...needed)
    for (let index = 0; index <= last; index++) {
      if (signal?.aborted) throw new Error('Sticker playback cancelled')
      const info = reader.frameInfo(index)
      const previous = info.disposal === 3 ? canvas.slice() : null
      reader.decodeAndBlitFrameRGBA(index, canvas)
      if (needed.has(index)) {
        const small = downscaleRgba(canvas, width, height, targetWidth, targetHeight)
        resources.set(index, createFrame(small.rgba, small.width, small.height))
      }
      if (info.disposal === 2) {
        for (let y = info.y; y < Math.min(height, info.y + info.height); y++) {
          canvas.fill(0, (y * width + info.x) * 4, (y * width + Math.min(width, info.x + info.width)) * 4)
        }
      } else if (previous) canvas.set(previous)
      await yieldFrame()
    }
    if (signal?.aborted) throw new Error('Sticker playback cancelled')
    return { frames: steps.map(({ index, duration }) => ({ source: { uri: resources.get(index).uri }, duration })),
      loopCount: reader.loopCount(), width: targetWidth, height: targetHeight, get disposed() { return disposed }, dispose }
  } catch (error) { dispose(); throw error }
}

/** JS가 늦어져도 경과 시간으로 장면을 골라 원본과 효과가 같은 장면을 사용한다. */
export function createStickerPlayer(clip, show, { now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
  const duration = clip.frames.reduce((sum, f) => sum + f.duration, 0)
  const cycles = clip.loopCount === 0 ? Infinity : clip.loopCount == null ? 1 : clip.loopCount + 1
  let timer, started = 0, elapsed = 0, running = false
  const tick = () => {
    if (!running) return
    elapsed = Math.max(0, now() - started)
    if (elapsed >= duration * cycles) { show(clip.frames.length - 1); running = false; return }
    const time = elapsed % duration
    let end = 0
    for (let index = 0; index < clip.frames.length; index++) {
      end += clip.frames[index].duration
      if (time < end) { show(index); timer = schedule(tick, Math.max(1, end - time)); break }
    }
  }
  return {
    play() { if (!running) { running = true; started = now() - elapsed; tick() } },
    pause() { if (running) elapsed = Math.max(0, now() - started); running = false; cancel(timer) },
    stop() { running = false; cancel(timer); elapsed = 0 },
  }
}

export function createStickerPlaybackCache(load) {
  const entries = new Map()
  return {
    acquire(key, source) {
      let entry = entries.get(key)
      if (!entry) {
        entry = { refs: 0, controller: new AbortController(), clip: null }
        entry.promise = Promise.resolve().then(() => load(source, entry.controller.signal)).then((clip) => {
          entry.clip = clip
          if (!entry.refs) clip.dispose()
          return clip
        })
        entries.set(key, entry)
      }
      entry.refs++
      let released = false
      return { promise: entry.promise, release() {
        if (released) return
        released = true
        if (--entry.refs === 0) {
          if (entries.get(key) === entry) entries.delete(key)
          entry.controller.abort()
          entry.clip?.dispose()
        }
      } }
    },
  }
}
