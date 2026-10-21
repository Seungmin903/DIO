import { GifReader, GifWriter } from 'omggif'
import { PageExportError } from './pageExport.js'

// 페이지 GIF: 페이지 속 움직이는 GIF 들의 장면을 같은 시간축에 놓고, 장면이 바뀔 때마다 페이지를 한 장씩 찍어 이어 붙인다.
export const GIF_LIMITS = { frames: 40, duration: 6000, minStep: 60, bytes: 50 * 1024 * 1024, pixels: 8000000 }

// 브라우저처럼 0·1(1/100초) 지연은 0.1초로 본다
const frameDelay = (centiseconds) => (centiseconds < 2 ? 10 : centiseconds) * 10

function readGif(bytes) {
  if (!bytes?.length || bytes.length > GIF_LIMITS.bytes) throw new PageExportError('EXPORT_GIF_TOO_LARGE', 'GIF는 50MiB 이내에서 내보낼 수 있어요.')
  let reader
  try { reader = new GifReader(bytes) }
  catch (error) { throw new PageExportError('EXPORT_GIF_DECODE_FAILED', 'GIF를 읽지 못했어요. 원본을 확인해 주세요.', error) }
  if (reader.width * reader.height > GIF_LIMITS.pixels) throw new PageExportError('EXPORT_GIF_TOO_LARGE', 'GIF는 800만 화소 이내에서 내보낼 수 있어요.')
  return reader
}

/** 장면별 보여 주는 시간(ms). 장면을 풀지 않고 머리말만 읽는다 */
export function gifFrameDelays(bytes) {
  const reader = readGif(bytes)
  return Array.from({ length: reader.numFrames() }, (_, i) => frameDelay(reader.frameInfo(i).delay))
}

/**
 * 여러 GIF 의 시간축을 하나로 맞춘다. 가장 긴 GIF 한 바퀴(최대 6초)를 일정 간격으로 나누고,
 * 각 시점에 GIF 마다 몇 번째 장면인지 적는다. 앞과 같은 장면 조합이면 앞 프레임을 그만큼 더 보여 준다.
 * 반환: steps [{ indices, delay(1/100초) }], needed: GIF 마다 실제로 쓰는 장면 번호
 */
export function planGifTimeline(delayLists, limits = GIF_LIMITS) {
  const totals = delayLists.map((delays) => delays.reduce((sum, d) => sum + d, 0))
  const duration = Math.min(limits.duration, Math.max(...totals))
  const shortest = Math.min(...delayLists.flatMap((delays) => delays))
  const step = Math.max(limits.minStep, shortest, duration / limits.frames)
  const count = Math.max(1, Math.round(duration / step))
  const indexAt = (delays, total, time) => {
    let t = time % total
    for (let i = 0; i < delays.length; i++) { if (t < delays[i]) return i; t -= delays[i] }
    return delays.length - 1
  }
  const steps = []
  for (let k = 0; k < count; k++) {
    const indices = delayLists.map((delays, g) => indexAt(delays, totals[g], k * step))
    // 1/100초 단위로 반올림한 누적 시각의 차이라 오래 돌아도 밀리지 않는다
    const delay = Math.round((k + 1) * step / 10) - Math.round(k * step / 10)
    const last = steps.at(-1)
    if (last && last.indices.every((n, g) => n === indices[g])) last.delay += delay
    else steps.push({ indices, delay })
  }
  return { steps, needed: delayLists.map((_, g) => new Set(steps.map((s) => s.indices[g]))) }
}

/**
 * 장면을 처음부터 차례로 합성해(장면 처리 방식 disposal 반영) 필요한 장면만 onFrame(index, rgba, width, height) 으로 넘긴다.
 * rgba 는 다음 장면에서 덮어쓰므로 onFrame 안에서 바로 써야 한다.
 */
