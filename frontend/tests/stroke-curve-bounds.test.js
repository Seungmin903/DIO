import test from 'node:test'
import assert from 'node:assert/strict'
import { createStroke, penContour } from '../src/editor/utils/strokes.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'

const paths = [
  [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }],
  [{ x: 200, y: 200 }, { x: 100, y: 200 }, { x: 100, y: 100 }],
  [{ x: 10, y: 10 }, { x: 10, y: 10 }, { x: 14, y: 110 }, { x: 140, y: 110 }],
  [{ x: 0, y: 0 }, { x: 1000, y: 1 }, { x: 1001, y: 100 }],
]
for (const kind of ['fountain', 'brush']) for (const width of [0.02, 1, 3, 40]) test(`${kind}/${width}: 희소·역방향·중복점 곡선의 모든 제어점이 저장 경계 안에 있다`, () => {
  for (const raw of paths) {
    const points = raw.map((p, i) => ({ ...p, pressure: [0.3, 1.7, 0.8, 2][i] }))
    const object = createStroke(points, { id: 'stroke', kind, width })
    const stored = JSON.stringify(object)
    const d = penContour(object.points, width, kind)
    // Q 곡선은 시작점·제어점·끝점의 볼록 껍질 안에 있으므로 모든 도형이 SVG 안에 있다.
    for (const command of d.match(/[MLQ][^MLQZ]*/g) ?? []) {
      const numbers = command.slice(1).trim().split(/\s+/).map(Number)
      for (let i = 0; i < numbers.length; i += 2) {
        assert.ok(Number.isFinite(numbers[i]) && Number.isFinite(numbers[i + 1]))
        assert.ok(numbers[i] >= -1e-8 && numbers[i] <= object.baseWidth + 1e-8, `${kind}: x=${numbers[i]}`)
        assert.ok(numbers[i + 1] >= -1e-8 && numbers[i + 1] <= object.baseHeight + 1e-8, `${kind}: y=${numbers[i + 1]}`)
      }
    }
    assert.equal(JSON.stringify(object), stored, '이미 저장된 획의 좌표·크기·버전을 바꾸지 않는다')
  }
})

test('기존 v2 획의 렌더·획 지우기·Undo/Redo·저장 복원·출력 스냅샷이 같은 기록을 쓴다', async () => {
  const object = createStroke(paths[0], { id: 'stroke', kind: 'fountain', width: 1 })
  const doc = { id: 'doc', pages: [{ id: 'p', objects: [object] }] }
  const original = JSON.stringify(doc)
  const eraser = createEraserSession([object], 1)
  assert.deepEqual(eraser.move({ x: 150, y: 100 }), ['stroke'])
  const action = eraser.finish()
  const state = createInitialState(doc)
  const erased = editorReducer(state, action)
  assert.equal(erased.doc.pages[0].objects.length, 0)
  const undo = editorReducer(erased, { type: 'undo' })
  assert.deepEqual(undo.doc, doc)
  assert.deepEqual(editorReducer(undo, { type: 'redo' }).doc, erased.doc)
  const restored = JSON.parse(JSON.stringify(undo.doc))
  const prepared = await prepareExportSnapshot(createExportSnapshot(restored.pages[0]), () => assert.fail('획은 파일 소재가 아님'))
  assert.deepEqual(prepared.objects[0], object)
  assert.equal(penContour(prepared.objects[0].points, 1, 'fountain'), penContour(object.points, 1, 'fountain'))
  prepared.dispose()
  assert.equal(JSON.stringify(doc), original)
})
