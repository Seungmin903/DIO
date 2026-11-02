import test from 'node:test'
import assert from 'node:assert/strict'
import { createCompletedStrokePlanner, STROKES_PER_BATCH, STROKE_CACHE_PIXELS } from '../src/editor/utils/completedStrokePlan.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { lassoHitIds, applyLassoSelection } from '../src/editor/utils/lassoGeometry.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'

const size = { width: 1024, height: 768, zoom: 1, pixelRatio: 2 }
const stroke = (id, y = 100) => createStroke([{ x: 10, y }, { x: 300, y }], { id, kind: 'fountain', width: 4 })
const flatten = layers => layers.flatMap(layer => layer.batch?.objects ?? [layer.object])

test('네이티브 보존 묶음은 앞쪽 획의 수정·삭제 시 오래된 획을 표시하지 않는다', () => {
  const plan = createCompletedStrokePlanner({ batchSize: 8, preserveBatches: true })
  const objects = Array.from({ length: 16 }, (_, i) => stroke(`native-${i}`, 100 + i))
  const initial = plan(objects, size)
  const changed = [stroke('changed'), ...objects.slice(1)]
  const updated = plan(changed, size)
  assert.deepEqual(flatten(updated), changed)
  assert.notEqual(updated[0].batch, initial[0].batch)
  assert.deepEqual(flatten(plan(objects.slice(1), size)), objects.slice(1))
})

test('웹 캐시의 마지막 완성 묶음은 새 획·앞 묶음 삭제·Undo에도 유지한다', () => {
  const plan = createCompletedStrokePlanner({ batchSize: 8, alignPixels: true, preserveBatches: true })
  const objects = Array.from({ length: 100 }, (_, i) => stroke(`sealed-${i}`, 100 + i))
  const before = plan(objects, size)
  for (let count = 1; count <= 8; count++) {
    const nextObjects = [...objects, ...Array.from({ length: count }, (_, i) => stroke(`append-${i}`))]
    const next = plan(nextObjects, size)
    before.forEach((layer, i) => assert.equal(next[i].batch, layer.batch))
    assert.deepEqual(flatten(next), nextObjects)
  }
  const erased = plan(objects.slice(1), size)
  for (let i = 1; i < before.length; i++) assert.equal(erased[i].batch, before[i].batch)
  assert.deepEqual(flatten(erased), objects.slice(1))
  const undone = plan(objects, size)
  before.forEach((layer, i) => assert.equal(undone[i].batch, layer.batch))
})

test('웹 캐시는 작은 묶음을 픽셀 격자에 맞추고 배율 변경 시 재생성한다', () => {
  const plan = createCompletedStrokePlanner({ batchSize: 8, alignPixels: true })
  const objects = Array.from({ length: 20 }, (_, i) => stroke(`web-${i}`, 100 + i))
  const settings = { ...size, zoom: 0.463 }
  const first = plan(objects, settings)
  assert.deepEqual(first.map(layer => layer.batch.objects.length), [8, 8, 4])
  for (const { batch } of first) {
    const scale = settings.zoom * settings.pixelRatio
    for (const value of [batch.left, batch.top, batch.w, batch.h]) {
      assert.ok(Math.abs(value * scale - Math.round(value * scale)) < 1e-8)
    }
  }
  assert.equal(first[0].batch, plan(objects, settings)[0].batch)
  assert.notEqual(first[0].batch, plan(objects, { ...settings, zoom: 0.8 })[0].batch)
  assert.throws(() => createCompletedStrokePlanner({ batchSize: 0 }))
})

test('누적 획은 기존 묶음을 재사용하고 마지막 묶음만 갱신한다', () => {
  const plan = createCompletedStrokePlanner()
  const objects = Array.from({ length: 1000 }, (_, i) => stroke(`s${i}`))
  const first = plan(objects, size)
  const next = plan([...objects, stroke('new')], size)
  assert.equal(first.length, Math.ceil(1000 / STROKES_PER_BATCH))
  for (let i = 0; i < first.length - 1; i++) assert.equal(first[i].batch, next[i].batch)
  assert.notEqual(first.at(-1).batch, next.at(-1).batch)
  assert.equal(next.at(-1).batch.objects.length, 9)
  assert.deepEqual(flatten(next), [...objects, next.at(-1).batch.objects.at(-1)])
})

test('필기 사이의 사진·글자 레이어와 개별 불투명도·그룹·잠금은 원본을 유지한다', () => {
  const objects = [stroke('a'), { id: 'photo', type: 'photo' },
    { ...stroke('highlight'), penKind: 'highlighter', opacity: 0.4, groupId: 'g', locked: true },
    { id: 'text', type: 'text' }, stroke('b'), { ...stroke('hidden'), hidden: true }]
  const json = JSON.stringify(objects)
  const result = createCompletedStrokePlanner()(objects, size)
  const visible = objects.filter(object => !object.hidden)
  assert.deepEqual(flatten(result), visible)
  flatten(result).forEach((object, i) => assert.equal(object, visible[i]))
  assert.equal(JSON.stringify(objects), json)
})

test('회전·이동·반전·색·크기 변경과 페이지 크기는 캐시를 무효화한다', () => {
  const original = Array.from({ length: 4 }, (_, i) => stroke(`s${i}`))
  for (const patch of [{ rotation: 45 }, { x: 50 }, { flipX: true }, { color: '#FFFFFF' }, { w: 500 }]) {
    const plan = createCompletedStrokePlanner()
    const before = plan(original, size)[0].batch
    const changed = [original[0], { ...original[1], ...patch }, ...original.slice(2)]
    const after = plan(changed, size)[0].batch
    assert.notEqual(after, before)
    assert.equal(after.objects[1], changed[1])
  }
  const plan = createCompletedStrokePlanner()
  assert.notEqual(plan(original, size)[0].batch, plan(original, { ...size, height: 1024 })[0].batch)
})