export function decodeGifFrames(bytes, needed, onFrame) {
  const reader = readGif(bytes)
  const { width, height } = reader
  const canvas = new Uint8Array(width * height * 4)
  const last = Math.max(...needed)
  try {
    for (let i = 0; i <= last && i < reader.numFrames(); i++) {
      const info = reader.frameInfo(i)
      const saved = info.disposal === 3 ? canvas.slice() : null
      reader.decodeAndBlitFrameRGBA(i, canvas)
      if (needed.has(i)) onFrame(i, canvas, width, height)
      if (info.disposal === 2) {
        for (let y = info.y; y < Math.min(height, info.y + info.height); y++) canvas.fill(0, (y * width + info.x) * 4, (y * width + Math.min(width, info.x + info.width)) * 4)
      } else if (saved) canvas.set(saved)
    }
  } catch (error) {
    if (error instanceof PageExportError) throw error
    throw new PageExportError('EXPORT_GIF_DECODE_FAILED', 'GIF 장면을 읽지 못했어요. 원본을 확인해 주세요.', error)
  }
}

const TRANSPARENT = 255
const binOf = (rgba, i) => (rgba[i] >> 3) << 10 | (rgba[i + 1] >> 3) << 5 | rgba[i + 2] >> 3

/**
 * 찍은 페이지 장면들을 GIF 로 묶는다. 1단계: 모든 장면의 색을 모아(addColors) 255색 팔레트를 만든다(median cut).
 * 2단계: 장면마다 팔레트 번호로 바꾸고, 앞 장면과 달라진 사각형만 저장한다(나머지는 투명 → 앞 장면이 그대로 보임).
 * 첫 장면은 페이지 전체, 그다음부터는 움직이는 곳만 찍은 사각형(rect: { x, y, width, height }, rgba 는 그 크기)을 받을 수 있다.
 */
