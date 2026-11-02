import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import UPNG from 'upng-js'
import { GifWriter } from 'omggif'
import { decodeGifFrames, gifFrameDelays } from '../src/editor/utils/gifExport.js'
import { createStickerPlaybackCache, createStickerPlayer, playbackGifBytes, playbackSteps, prepareStickerPlayback } from '../src/editor/utils/stickerPlayback.js'

const gif = new Uint8Array(readFileSync(new URL('./fixtures/gifs/n-love.gif', import.meta.url)))
const noYield = async () => {}
test('움직이는 GIF 표본 모두 PNG 장면으로 준비되고 원본을 변경하지 않는다', async () => {
  const directory = new URL('./fixtures/gifs/', import.meta.url)
  const files = readdirSync(directory).filter((name) => name.endsWith('.gif'))
  assert.equal(files.length, 2)
  for (const name of files) {
    const bytes = new Uint8Array(readFileSync(new URL(name, directory))), original = bytes.slice()
    let pixels = 0, disposed = 0, count = 0
    const clip = await prepareStickerPlayback(bytes, (rgba, w, h) => {
      const png = UPNG.encode([rgba.slice().buffer], w, h, 0)
      assert.equal(UPNG.decode(png).width, w, name)
      pixels += w * h; count++
      return { uri: `${name}:${count}`, dispose() { disposed++ } }
    }, { yieldFrame: noYield })
    assert.ok(clip.frames.length > 1, name)
    assert.ok(pixels <= 2 * 1024 * 1024, name)
    assert.deepEqual(bytes, original, name)
    clip.dispose()
    assert.equal(disposed, count, name)
  }
})

test('GIF 종료자 대신 이어진 헤더는 블록 경계에서만 정규화한다', () => {
  const bytes = new Uint8Array(readFileSync(new URL('./fixtures/gifs/n-glowstar.gif', import.meta.url)))
  const fixed = playbackGifBytes(bytes)
  assert.notEqual(fixed, bytes)
  assert.equal(fixed.at(-1), 0x3b)
  assert.ok(fixed.length < bytes.length)
  assert.deepEqual(fixed.subarray(0, -1), bytes.subarray(0, fixed.length - 1))
  assert.equal(playbackGifBytes(gif), gif)
})
test('GIF 장면은 기존 합성 결과와 같고 단일 소스로 투명 윤곽과 본체를 표시한다', async () => {
  const expected = new Map(), resources = []
  const delays = gifFrameDelays(gif)
  decodeGifFrames(gif, new Set(delays.map((_, i) => i)), (i, rgba) => expected.set(i, rgba.slice()))
  const clip = await prepareStickerPlayback(gif, (pixels, width, height) => {
    const resource = { uri: `frame:${resources.length}`, pixels: pixels.slice(), width, height, disposed: 0, dispose() { this.disposed++ } }
    resources.push(resource)
    return resource
  }, { limits: { frames: 1000, side: 4096, pixels: 1e9 }, yieldFrame: noYield })
  assert.equal(clip.frames.length, delays.length)
  assert.deepEqual(clip.frames.map((f) => f.duration), delays)
  resources.forEach((r, i) => assert.deepEqual(r.pixels, expected.get(i)))
  assert.ok(resources[0].pixels.some((a, i) => i % 4 === 3 && a === 0))
  clip.dispose(); clip.dispose()
  assert.equal(clip.disposed, true)
  assert.ok(resources.every((r) => r.disposed === 1))
})

test('프리뷰 프레임·픽셀 상한을 지키고 전체 재생 시간은 보존한다', async () => {
  const delays = Array.from({ length: 180 }, (_, i) => i % 2 ? 40 : 100)
  const steps = playbackSteps(delays)
  assert.ok(steps.length <= 60)
  assert.ok(Math.abs(steps.reduce((sum, s) => sum + s.duration, 0) - delays.reduce((sum, d) => sum + d, 0)) < 0.001)
  let pixels = 0
  const clip = await prepareStickerPlayback(gif, (_rgba, w, h) => { pixels += w * h; return { uri: `${pixels}`, dispose() {} } },
    { limits: { frames: 5, side: 64, pixels: 10000 }, yieldFrame: noYield })
  assert.ok(pixels <= 10000)
  assert.ok(Math.max(clip.width, clip.height) <= 64)
  assert.ok(clip.frames.length <= 5)
  clip.dispose()
})