test('페이지 밖 경로·큰 배율에도 캐시 픽셀 총량을 제한하고 초과분은 원본으로 표시한다', () => {
  const outside = Array.from({ length: 400 }, (_, i) => createStroke([{ x: -10000, y: -10000 }, { x: 10000, y: 10000 }], { id: `s${i}` }))
  const plan = createCompletedStrokePlanner()
  for (const zoom of [0.5, 1, 4, 10]) {
    const layers = plan(outside, { ...size, zoom })
    let pixels = 0
    for (const { batch, rasterize } of layers) {
      assert.equal(batch.left, 0); assert.equal(batch.top, 0)
      assert.equal(batch.w, size.width); assert.equal(batch.h, size.height)
      if (rasterize) pixels += Math.ceil(batch.w * zoom * size.pixelRatio) * Math.ceil(batch.h * zoom * size.pixelRatio)
    }
    assert.ok(pixels <= STROKE_CACHE_PIXELS)
    assert.deepEqual(flatten(layers), outside, '캐시 예산 초과는 획 누락을 만들지 않는다')
  }
})

test('표시 캐시 생성 후에도 올가미 그룹 선택·이동·회전과 Undo/Redo는 원본 요소를 쓴다', () => {
  const objects = [stroke('a'), { ...stroke('b', 400), groupId: 'g' }, { ...stroke('c', 450), groupId: 'g' }]
  const plan = createCompletedStrokePlanner()
  plan(objects, size)
  const polygon = [{ x: 0, y: 390 }, { x: 50, y: 390 }, { x: 50, y: 410 }, { x: 0, y: 410 }]
  const ids = applyLassoSelection(objects, [], lassoHitIds(objects, polygon), 'replace')
  assert.deepEqual(ids, ['b', 'c'])
  let state = createInitialState({ id: 'doc', pages: [{ id: 'p', objects }] })
  state = editorReducer(state, { type: 'selectExact', ids })
  state = editorReducer(state, { type: 'updateMany', patches: { b: { x: 50, rotation: 30 }, c: { x: 50, rotation: 30 } }, record: true })
  assert.equal(flatten(plan(state.doc.pages[0].objects, size))[1].rotation, 30)
  state = editorReducer(state, { type: 'undo' })
  assert.deepEqual(flatten(plan(state.doc.pages[0].objects, size)), objects)
  state = editorReducer(state, { type: 'redo' })
  assert.equal(flatten(plan(state.doc.pages[0].objects, size))[1].rotation, 30)
})

test('표시 캐시 생성 후 획·영역 지우기와 Undo는 지운 획을 남기지 않는다', () => {
  for (const mode of ['stroke', 'area']) {
    const objects = Array.from({ length: 4 }, (_, i) => stroke(`s${i}`, 100 + i * 100))
    const plan = createCompletedStrokePlanner()
    plan(objects, size)
    const session = createEraserSession(objects, 10, mode)
    session.move({ x: 150, y: 60 }, { x: 150, y: 140 })
    let state = createInitialState({ id: 'doc', pages: [{ id: 'p', objects }] })
    state = editorReducer(state, session.finish())
    const displayed = flatten(plan(state.doc.pages[0].objects, size))
    assert.ok(!displayed.some(object => object.id === 's0'))
    assert.equal(displayed.length, mode === 'area' ? 5 : 3)
    state = editorReducer(state, { type: 'undo' })
    assert.deepEqual(flatten(plan(state.doc.pages[0].objects, size)), objects)
  }
})


test('비웹 캐시 fallback은 표시 객체의 순서와 참조를 유지한다', async () => {
  const { default: fallback } = await import('../src/editor/components/canvas/WebStrokeCache.js')
  const objects = [{ id: 'ink' }, { id: 'hidden', hidden: true }, { id: 'photo' }]
  const seen = []
  const result = fallback({ objects, renderObject: object => { seen.push(object); return object.id } })
  assert.deepEqual(result, ['ink', 'photo'])
  assert.equal(seen[0], objects[0]); assert.equal(seen[1], objects[2])
})


test('웹 작은 조각 묶음도 캐시하되 기본 정책과 원본 객체는 유지한다', () => {
  const objects = [stroke('fragment', 100)]
  const web = createCompletedStrokePlanner({ batchSize: 4, minBatchSize: 1 })(objects, size)
  assert.equal(web[0].rasterize, true)
  assert.equal(web[0].batch.objects[0], objects[0])
  assert.equal(createCompletedStrokePlanner()(objects, size)[0].rasterize, false)
  assert.throws(() => createCompletedStrokePlanner({ minBatchSize: 0 }))
})
test('QA 픽셀 예산 초과도 원본 순서·참조를 유지하고 기본 예산을 바꾸지 않는다', () => {
  const plan = createCompletedStrokePlanner({ batchSize: 4, minBatchSize: 1 })
  const objects = Array.from({length:20},(_,i)=>stroke('budget-'+i,100+i))
  const normal = plan(objects,size)
  assert.ok(normal.every(layer=>layer.rasterize))
  const limited = plan(objects,{...size,pixelBudget:1})
  assert.ok(limited.every(layer=>!layer.rasterize));assert.deepEqual(flatten(limited),objects)
  assert.ok(flatten(limited).every((object,i)=>object===objects[i]))
  assert.ok(plan(objects,size).every(layer=>layer.rasterize))
})