export function createGifAssembler(width, height) {
  const histogram = new Uint32Array(32768)
  let palette = null, lut = null, writer = null, previous = null, pending = null
  const chunks = []
  let scratch = null

  const buildPalette = () => {
    const channel = (bin, c) => c === 0 ? bin >> 10 : c === 1 ? bin >> 5 & 31 : bin & 31
    // 상자 안 색들이 평균색과 얼마나 다른지(픽셀 수 × 거리² 의 합). 이 값이 큰 상자부터 나눈다.
    // (픽셀 수나 색 범위만 따지면 글자 회색처럼 비슷한 색 옆에 붙은 색이 다른 색에 묻혀 버린다)
    const sse = (count, sum, square) => count ? square - sum * sum / count : 0
    const measure = (bins) => {
      let count = 0, error = 0
      const sum = [0, 0, 0], square = [0, 0, 0]
      for (const bin of bins) { const n = histogram[bin]; count += n; for (let c = 0; c < 3; c++) { const v = channel(bin, c); sum[c] += v * n; square[c] += v * v * n } }
      for (let c = 0; c < 3; c++) error += sse(count, sum[c], square[c])
      return { bins, count, sum, square, error }
    }
    // 한 축으로 줄 세운 뒤 두 쪽 오차 합이 가장 작아지는 곳에서 자른다
    const split = (box) => {
      let best = null
      for (let axis = 0; axis < 3; axis++) {
        const bins = [...box.bins].sort((a, b) => channel(a, axis) - channel(b, axis))
        let count = 0
        const sum = [0, 0, 0], square = [0, 0, 0]
        for (let i = 0; i < bins.length - 1; i++) {
          const n = histogram[bins[i]]
          count += n
          for (let c = 0; c < 3; c++) { const v = channel(bins[i], c); sum[c] += v * n; square[c] += v * v * n }
          if (channel(bins[i], axis) === channel(bins[i + 1], axis)) continue
          let error = 0
          for (let c = 0; c < 3; c++) error += sse(count, sum[c], square[c]) + sse(box.count - count, box.sum[c] - sum[c], box.square[c] - square[c])
          if (!best || error < best.error) best = { error, bins, at: i + 1 }
        }
      }
      return best && [measure(best.bins.slice(0, best.at)), measure(best.bins.slice(best.at))]
    }
    const used = []
    for (let bin = 0; bin < 32768; bin++) if (histogram[bin]) used.push(bin)
    if (!used.length) { used.push(0); histogram[0] = 1 }
    let boxes = [measure(used)]
    while (boxes.length < 255) {
      const box = boxes.reduce((a, b) => b.error > a.error ? b : a)
      const halves = box.error > 0 && split(box)
      if (!halves) break
      boxes = boxes.filter((b) => b !== box).concat(halves)
    }
    boxes = boxes.map((box) => box.bins)
    palette = new Array(256).fill(0)
    const colors = boxes.map((box) => {
      let count = 0, r = 0, g = 0, b = 0, top = box[0]
      for (const bin of box) { const n = histogram[bin] || 1; count += n; r += (bin >> 10) * n; g += (bin >> 5 & 31) * n; b += (bin & 31) * n; if (histogram[bin] > histogram[top]) top = bin }
      // 한 색이 상자의 절반 넘게 차지하면(종이 흰색·글자 검정 등) 평균 대신 그 색을 그대로 쓴다
      if (histogram[top] * 2 > count) { r = top >> 10; g = top >> 5 & 31; b = top & 31; count = 1 }
      return [r, g, b].map((v) => Math.round(v / count * 255 / 31))
    })
    colors.forEach(([r, g, b], i) => { palette[i] = r << 16 | g << 8 | b })
    // 15비트 색 → 가장 가까운 팔레트 번호. 쓰는 색만 처음 나올 때 찾는다
    lut = new Int16Array(32768).fill(-1)
    lut.colors = colors
  }
  const nearest = (bin) => {
    const r = (bin >> 10) * 255 / 31, g = (bin >> 5 & 31) * 255 / 31, b = (bin & 31) * 255 / 31
    let best = 0, bestDistance = Infinity
    lut.colors.forEach(([pr, pg, pb], i) => {
      const d = (pr - r) ** 2 * 2 + (pg - g) ** 2 * 4 + (pb - b) ** 2 * 3
      if (d < bestDistance) { bestDistance = d; best = i }
    })
    lut[bin] = best
    return best
  }
  const flush = (last) => {
    if (!pending) return
    const { x, y, w, h, pixels, delay } = pending
    writer.setOutputBufferPosition(0)
    writer.addFrame(x, y, w, h, pixels, { delay, disposal: 1, transparent: pending.first ? undefined : TRANSPARENT })
    if (last) writer.end()
    chunks.push(scratch.slice(0, writer.getOutputBufferPosition()))
    pending = null
  }

  return {
    addColors(rgba) {
      if (palette) throw new Error('Palette already built')
      for (let i = 0; i < rgba.length; i += 4) histogram[binOf(rgba, i)]++
    },
    addFrame(rgba, delay, rect = { x: 0, y: 0, width, height }) {
      if (!palette) {
        buildPalette()
        scratch = new Uint8Array(width * height * 2 + 4096)
        writer = new GifWriter(scratch, width, height, { palette, loop: 0 })
        chunks.push(scratch.slice(0, writer.getOutputBufferPosition()))
      }
      const index = (i) => { const bin = binOf(rgba, i); return lut[bin] >= 0 ? lut[bin] : nearest(bin) }
      if (!previous) {
        if (rect.width !== width || rect.height !== height) throw new Error('First GIF frame must cover the page')
        previous = new Uint8Array(width * height)
        for (let p = 0; p < previous.length; p++) previous[p] = index(p * 4)
        pending = { x: 0, y: 0, w: width, h: height, pixels: previous.slice(), delay, first: true }
        return
      }
      // 사각형 안만 번호로 바꿔 앞 장면과 비교한다
      const indexed = new Uint8Array(rect.width * rect.height)
      let left = width, top = height, right = -1, bottom = -1
      for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
        const q = y * rect.width + x, n = indexed[q] = index(q * 4)
        if (n === previous[(rect.y + y) * width + rect.x + x]) continue
        const px = rect.x + x, py = rect.y + y
        if (px < left) left = px; if (px > right) right = px; if (py < top) top = py; bottom = py
      }
      // 달라진 곳이 없으면 앞 장면을 더 오래 보여 준다
      if (right < 0) { pending.delay += delay; return }
      flush(false)
      const w = right - left + 1, h = bottom - top + 1, pixels = new Uint8Array(w * h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = (top + y) * width + left + x, n = indexed[(top + y - rect.y) * rect.width + left + x - rect.x]
        pixels[y * w + x] = n === previous[p] ? TRANSPARENT : n
        previous[p] = n
      }
      pending = { x: left, y: top, w, h, pixels, delay }
    },
    end() {
      if (!pending) throw new Error('No GIF frames')
      flush(true)
      const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0))
      let offset = 0
      for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
      return out
    },
  }
}