test('긴 GIF는 샘플링 후에도 원본 마지막 장면과 종료 시간을 보존한다', async () => {
  for (const loop of [undefined, 1]) {
    const output = new Uint8Array(16384)
    const writer = new GifWriter(output, 1, 1, { palette: [0xff0000, 0x0000ff], ...(loop == null ? {} : { loop }) })
    for (let i = 0; i < 120; i++) writer.addFrame(0, 0, 1, 1, Uint8Array.of(i === 119 ? 1 : 0), { delay: i === 119 ? 1 : 10 })
    const bytes = output.slice(0, writer.end()), resources = []
    const clip = await prepareStickerPlayback(bytes, (rgba) => {
      const uri = `f${resources.length}`
      resources.push(rgba.slice())
      return { uri, dispose() {} }
    }, { yieldFrame: noYield })
    assert.ok(clip.frames.length <= 60)
    const duration = gifFrameDelays(bytes).reduce((sum, d) => sum + d, 0)
    assert.ok(Math.abs(clip.frames.reduce((sum, f) => sum + f.duration, 0) - duration) < 0.001)
    assert.equal(clip.frames.at(-1).duration, gifFrameDelays(bytes).at(-1))
    let time = 0, tick, shown
    const player = createStickerPlayer(clip, (index) => { shown = index }, {
      now: () => time, schedule: (callback) => { tick = callback; return 1 }, cancel() {},
    })
    player.play()
    time = duration * (loop == null ? 1 : loop + 1)
    tick()
    assert.deepEqual(resources[Number(clip.frames[shown].source.uri.slice(1))], Uint8Array.of(0, 0, 255, 255))
    player.stop(); clip.dispose()
  }
  assert.deepEqual(playbackSteps([100, 100, 10], 1), [{ index: 2, duration: 210 }])
})

test('GIF disposal 2/3와 투명한 장면은 이전 잔상을 남기지 않는다', async () => {
  const output = new Uint8Array(4096), writer = new GifWriter(output, 3, 1, { palette: [0, 0xff0000, 0x00ff00, 0x0000ff], loop: 0 })
  writer.addFrame(0, 0, 1, 1, Uint8Array.of(1), { delay: 10, disposal: 1, transparent: 0 })
  writer.addFrame(1, 0, 1, 1, Uint8Array.of(2), { delay: 10, disposal: 3, transparent: 0 })
  writer.addFrame(2, 0, 1, 1, Uint8Array.of(3), { delay: 10, disposal: 2, transparent: 0 })
  writer.addFrame(1, 0, 1, 1, Uint8Array.of(0), { delay: 10, disposal: 1, transparent: 0 })
  const frames = []
  const clip = await prepareStickerPlayback(output.slice(0, writer.end()), (rgba) => { frames.push(rgba.slice()); return { uri: `f${frames.length}`, dispose() {} } }, { yieldFrame: noYield })
  assert.equal(frames[1][7], 255) // 임시 초록
  assert.equal(frames[2][7], 0) // disposal 3 복원
  assert.equal(frames[2][11], 255) // 파랑
  assert.equal(frames[3][11], 0) // disposal 2 지우기
  assert.equal(frames[3][3], 255) // 첫 빨강은 유지
  clip.dispose()
})

test('취소와 PNG 생성 실패는 이미 만든 임시 자원을 모두 해제한다', async () => {
  for (const failure of ['cancel', 'encode']) {
    const controller = new AbortController(), disposed = []
    let count = 0
    await assert.rejects(prepareStickerPlayback(gif, () => {
      if (failure === 'encode' && count === 1) throw new Error('encode failed')
      const index = count++
      return { uri: `f${index}`, dispose: () => disposed.push(index) }
    }, { signal: controller.signal, yieldFrame: async () => { if (failure === 'cancel') controller.abort() } }))
    assert.equal(disposed.length, count)
  }
})

