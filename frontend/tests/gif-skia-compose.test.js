import test from 'node:test'
import assert from 'node:assert/strict'
import { composeFrame, planLayers } from '../src/editor/utils/gifLayers.js'
import { createSkiaComposer } from '../src/editor/utils/gifSkiaCompose.js'
import { loadCanvasKitSkia } from './support/canvasKitSkia.js'

// 페이지 GIF 장면을 Skia 로 합친 것이 JS 합성(composeFrame)과 같은 그림인지 본다 (Node 에서는 CanvasKit 위의 Skia)

const runtime = await loadCanvasKitSkia()
const skip = runtime ? false : 'canvaskit-wasm 을 불러오지 못함'

const W = 240, H = 160, ratio = { x: 1.5, y: 1.5 } // 페이지 160×≈107 단위를 1.5배로
// 바탕: 줄무늬 종이(불투명)
const base = new Uint8Array(W * H * 4)
for (let i = 0; i < W * H; i++) base.set((i % W) % 12 < 2 ? [40, 60, 90, 255] : [250, 244, 230, 255], i * 4)
// 사이 층: 반투명 띠 하나 (나머지는 투명)
const middle = new Uint8Array(W * H * 4)
for (let y = 60; y < 80; y++) for (let x = 0; x < W; x++) middle.set([200, 30, 30, 128], (y * W + x) * 4)
// GIF 장면: 대각선 그라데이션, 모서리는 투명
const frame = (shift) => {
  const w = 32, h = 24, rgba = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const corner = (x < 4 && y < 4) || (x >= w - 4 && y >= h - 4)
    rgba.set([(x * 8 + shift) & 255, y * 10, 255 - x * 6, corner ? 0 : 255], (y * w + x) * 4)
  }
  return { rgba, width: w, height: h }
}
const objects = [
  { id: 's', type: 'sticker', mediaFileId: 'a', x: 20, y: 15, w: 50, h: 30, rotation: 20, flipX: true },
  { id: 'line', type: 'text', x: 0, y: 40, w: 160, h: 14 },
  { id: 'p', type: 'photo', frame: 'shape', shape: 'round', mediaFileId: 'b', x: 80, y: 20, w: 40, h: 40, rotation: -35, opacity: 0.6, imageWidth: 32, imageHeight: 24, crop: { zoom: 1.3, fx: 0.3, fy: 0.6 } },
  { id: 'c', type: 'photo', frame: 'shape', shape: 'circle', mediaFileId: 'c', x: 110, y: 60, w: 36, h: 30, flipY: true, imageWidth: 32, imageHeight: 24, crop: { zoom: 1, fx: 0.5, fy: 0.5 } },
]
const gifIds = new Set(['s', 'p', 'c'])
const segments = planLayers(objects, (o) => gifIds.has(o.id))
const layers = segments.filter((s) => s.kind === 'layer').map((l) => l.role === 'base' ? base : l.objects.length ? middle : null)
const frames = { s: frame(0), p: frame(90), c: frame(170) }
const frameOf = (o) => ({ frame: frames[o.id], source: frames[o.id] })

const compare = (a, b) => {
  let sum = 0, far = 0
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; if (d > 24) far++ }
  return { mean: sum / a.length, farShare: far / a.length }
}

test('Skia 합성은 JS 합성과 같은 그림을 낸다 (회전 · 뒤집기 · 자르기 · 둥근 모서리 · 타원 · 불투명도 · 사이 층)', { skip }, () => {
  const composer = createSkiaComposer(runtime, { segments, layers, pageWidth: W, pageHeight: H, ratio, frameOf })
  try {
    for (const region of [{ x: 0, y: 0, width: W, height: H }, { x: 20, y: 10, width: 170, height: 120 }]) {
      const skia = composer.compose(region)
      const js = composeFrame({ segments, layers, region, pageWidth: W, ratio, frameOf })
      assert.equal(skia.length, js.length)
      const { mean, farShare } = compare(skia, js)
      // 가장자리 부드럽게 하기 · 쌍선형 샘플 위치만 조금 달라 경계 몇 화소만 차이 난다
      assert.ok(mean < 1.5, `평균 차이 ${mean}`)
      assert.ok(farShare < 0.01, `크게 다른 화소 ${(farShare * 100).toFixed(2)}%`)
    }
  } finally { composer.dispose() }
})

test('Skia 합성은 장면이 바뀌면 바뀐 장면을 그린다', { skip }, () => {
  const composer = createSkiaComposer(runtime, { segments, layers, pageWidth: W, pageHeight: H, ratio, frameOf })
  try {
    const region = { x: 0, y: 0, width: W, height: H }
    const first = composer.compose(region).slice()
    frames.s = frame(128)
    const second = composer.compose(region)
    assert.ok(compare(first, second).mean > 0.1)
    const js = composeFrame({ segments, layers, region, pageWidth: W, ratio, frameOf })
    assert.ok(compare(second, js).mean < 1.5)
  } finally { composer.dispose(); frames.s = frame(0) }
})
