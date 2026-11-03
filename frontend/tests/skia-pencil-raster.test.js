import test from 'node:test'
import assert from 'node:assert/strict'
import { createStroke } from '../src/editor/utils/strokes.js'
import { createCompletedStrokePlanner } from '../src/editor/utils/completedStrokePlan.js'
import { isSkiaPencil, pencilRasterBounds, pencilRasterKey } from '../src/editor/skia/pencilRaster.js'
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

test('그림 열쇠는 색 · 굵기 · 배율이 바뀌면 달라지고 위치만 바뀌면 같다', () => {
  const stroke = pencil('a')
  const key = pencilRasterKey(stroke, 2)
  assert.equal(pencilRasterKey({ ...stroke, x: 500, y: 40, rotation: 30, opacity: 0.5 }, 2), key)
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