test('복제한 스티커는 자원을 공유하고 마지막 참조 해제·늦은 완료 시 정리한다', async () => {
  let loads = 0, disposed = 0, resolve
  const cache = createStickerPlaybackCache(() => { loads++; return new Promise((done) => { resolve = done }) })
  const a = cache.acquire('same', {}), b = cache.acquire('same', {})
  await Promise.resolve()
  assert.equal(loads, 1)
  a.release(); a.release()
  resolve({ dispose: () => disposed++ })
  await b.promise
  assert.equal(disposed, 0)
  b.release()
  assert.equal(disposed, 1)
  const c = cache.acquire('same', {})
  await Promise.resolve()
  c.release()
  resolve({ dispose: () => disposed++ })
  await c.promise
  assert.equal(loads, 2)
  assert.equal(disposed, 2)
})

test('공유 GIF 실패를 잠시 캐시하고 재시도 성공을 다른 복제본에도 전파한다', async () => {
  let loads = 0, disposed = 0, expireFailure
  const cache = createStickerPlaybackCache(async () => {
    if (++loads === 1) throw new Error('temporary failure')
    return { dispose() { disposed++ } }
  }, { failureTtlMs: 3000, schedule: (callback, delay) => { assert.equal(delay, 3000); expireFailure = callback; return 1 }, cancel() {} })
  const a = cache.acquire('same', {}), b = cache.acquire('same', {})
  await Promise.all([assert.rejects(a.promise, /temporary failure/), assert.rejects(b.promise, /temporary failure/)])
  const unsubscribe = cache.subscribe('same', (promise) => {
    if (promise !== b.promise) sibling = cache.acquire('same', {})
  })
  let sibling
  const repeated = cache.acquire('same', {})
  await assert.rejects(repeated.promise, /temporary failure/)
  repeated.release()
  assert.equal(loads, 1)
  a.release()
  expireFailure()
  const retry = cache.acquire('same', {})
  const clip = await retry.promise
  assert.equal(loads, 2)
  assert.equal(await sibling.promise, clip)
  unsubscribe()
  b.release() // 과거 실패 참조가 새 캐시를 삭제하면 안 된다.
  const duplicate = cache.acquire('same', {})
  assert.equal(await duplicate.promise, clip)
  assert.equal(loads, 2)
  retry.release(); sibling.release()
  assert.equal(disposed, 0)
  duplicate.release()
  assert.equal(disposed, 1)
})

test('취소된 과거 요청이 늦게 실패해도 진행 중인 재시도 캐시는 유지한다', async () => {
  let loads = 0, rejectOld
  const cache = createStickerPlaybackCache(() => {
    loads++
    if (loads === 1) return new Promise((_resolve, reject) => { rejectOld = reject })
    return { dispose() {} }
  })
  const old = cache.acquire('same', {})
  const rejected = assert.rejects(old.promise, /cancelled/)
  await Promise.resolve()
  old.release()
  const retry = cache.acquire('same', {})
  const clip = await retry.promise
  rejectOld(new Error('cancelled'))
  await rejected
  const duplicate = cache.acquire('same', {})
  assert.equal(await duplicate.promise, clip)
  assert.equal(loads, 2)
  retry.release(); duplicate.release()
})

test('단일 시계는 느린 콜백에서도 같은 프레임으로 이동하고 배경 정지·반복 횟수를 지킨다', () => {
  let time = 0, tick, cancelled = 0
  const shown = [], clip = { frames: [{ duration: 100 }, { duration: 200 }], loopCount: 0 }
  const clock = { now: () => time, schedule: (callback) => { tick = callback; return 1 }, cancel: () => cancelled++ }
  const player = createStickerPlayer(clip, (index) => shown.push(index), clock)
  player.play()
  time = 250; tick()
  assert.deepEqual(shown, [0, 1])
  player.pause(); time = 1000; player.play()
  assert.equal(shown.at(-1), 1)
  time = 1060; tick()
  assert.equal(shown.at(-1), 0)
  player.stop()
  assert.ok(cancelled >= 2)
  const once = createStickerPlayer({ ...clip, loopCount: null }, (index) => shown.push(index), clock)
  once.play(); time += 1000; tick()
  assert.equal(shown.at(-1), 1)
  once.stop()
})
