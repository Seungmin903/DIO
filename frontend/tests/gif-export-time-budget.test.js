import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { GifReader } from 'omggif'
import * as gifExport from '../src/editor/utils/gifExport.js'
import * as mediaReferences from '../src/editor/utils/mediaReferences.js'
import { PageExportError } from '../src/editor/utils/pageExport.js'

// createPageGif 를 기기 입출력 없이 돌려, 느린 기기에서 1분 예산(GIF_TIME_BUDGET)에 맞춰 장면을 줄이는지 본다.
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const love = new Uint8Array(readFileSync(new URL('./fixtures/gifs/n-love.gif', import.meta.url)))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/utils/createPageGif.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

function load(clock) {
  const PAGE = 100
  const mocks = {
    '../services/mediaStore': { mediaService: { get: async () => ({ blob: love }) } },
    './mediaReferences.js': mediaReferences,
    '../stickerAssets': { isAnimatedMedia: (o) => o.id === 'gif' },
    './exportImage': { readLegacyExportImage: async () => ({ blob: love }) },
    './preparePageExport': { preparePageExport: async (snapshot) => ({ ...snapshot, dispose() {} }) },
    './pageExport.js': { PageExportError },
    './gifExport.js': gifExport,
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
  const snapshot = { width: PAGE, height: PAGE, pixelWidth: PAGE, pixelHeight: PAGE, objects: [{ id: 'gif', type: 'sticker', mediaFileId: 'm1', x: 0, y: 0, w: PAGE, h: PAGE }] }
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
