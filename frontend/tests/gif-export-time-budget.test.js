import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { GifReader } from 'omggif'
import * as gifExport from '../src/editor/utils/gifExport.js'
import * as gifLayers from '../src/editor/utils/gifLayers.js'
import * as mediaReferences from '../src/editor/utils/mediaReferences.js'
import { PageExportError } from '../src/editor/utils/pageExport.js'

// createPageGif 를 기기 입출력 없이 돌려, 느린 기기에서 1분 예산(GIF_TIME_BUDGET)에 맞춰 장면을 줄이는지 본다.
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const love = new Uint8Array(readFileSync(new URL('./fixtures/gifs/n-love.gif', import.meta.url)))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/utils/createPageGif.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

// layered: false 면 GIF 스티커에 테두리를 달아 층 합성 대신 예전 방식(장면마다 찍기)으로 만들게 한다
// area: GIF 스티커 자리, onDecode: 원본 GIF 장면 하나를 풀 때마다 (시간을 흘려 보내는 데 쓴다)
function load(clock, { layered = false, objects, area = { x: 0, y: 0, w: 100, h: 100 }, onDecode = () => {} } = {}) {
  const PAGE = 100
  const mocks = {
    './gifLayers.js': gifLayers,
    '../templates/packingLayout.js': { packingLayout: () => null },
    '../services/mediaStore': { mediaService: { get: async () => ({ blob: love }) } },
    './mediaReferences.js': mediaReferences,
    '../stickerAssets': { isAnimatedMedia: (o) => o.id === 'gif' },
    './exportImage': { readLegacyExportImage: async () => ({ blob: love }) },
    './preparePageExport': { preparePageExport: async (snapshot) => ({ ...snapshot, dispose() {} }) },
    './pageExport.js': { PageExportError },
    './gifExport.js': { ...gifExport, downscaleRgba: (...args) => { onDecode(); return gifExport.downscaleRgba(...args) } },
    './gifFileIO': {
      readBytes: async (blob) => blob,
      pngResource: () => ({ uri: 'file:///frame.png', dispose() {} }),
      // 찍은 장면: 페이지 크기 RGBA. 장면마다 색을 달리해 GIF 에서 합쳐지지 않게 한다
      captureRgba: async (result) => new Uint8Array(result.width * result.height * 4).fill(result.shade ?? 255),
      gifResult: (bytes) => ({ bytes, dispose() {} }),
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => mocks[id], module, module.exports)
  const gif = { id: 'gif', type: 'sticker', mediaFileId: 'm1', ...area, ...(layered ? {} : { outline: true }) }
  const snapshot = { width: PAGE, height: PAGE, pixelWidth: PAGE, pixelHeight: PAGE, objects: objects ?? [gif] }
  return { createPageGif: module.exports.createPageGif, snapshot, clock }
}

async function withClock(run) {
  const realNow = Date.now
  const clock = { now: 0 }
  Date.now = () => clock.now
  try { return await run(clock) } finally { Date.now = realNow }
}

test('장면 하나 찍는 데 오래 걸리면 1분 예산 안에 끝나도록 장면 수를 줄이고 알린다', () => withClock(async (clock) => {
  const { createPageGif, snapshot } = load(clock)
  let renders = 0
  // 느린 기기: 페이지 한 장 찍는 데 10초
  const renderFrame = async (frame) => { renders++; clock.now += 10000; return { width: frame.pixelWidth, height: frame.pixelHeight, shade: renders * 40, dispose() {} } }
  const output = await createPageGif(snapshot, { renderFrame })
  const full = gifExport.planGifTimeline([gifExport.gifFrameDelays(love)])
  assert.ok(new Set(full.steps.map((s) => s.indices.join(','))).size > 3)
  assert.equal(output.reduced, true)
  assert.ok(renders <= 4, `찍은 장면 ${renders}`)
  assert.ok(clock.now <= gifExport.GIF_TIME_BUDGET.total, `걸린 시간 ${clock.now}`)
  // 줄여도 GIF 재생 시간은 그대로
  assert.equal(output.duration, full.steps.reduce((sum, s) => sum + s.delay, 0) * 10)
  const gif = new GifReader(output.bytes)
  assert.equal(gif.width, 100)
  assert.ok(gif.numFrames() >= 2)
}))

test('빠르면 장면을 줄이지 않는다', () => withClock(async (clock) => {
  const { createPageGif, snapshot } = load(clock)
  const renderFrame = async (frame) => { clock.now += 50; return { width: frame.pixelWidth, height: frame.pixelHeight, dispose() {} } }
  const output = await createPageGif(snapshot, { renderFrame })
  const full = gifExport.planGifTimeline([gifExport.gifFrameDelays(love)])
  assert.equal(output.reduced, false)
  assert.equal(output.frames, full.steps.length)
}))

test('찍는 도중 시간이 계속 늘어나면 멈추고 찍은 장면만으로 묶는다', () => withClock(async (clock) => {
  const { createPageGif, snapshot } = load(clock)
  let renders = 0
  // 첫 장면은 빨랐는데 그다음부터 갑자기 느려진다 (예상이 빗나간 경우)
  const renderFrame = async (frame) => { clock.now += renders++ === 0 ? 100 : 15000; return { width: frame.pixelWidth, height: frame.pixelHeight, dispose() {} } }
  const output = await createPageGif(snapshot, { renderFrame })
  assert.equal(output.reduced, true)
  assert.ok(clock.now <= gifExport.GIF_TIME_BUDGET.captureStop + 15000, `걸린 시간 ${clock.now}`)
  assert.ok(new GifReader(output.bytes).numFrames() >= 1)
}))

const lastFramePixels = (bytes) => {
  const gif = new GifReader(bytes), pixels = new Uint8Array(gif.width * gif.height * 4)
  for (let i = 0; i < gif.numFrames(); i++) gif.decodeAndBlitFrameRGBA(i, pixels)
  return pixels
}

test('층 합성: 페이지는 바탕 층 한 번만 찍고, 장면은 GIF 를 끼워 합쳐 만든다 (느린 기기에서도 장면을 줄이지 않는다)', () => withClock(async (clock) => {
  const { createPageGif, snapshot } = load(clock, { layered: true })
  const frames = []
  // 페이지 한 장 찍는 데 10초 걸리는 느린 기기
  const renderFrame = async (frame) => { frames.push(frame); clock.now += 10000; return { width: frame.pixelWidth, height: frame.pixelHeight, shade: 255, dispose() {} } }
  const output = await createPageGif(snapshot, { renderFrame })
  const full = gifExport.planGifTimeline([gifExport.gifFrameDelays(love)])
  assert.equal(frames.length, 1)
  assert.equal(frames[0].layer, 'base')
  assert.deepEqual(frames[0].objects, []) // GIF 는 찍지 않는다
  assert.equal(output.reduced, false)
  assert.equal(output.frames, full.steps.length)
  assert.ok(clock.now <= 20000, `걸린 시간 ${clock.now}`)
  // 흰 바탕 위에 GIF 장면이 그려졌다
  const pixels = lastFramePixels(output.bytes)
  let colored = 0
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 200 || pixels[i + 1] < 200 || pixels[i + 2] < 200) colored++
  assert.ok(colored > 100, `색칠된 픽셀 ${colored}`)
  assert.ok(new GifReader(output.bytes).numFrames() > 1)
}))

