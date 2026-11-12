import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { GifReader } from 'omggif'
import * as gifExport from '../src/editor/utils/gifExport.js'
import * as gifLayers from '../src/editor/utils/gifLayers.js'
import * as mediaReferences from '../src/editor/utils/mediaReferences.js'
import { PageExportError } from '../src/editor/utils/pageExport.js'

// createPageGif 를 기기 입출력 없이 돌려, 층 합성(페이지를 몇 번만 찍기)과 예전 방식(장면마다 찍기)을 확인한다.
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const love = new Uint8Array(readFileSync(new URL('./fixtures/gifs/n-love.gif', import.meta.url)))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/utils/createPageGif.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const full = gifExport.planGifTimeline([gifExport.gifFrameDelays(love)])
const fullDuration = full.steps.reduce((sum, s) => sum + s.delay, 0) * 10

// layered: false 면 GIF 스티커에 테두리를 달아 층 합성 대신 예전 방식(장면마다 찍기)으로 만들게 한다. area: GIF 스티커 자리
function load({ layered = true, objects, area = { x: 0, y: 0, w: 100, h: 100 } } = {}) {
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
    './gifExport.js': gifExport,
    './gifFileIO': {
      readBytes: async (blob) => blob,
      pngResource: () => ({ uri: 'file:///frame.png', dispose() {} }),
      // 찍은 장면: 페이지 크기 RGBA (shade 색으로 채운다)
      captureRgba: async (result) => new Uint8Array(result.width * result.height * 4).fill(result.shade ?? 255),
      gifResult: (bytes) => ({ bytes, dispose() {} }),
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => mocks[id], module, module.exports)
  const gif = { id: 'gif', type: 'sticker', mediaFileId: 'm1', ...area, ...(layered ? {} : { outline: true }) }
  const snapshot = { width: PAGE, height: PAGE, pixelWidth: PAGE, pixelHeight: PAGE, objects: objects ?? [gif] }
  return { createPageGif: module.exports.createPageGif, snapshot }
}

const shot = (frame, shade = 255) => ({ width: frame.pixelWidth, height: frame.pixelHeight, shade, dispose() {} })
const lastFramePixels = (bytes) => {
  const gif = new GifReader(bytes), pixels = new Uint8Array(gif.width * gif.height * 4)
  for (let i = 0; i < gif.numFrames(); i++) gif.decodeAndBlitFrameRGBA(i, pixels)
  return pixels
}

test('층 합성: 페이지는 바탕 층 한 번만 찍고, 장면은 GIF 를 끼워 합쳐 모두 만든다', async () => {
  const { createPageGif, snapshot } = load()
  const frames = []
  const output = await createPageGif(snapshot, { renderFrame: async (frame) => { frames.push(frame); return shot(frame) } })
  assert.equal(frames.length, 1)
  assert.equal(frames[0].layer, 'base')
  assert.deepEqual(frames[0].objects, []) // GIF 는 찍지 않는다
  assert.equal(output.frames, full.steps.length)
  assert.equal(output.duration, fullDuration)
  assert.equal(output.reduced, undefined) // 장면을 줄이지 않는다
  // 흰 바탕 위에 GIF 장면이 그려졌다
  const pixels = lastFramePixels(output.bytes)
  let colored = 0
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 200 || pixels[i + 1] < 200 || pixels[i + 2] < 200) colored++
  assert.ok(colored > 100, `색칠된 픽셀 ${colored}`)
  assert.ok(new GifReader(output.bytes).numFrames() > 1)
})

test('층 합성: GIF 위에 있는 요소는 투명 바탕의 맨 위 층으로 따로 찍어 덮는다', async () => {
  const note = { id: 'note', type: 'text', text: '안녕', x: 10, y: 10, w: 50, h: 20, baseWidth: 50 }
  const below = { id: 'paper', type: 'shape', x: 0, y: 0, w: 100, h: 100 }
  const gif = { id: 'gif', type: 'sticker', mediaFileId: 'm1', x: 0, y: 0, w: 100, h: 100 }
  const { createPageGif, snapshot } = load({ objects: [below, gif, note] })
  const frames = []
  // 맨 위 층은 투명(알파 0)으로 돌려준다
  const output = await createPageGif(snapshot, { renderFrame: async (frame) => { frames.push(frame); return shot(frame, frame.layer === 'top' ? 0 : 255) } })
  assert.deepEqual(frames.map((f) => [f.layer, f.objects.map((o) => o.id)]), [['base', ['paper']], ['top', ['note']]])
  assert.ok(new GifReader(output.bytes).numFrames() > 1)
})

test('층 합성: 일부만 움직이는 페이지도 바탕 층 한 번만 찍고, 둘째 장면부터는 움직이는 사각형만 바뀐다', async () => {
  const { createPageGif, snapshot } = load({ area: { x: 10, y: 10, w: 20, h: 20 } })
  const frames = []
  const output = await createPageGif(snapshot, { renderFrame: async (frame) => { frames.push(frame); return shot(frame) } })
  assert.deepEqual(frames.map((f) => f.layer), ['base'])
  assert.equal(output.frames, full.steps.length)
  const gif = new GifReader(output.bytes)
  assert.deepEqual([gif.width, gif.height], [100, 100])
  for (let i = 1; i < gif.numFrames(); i++) {
    const info = gif.frameInfo(i)
    assert.ok(info.x >= 0 && info.x + info.width <= 100 && info.width < 100, `장면 ${i} 폭 ${info.width}`)
  }
})

test('층 합성이 실패하면 예전 방식(장면마다 찍기)으로 다시 만든다', async () => {
  const { createPageGif, snapshot } = load()
  const frames = []
  const renderFrame = async (frame) => {
    frames.push(frame)
    if (frame.layer) throw new Error('transparent capture unsupported')
    return shot(frame, (frames.length * 37) % 256)
  }
  const output = await createPageGif(snapshot, { renderFrame })
  assert.equal(frames[0].layer, 'base')
  assert.ok(frames.slice(1).every((f) => !f.layer))
  assert.ok(frames.length > 2)
  assert.equal(output.frames, full.steps.length)
})

test('예전 방식: 합치기로 못 그리는 GIF(테두리 등)는 장면마다 찍고, 일부만 움직이면 사각형만 찍는다', async () => {
  const { createPageGif, snapshot } = load({ layered: false, area: { x: 10, y: 10, w: 20, h: 20 } })
  const frames = []
  const output = await createPageGif(snapshot, { renderFrame: async (frame) => { frames.push(frame); return shot(frame, (frames.length * 40) % 256) } })
  assert.ok(frames.every((f) => !f.layer))
  assert.ok(frames[1].region, '두 번째부터는 사각형만 찍는다')
  assert.ok(frames[1].pixelWidth < 100 && frames[1].pixelHeight < 100)
  const unique = new Set(full.steps.map((s) => s.indices.join(','))).size
  assert.equal(frames.length, unique + 1) // 첫 장면 전체 + 장면 조합마다 사각형
  assert.equal(output.duration, fullDuration)
  assert.equal(new GifReader(output.bytes).numFrames(), output.frames)
})