/** RGBA 를 면적 평균으로 줄인다 (알파를 먼저 곱해 투명 가장자리가 어둡게 번지지 않게) */
export function downscaleRgba(rgba, width, height, targetWidth, targetHeight) {
  if (targetWidth >= width && targetHeight >= height) return { rgba, width, height }
  const out = new Uint8Array(targetWidth * targetHeight * 4)
  const sx = width / targetWidth, sy = height / targetHeight
  for (let y = 0; y < targetHeight; y++) for (let x = 0; x < targetWidth; x++) {
    const left = x * sx, right = (x + 1) * sx, top = y * sy, bottom = (y + 1) * sy
    let alpha = 0, red = 0, green = 0, blue = 0
    for (let iy = Math.floor(top); iy < Math.min(height, Math.ceil(bottom)); iy++) {
      const wy = Math.min(bottom, iy + 1) - Math.max(top, iy)
      for (let ix = Math.floor(left); ix < Math.min(width, Math.ceil(right)); ix++) {
        const weight = wy * (Math.min(right, ix + 1) - Math.max(left, ix)), i = (iy * width + ix) * 4, a = rgba[i + 3] * weight
        alpha += a; red += rgba[i] * a; green += rgba[i + 1] * a; blue += rgba[i + 2] * a
      }
    }
    const o = (y * targetWidth + x) * 4
    if (alpha > 0) { out[o] = Math.round(red / alpha); out[o + 1] = Math.round(green / alpha); out[o + 2] = Math.round(blue / alpha); out[o + 3] = Math.round(alpha / (sx * sy)) }
  }
  return { rgba: out, width: targetWidth, height: targetHeight }
}

/**
 * 움직이는 요소들이 차지하는 페이지 영역(회전·테두리·그림자 여유 포함)을 출력 픽셀 사각형으로.
 * 페이지 대부분이면 null (그때는 장면마다 페이지 전체를 찍는다)
 */
export function animatedRegion(objects, { width, height, pixelWidth, pixelHeight }) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const o of objects) {
    const angle = (o.rotation ?? 0) * Math.PI / 180, cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle))
    const halfW = (o.w * cos + o.h * sin) / 2, halfH = (o.w * sin + o.h * cos) / 2, cx = o.x + o.w / 2, cy = o.y + o.h / 2
    const margin = 6 + 0.2 * Math.max(o.w, o.h)
    left = Math.min(left, cx - halfW - margin); right = Math.max(right, cx + halfW + margin)
    top = Math.min(top, cy - halfH - margin); bottom = Math.max(bottom, cy + halfH + margin)
  }
  const rx = pixelWidth / width, ry = pixelHeight / height
  const x = Math.max(0, Math.floor(left * rx)), y = Math.max(0, Math.floor(top * ry))
  const x2 = Math.min(pixelWidth, Math.ceil(right * rx)), y2 = Math.min(pixelHeight, Math.ceil(bottom * ry))
  if (!(x2 > x && y2 > y) || (x2 - x) * (y2 - y) > pixelWidth * pixelHeight * 0.6) return null
  return { x, y, width: x2 - x, height: y2 - y }
}