test('층 합성: GIF 위에 있는 요소는 투명 바탕의 맨 위 층으로 따로 찍어 덮는다', () => withClock(async (clock) => {
  const note = { id: 'note', type: 'text', text: '안녕', x: 10, y: 10, w: 50, h: 20, baseWidth: 50 }
  const below = { id: 'paper', type: 'shape', x: 0, y: 0, w: 100, h: 100 }
  const gif = { id: 'gif', type: 'sticker', mediaFileId: 'm1', x: 0, y: 0, w: 100, h: 100 }
  const { createPageGif, snapshot } = load(clock, { layered: true, objects: [below, gif, note] })
  const frames = []
  const renderFrame = async (frame) => {
    frames.push(frame)
    // 맨 위 층은 투명(알파 0)으로 돌려준다 (가운데 한 점만 검정)
    if (frame.layer === 'top') return { width: frame.pixelWidth, height: frame.pixelHeight, shade: 0, dispose() {} }
    return { width: frame.pixelWidth, height: frame.pixelHeight, shade: 255, dispose() {} }
  }
  const output = await createPageGif(snapshot, { renderFrame })
  assert.deepEqual(frames.map((f) => [f.layer, f.objects.map((o) => o.id)]), [['base', ['paper']], ['top', ['note']]])
  assert.ok(new GifReader(output.bytes).numFrames() > 1)
}))

test('층 합성이 실패하면 예전 방식(장면마다 찍기)으로 다시 만든다', () => withClock(async (clock) => {
  const { createPageGif, snapshot } = load(clock, { layered: true })
  const frames = []
  const renderFrame = async (frame) => {
    frames.push(frame)
    if (frame.layer) throw new Error('transparent capture unsupported')
    return { width: frame.pixelWidth, height: frame.pixelHeight, shade: (frames.length * 37) % 256, dispose() {} }
  }
  const output = await createPageGif(snapshot, { renderFrame })
  assert.equal(frames[0].layer, 'base')
  assert.ok(frames.slice(1).every((f) => !f.layer))
  assert.ok(frames.length > 2)
  assert.ok(new GifReader(output.bytes).numFrames() >= 2)
}))

// GIF 가 페이지 일부만 차지하면 첫 장면만 전체를 찍고 나머지는 움직이는 사각형(rect)만 찍는다
const SMALL = { x: 10, y: 10, w: 20, h: 20 }

