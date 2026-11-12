import test from 'node:test'
import assert from 'node:assert/strict'
import { blendLayer, composeFrame, drawGifObject, gifPlacement, layerDrawable, planLayers } from '../src/editor/utils/gifLayers.js'

// 페이지 GIF 층 합성: 장면을 요소 자리에 맞춰 픽셀로 끼워 넣는 계산이 화면(ObjectView)과 같은지 본다.

const RED = [255, 0, 0, 255], BLUE = [0, 0, 255, 255], WHITE = [255, 255, 255, 255]
const solid = (w, h, color) => { const rgba = new Uint8Array(w * h * 4); for (let i = 0; i < rgba.length; i += 4) rgba.set(color, i); return { rgba, width: w, height: h } }
// 왼쪽 절반 빨강, 오른쪽 절반 파랑
const halves = (w, h) => { const f = solid(w, h, RED); for (let y = 0; y < h; y++) for (let x = w / 2; x < w; x++) f.rgba.set(BLUE, (y * w + x) * 4); return f }
const page = (size, color = WHITE) => solid(size, size, color).rgba
const at = (rgba, width, x, y) => [...rgba.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)]
const draw = (object, frame, size = 40, source = frame) => {
  const dest = page(size)
  drawGifObject(dest, { x: 0, y: 0, width: size, height: size }, { x: 1, y: 1 }, object, frame, source)
  return dest
}
const sticker = (extra) => ({ id: 'g', type: 'sticker', mediaFileId: 'm', x: 10, y: 10, w: 20, h: 10, ...extra })
const photo = (extra) => ({ id: 'p', type: 'photo', frame: 'shape', shape: 'rect', mediaFileId: 'm', x: 10, y: 10, w: 10, h: 10, imageWidth: 2, imageHeight: 1, crop: { zoom: 1, fx: 0.5, fy: 0.5 }, ...extra })

test('스티커는 화면(StickerContent)처럼 crop 을 보지 않고 상자 안에 그대로 놓는다', () => {
  const plain = gifPlacement(sticker(), 40, 20)
  assert.deepEqual(gifPlacement(sticker({ crop: { zoom: 2, fx: 0.1, fy: 0.9 } }), 40, 20), plain)
  assert.deepEqual(plain.content, { x: 0, y: 0, width: 20, height: 10 })
})

test('합치기로 그릴 수 있는 GIF 만 층 합성을 쓴다', () => {
  assert.equal(layerDrawable(sticker()), true)
  assert.equal(layerDrawable(sticker({ outline: true })), false)
  assert.equal(layerDrawable(sticker({ shadow: true })), false)
  assert.equal(layerDrawable(sticker({ builtin: 'remote:a:b' })), false)
  assert.equal(layerDrawable(photo()), true)
  assert.equal(layerDrawable(photo({ shape: 'circle' })), true)
  assert.equal(layerDrawable(photo({ shape: 'heart' })), false) // SVG 경로로 자르는 모양
  assert.equal(layerDrawable(photo({ frame: 'polaroid' })), false)
  assert.equal(layerDrawable({ id: 't', type: 'tape', x: 0, y: 0, w: 10, h: 10 }), false)
})

test('요소를 GIF 사이사이 층으로 나누고, 찍을 층만 표시한다', () => {
  const isGif = (o) => o.gif
  const a = { id: 'a' }, b = { id: 'b' }, g1 = sticker({ id: 'g1', gif: true }), g2 = sticker({ id: 'g2', gif: true })
  const segments = planLayers([a, g1, g2, b], isGif)
  assert.deepEqual(segments.map((s) => s.kind === 'gif' ? s.object.id : `${s.role}:${s.objects.map((o) => o.id).join('')}:${s.capture}`),
    ['base:a:true', 'g1', 'middle::false', 'g2', 'top:b:true'])
  // 맨 위에 요소가 없어도 속지 앞 그림이 있으면 찍는다
  assert.equal(planLayers([g1], isGif, { hasFrontLayer: true }).at(-1).capture, true)
  assert.equal(planLayers([g1], isGif).at(-1).capture, false)
  // 합치기로 못 그리는 GIF 가 있거나 층이 너무 많으면 예전 방식
  assert.equal(planLayers([a, sticker({ id: 'x', gif: true, outline: true })], isGif), null)
  assert.equal(planLayers([a, g1, a, g2, a], isGif, { maxLayers: 2 }), null)
  assert.equal(planLayers([a, b], isGif), null)
})

test('스티커는 상자 안에 비율대로(contain) 가운데 놓인다', () => {
  // 20×10 상자에 정사각 장면 → 10×10 이 가로 가운데(15~25)
  const dest = draw(sticker(), solid(4, 4, RED))
  assert.deepEqual(at(dest, 40, 20, 15), RED)
  assert.deepEqual(at(dest, 40, 16, 12), RED)
  assert.deepEqual(at(dest, 40, 12, 15), WHITE) // 상자 안이지만 그림 밖
  assert.deepEqual(at(dest, 40, 27, 15), WHITE)
  assert.deepEqual(at(dest, 40, 20, 25), WHITE)
  // 원본 비율은 줄여 둔 장면이 아니라 원본 GIF 크기로 정한다
  const wide = draw(sticker(), solid(2, 2, RED), 40, { width: 40, height: 10 })
  assert.deepEqual(at(wide, 40, 11, 15), RED)
  // 배경 스티커는 늘인다
  const stretched = draw(sticker({ backdrop: true }), solid(4, 4, RED))
  assert.deepEqual(at(stretched, 40, 11, 11), RED)
})

