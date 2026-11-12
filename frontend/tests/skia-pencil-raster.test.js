import test from 'node:test'
import assert from 'node:assert/strict'
import { createStroke } from '../src/editor/utils/strokes.js'
import { createCompletedStrokePlanner } from '../src/editor/utils/completedStrokePlan.js'
import { isSkiaPencil, pencilRasterBounds, pencilRasterKey, pencilBakesOpacity, rememberRaster, reusableRaster } from '../src/editor/skia/pencilRaster.js'
import { quantizeScale } from '../src/editor/skia/rasterBudget.js'

const withDistance = points => { let d = 0; return points.map((p, i) => { if (i) d += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y); return { ...p, inkDistance: d } }) }
const line = [{ x: 10, y: 10, pressure: 0.85 }, { x: 60, y: 30, pressure: 0.85 }, { x: 110, y: 20, pressure: 0.85 }]
const pencil = (id, extra = {}) => ({ ...createStroke(withDistance(line), { id, kind: 'pencil', width: 5, renderVersion: 3, materialSeed: 1 }), ...extra })
const ball = id => createStroke(line, { id, kind: 'ball', width: 5, renderVersion: 3 })

test('Skia 연필은 새 재질 연필 획 중 진행 거리가 있는 것(또는 지우개 조각)만 고른다', () => {
  assert.equal(isSkiaPencil(pencil('a')), true)
  assert.equal(isSkiaPencil(ball('b')), false)
  assert.equal(isSkiaPencil({ type: 'text' }), false)
  // 옛 저장 획(진행 거리 없음)은 앱 Skia 도 도장을 못 찍으므로 SVG 로 둔다
  assert.equal(isSkiaPencil(createStroke(line, { id: 'old', kind: 'pencil', width: 5, renderVersion: 2 })), false)
  assert.equal(isSkiaPencil(createStroke(line, { id: 'old1', kind: 'pencil', width: 5, renderVersion: 1 })), false)
  assert.equal(isSkiaPencil({ ...createStroke(line, { id: 'piece', kind: 'pencil', width: 5, renderVersion: 3 }), sampled: true }), true)
})

test('연필 그림 범위는 요소 상자 둘레에 굵기만큼 여백을 두고, 크기를 바꾼 획은 같은 비율로 늘린다', () => {
  const stroke = pencil('a')
  const bounds = pencilRasterBounds(stroke)
  const pad = stroke.strokeWidth + 2
  assert.equal(bounds.left, -pad)
  assert.equal(bounds.top, -pad)
  assert.ok(Math.abs(bounds.width - (stroke.w + 2 * pad)) < 1e-9)
  const resized = pencilRasterBounds({ ...stroke, w: stroke.w * 2, h: stroke.h * 3 })
  assert.ok(Math.abs(resized.left + pad * 2) < 1e-9)
  assert.ok(Math.abs(resized.top + pad * 3) < 1e-9)
})

test('그림 열쇠는 색 · 굵기 · 배율 · 불투명도가 바뀌면 달라지고 위치만 바뀌면 같다', () => {
  const stroke = pencil('a')
  const key = pencilRasterKey(stroke, 2)
  assert.equal(pencilRasterKey({ ...stroke, x: 500, y: 40, rotation: 30 }, 2), key)
  assert.notEqual(pencilRasterKey({ ...stroke, opacity: 0.5 }, 2), key, '겹침이 쌓이도록 불투명도를 그림 안에 굽는다')
  assert.notEqual(pencilRasterKey(stroke, 3), key)
  assert.notEqual(pencilRasterKey({ ...stroke, color: '#ff0000' }, 2), key)
  assert.notEqual(pencilRasterKey({ ...stroke, strokeWidth: 8 }, 2), key)
})

test('화면 배율은 1/8 단계로 맞춘다', () => {
  assert.equal(quantizeScale(1.3), 1.25)
  assert.equal(quantizeScale(1.31), 1.25)
  assert.equal(quantizeScale(0.01), 0.25)
})