test('일부만 움직이는 페이지도 느리면 사각형 장면을 솎아 예산 안에 끝낸다', () => withClock(async (clock) => {
  const { createPageGif, snapshot } = load(clock, { area: SMALL })
  const frames = []
  // 느린 기기: 한 번 찍는 데 10초
  const renderFrame = async (frame) => { frames.push(frame); clock.now += 10000; return { width: frame.pixelWidth, height: frame.pixelHeight, shade: frames.length * 40, dispose() {} } }
  const output = await createPageGif(snapshot, { renderFrame })
  const full = gifExport.planGifTimeline([gifExport.gifFrameDelays(love)])
  assert.ok(frames[1].region, '두 번째부터는 사각형만 찍는다')
  assert.ok(frames[1].pixelWidth < 100 && frames[1].pixelHeight < 100)
  assert.equal(output.reduced, true)
  assert.ok(frames.length <= 5, `찍은 장면 ${frames.length}`)
  assert.ok(clock.now <= gifExport.GIF_TIME_BUDGET.total, `걸린 시간 ${clock.now}`)
  assert.equal(output.duration, full.steps.reduce((sum, s) => sum + s.delay, 0) * 10)
  const gif = new GifReader(output.bytes)
  assert.deepEqual([gif.width, gif.height], [100, 100])
  assert.equal(gif.numFrames(), output.frames)
}))

test('층 합성: 일부만 움직이는 페이지도 바탕 층 한 번만 찍고, 사각형 장면은 합쳐 만든다', () => withClock(async (clock) => {
  const { createPageGif, snapshot } = load(clock, { layered: true, area: SMALL })
  const frames = []
  const renderFrame = async (frame) => { frames.push(frame); clock.now += 10000; return { width: frame.pixelWidth, height: frame.pixelHeight, shade: 255, dispose() {} } }
  const output = await createPageGif(snapshot, { renderFrame })
  const full = gifExport.planGifTimeline([gifExport.gifFrameDelays(love)])
  assert.deepEqual(frames.map((f) => f.layer), ['base'])
  assert.equal(output.reduced, false)
  assert.equal(output.frames, full.steps.length)
  const gif = new GifReader(output.bytes)
  assert.deepEqual([gif.width, gif.height], [100, 100])
  // 둘째 장면부터는 움직이는 사각형 안만 바뀐다
  for (let i = 1; i < gif.numFrames(); i++) {
    const info = gif.frameInfo(i)
    assert.ok(info.x >= 0 && info.x + info.width <= 100 && info.width < 100, `장면 ${i} 폭 ${info.width}`)
  }
}))

test('일부만 움직이는 페이지에서 찍다가 멈추면 찍은 사각형 장면만으로 묶는다', () => withClock(async (clock) => {
  const { createPageGif, snapshot } = load(clock, { area: SMALL })
  let renders = 0
  // 첫 전체·첫 사각형은 빨랐는데 그다음부터 갑자기 느려진다
  const renderFrame = async (frame) => { clock.now += renders++ < 2 ? 100 : 15000; return { width: frame.pixelWidth, height: frame.pixelHeight, shade: renders * 30, dispose() {} } }
  const output = await createPageGif(snapshot, { renderFrame })
  assert.equal(output.reduced, true)
  assert.ok(clock.now <= gifExport.GIF_TIME_BUDGET.captureStop + 15000, `걸린 시간 ${clock.now}`)
  const gif = new GifReader(output.bytes)
  assert.equal(gif.numFrames(), output.frames)
  assert.ok(output.frames < gifExport.planGifTimeline([gifExport.gifFrameDelays(love)]).steps.length)
}))

test('장면을 푸는 데 decodeStop 을 넘기면 뒤 장면은 풀지 않고 앞 장면으로 대신한다', () => withClock(async (clock) => {
  // 장면 하나를 푸는 데 12초: 두 번째 장면을 풀고 나면 20초를 넘는다
  const { createPageGif, snapshot } = load(clock, { onDecode: () => { clock.now += 12000 } })
  const pngs = []
  const renderFrame = async (frame) => { pngs.push(frame.objects[0].src); clock.now += 50; return { width: frame.pixelWidth, height: frame.pixelHeight, shade: pngs.length * 40, dispose() {} } }
  const output = await createPageGif(snapshot, { renderFrame })
  const full = gifExport.planGifTimeline([gifExport.gifFrameDelays(love)])
  assert.equal(output.reduced, true)
  // 푼 두 장면만 찍는다 (풀지 못한 장면 자리는 앞 장면이 채운다)
  assert.equal(pngs.length, 2)
  assert.ok(pngs.every(Boolean))
  assert.equal(output.frames, 2)
  assert.equal(output.duration, full.steps.reduce((sum, s) => sum + s.delay, 0) * 10)
}))