test('뒤집기와 회전은 요소 가운데를 기준으로 한다', () => {
  const frame = halves(4, 4)
  const plain = draw(sticker({ w: 10, h: 10, x: 15, y: 15 }), frame)
  assert.deepEqual(at(plain, 40, 16, 20), RED)
  assert.deepEqual(at(plain, 40, 23, 20), BLUE)
  const flipped = draw(sticker({ w: 10, h: 10, x: 15, y: 15, flipX: true }), frame)
  assert.deepEqual(at(flipped, 40, 16, 20), BLUE)
  assert.deepEqual(at(flipped, 40, 23, 20), RED)
  // 시계 방향 90°: 왼쪽(빨강)이 위로 간다
  const turned = draw(sticker({ w: 10, h: 10, x: 15, y: 15, rotation: 90 }), frame)
  assert.deepEqual(at(turned, 40, 20, 16), RED)
  assert.deepEqual(at(turned, 40, 20, 23), BLUE)
  // 가로로 긴 상자(20×10, 가운데 20,20)를 90° 돌리면 세로로 선다: x 15~25, y 10~30
  const tall = draw(sticker({ x: 10, y: 15, w: 20, h: 10, rotation: 90 }), solid(4, 2, RED))
  assert.deepEqual(at(tall, 40, 20, 11), RED)
  assert.deepEqual(at(tall, 40, 20, 28), RED)
  assert.deepEqual(at(tall, 40, 12, 20), WHITE)
  assert.deepEqual(at(tall, 40, 20, 8), WHITE)
})

test('사진은 coverLayout 처럼 자르기 위치(fx)대로 채우고 상자 밖은 잘라 낸다', () => {
  const frame = halves(4, 2) // 가로 2:1 사진
  // 사진 높이를 상자에 맞추면 가로 20 이라, 왼쪽 끝(fx 0)에 맞추면 상자에는 빨간 왼쪽 절반만 보인다
  const left = draw(photo({ crop: { zoom: 1, fx: 0, fy: 0.5 } }), frame)
  assert.deepEqual(at(left, 40, 12, 15), RED)
  assert.deepEqual(at(left, 40, 14, 15), RED)
  assert.notDeepEqual(at(left, 40, 19, 15), BLUE) // 파랑은 상자 밖
  const right = draw(photo({ crop: { zoom: 1, fx: 1, fy: 0.5 } }), frame)
  assert.deepEqual(at(right, 40, 12, 15), BLUE)
  assert.deepEqual(at(right, 40, 22, 15), WHITE) // 상자 밖
  assert.deepEqual(gifPlacement(photo({ crop: { zoom: 2, fx: 0.5, fy: 0.5 } }), 2, 1).content, { x: -15, y: -5, width: 40, height: 20 })
})

test('원형 사진은 네 모서리를 잘라 내고, 불투명도는 섞어 그린다', () => {
  const round = draw(photo({ shape: 'circle', w: 20, h: 20, imageWidth: 1, imageHeight: 1 }), solid(2, 2, RED))
  assert.deepEqual(at(round, 40, 20, 20), RED)
  assert.deepEqual(at(round, 40, 11, 11), WHITE)
  const faded = draw(sticker({ w: 10, h: 10, x: 15, y: 15, opacity: 0.5 }), solid(2, 2, RED))
  const [r, g, b] = at(faded, 40, 20, 20)
  assert.equal(r, 255)
  assert.ok(Math.abs(g - 128) <= 1 && Math.abs(b - 128) <= 1, `${g},${b}`)
})

test('투명 바탕 층은 비친 곳만 덮고, 장면은 바탕 → GIF → 위 층 순서로 합친다', () => {
  const size = 4, region = { x: 0, y: 0, width: size, height: size }
  const top = new Uint8Array(size * size * 4) // 전부 투명
  top.set([0, 0, 0, 255], (1 * size + 1) * 4) // (1,1) 만 검정
  top.set([0, 0, 0, 128], (2 * size + 2) * 4) // (2,2) 반투명 검정
  const dest = page(size)
  blendLayer(dest, region, top, size)
  assert.deepEqual(at(dest, size, 0, 0), WHITE)
  assert.deepEqual(at(dest, size, 1, 1), [0, 0, 0, 255])
  assert.ok(Math.abs(at(dest, size, 2, 2)[0] - 127) <= 1)

  const gif = sticker({ x: 0, y: 0, w: 4, h: 4 })
  const segments = [{ kind: 'layer', role: 'base', capture: true, objects: [] }, { kind: 'gif', object: gif }, { kind: 'layer', role: 'top', capture: true, objects: [{}] }]
  const out = composeFrame({ segments, layers: [page(size), top], region: { x: 1, y: 1, width: 2, height: 2 }, pageWidth: size, ratio: { x: 1, y: 1 }, frameOf: () => ({ frame: solid(2, 2, BLUE), source: { width: 2, height: 2 } }) })
  assert.deepEqual(at(out, 2, 0, 0), [0, 0, 0, 255]) // 위 층(검정)이 GIF(파랑)를 덮는다
  assert.deepEqual(at(out, 2, 1, 0), BLUE)
})