test('묶음 계획: exclude 가 참인 획은 묶음에 넣지 않고 원래 순서대로 따로 둔다', () => {
  const objects = [ball('b1'), ball('b2'), pencil('p1'), ball('b3'), pencil('p2'), pencil('p3'), ball('b4')]
  const options = { width: 1280, height: 800, zoom: 1, pixelRatio: 1 }
  const plan = createCompletedStrokePlanner({ batchSize: 4, minBatchSize: 1 })
  const layers = plan(objects, { ...options, exclude: isSkiaPencil })
  const ids = layers.map(layer => layer.batch ? layer.batch.objects.map(o => o.id).join('+') : layer.object.id)
  assert.deepEqual(ids, ['b1+b2', 'p1', 'b3', 'p2', 'p3', 'b4'])
  // exclude 가 없으면 지금처럼 한 묶음
  const plain = createCompletedStrokePlanner({ batchSize: 8, minBatchSize: 1 })(objects, options)
  assert.equal(plain.length, 1)
  assert.equal(plain[0].batch.objects.length, objects.length)
})

test('불투명도를 그림에 굽는 것은 Skia 그림으로 그리는 연필뿐이다(옛 획은 SVG + 요소 래퍼가 맡아 한 번만 곱해진다)', () => {
  const stroke = pencil('a')
  assert.equal(pencilBakesOpacity({ ...stroke, opacity: 0.5 }), true)
  const old = { ...stroke, opacity: 0.5, points: stroke.points.map(({ inkDistance, ...p }) => p) }
  assert.equal(isSkiaPencil(old), false)
  assert.equal(pencilBakesOpacity(old), false)
  assert.equal(pencilBakesOpacity({ ...stroke, penKind: 'ball', opacity: 0.5 }), false)
})

test('이전 그림은 불투명도 · 배율만 바뀔 때만 대신 보여 주고, 모양이 바뀌면 보여 주지 않는다', () => {
  const stroke = pencil('a'), raster = { uri: 'old' }, remembered = rememberRaster(stroke, raster)
  assert.equal(reusableRaster(null, stroke), null)
  assert.equal(reusableRaster(remembered, stroke), raster)
  assert.equal(reusableRaster(remembered, { ...stroke, opacity: 0.4 }), raster)
  assert.equal(reusableRaster(remembered, { ...stroke, x: 300, rotation: 20 }), raster, '위치 · 회전은 래퍼가 맡는다')
  for (const changed of [{ color: '#ff0000' }, { strokeWidth: 9 }, { w: stroke.w * 2 }, { h: stroke.h * 2 }, { points: stroke.points.slice() }, { sampled: true }])
    assert.equal(reusableRaster(remembered, { ...stroke, ...changed }), null, Object.keys(changed).join())
})

test('불투명도 슬라이더를 끄는 동안 값마다 굽지 않고, 멈춘 뒤 한 번 구우며 획당 그림은 하나만 남긴다', async () => {
  const { readFileSync } = await import('node:fs')
  const { REBAKE_DELAY_MS } = await import('../src/editor/skia/rasterBudget.js')
  assert.ok(REBAKE_DELAY_MS >= 100 && REBAKE_DELAY_MS <= 300)
  for (const name of ['PencilSkiaStroke.native.js', 'PencilSkiaStroke.web.js']) {
    const source = readFileSync(new URL(`../src/editor/components/${name}`, import.meta.url), 'utf8')
    assert.match(source, /forced\.current \|\| \(!reusableRaster\(last\.current, object\) && withinBudget\(\)\)/, `${name}: 이전 그림이 있으면 바로 굽지 않는다`)
    assert.match(source, /reusableRaster\(last\.current, object\) \? REBAKE_DELAY_MS : 0/, `${name}: 값이 멈춘 뒤 굽는다`)
    assert.match(source, /return \(\) => clearTimeout\(timer\)/, `${name}: 값이 또 바뀌면 타이머를 다시 잡는다`)
    assert.match(source, /const cache = new WeakMap\(\)/, `${name}: 획(점 배열)당 그림 하나 — 열쇠가 바뀌면 덮어쓴다`)
  }
})
