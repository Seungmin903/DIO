import test from 'node:test'
import assert from 'node:assert/strict'
import { FELT_LAYERS, feltPaths, feltStrokeLayers } from '../src/editor/utils/feltStroke.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { penPressure } from '../src/editor/utils/penSettings.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createInitialState, editorReducer, getCurrentPage } from '../src/editor/state/editorReducer.js'

test('펠트펜은 탭과 짧은 획도 둥글고 유한한 경계 안에 표시하고 저장 후 같은 재질을 유지한다', () => {
  for (const width of [1, 8, 16]) for (const points of [
    [{ x: 50, y: 50 }], [{ x: 50, y: 50 }, { x: 50, y: 50 }],
    [{ x: 30, y: 40 }, { x: 100, y: 80 }, { x: 99.7, y: 80.15 }],
  ]) {
    const object = createStroke(points, { id: 'felt', kind: 'felt', width })
    const part = { points: object.points }, paths = feltPaths(part, width)
    assert.equal(feltPaths(part, width), paths, '완성 구간 캐시 재사용')
    for (const path of paths) {
      assert.doesNotMatch(path, /NaN|Infinity/)
      assert.ok(path.length > 0)
      const values = path.match(/-?\d+(?:\.\d+)?/g).map(Number)
      for (let i = 0; i < values.length; i += 2) {
        assert.ok(values[i] >= -0.001 && values[i] <= object.baseWidth + 0.001)
        assert.ok(values[i + 1] >= -0.001 && values[i + 1] <= object.baseHeight + 0.001)
      }
    }
    const restored = createExportSnapshot({ objects: [JSON.parse(JSON.stringify(object))] }).objects[0]
    assert.deepEqual(restored, object)
    assert.deepEqual(feltStrokeLayers([{ points: restored.points }], width), paths)
  }
  for (const speed of [0, 1, 10]) assert.equal(penPressure('felt', speed), 1)
})

test('펠트펜의 흐린 가장자리·탭도 획 지우개에 반영하고 빈 공간은 유지한다', () => {
  const object = createStroke([{ x: 40, y: 40 }, { x: 160, y: 40 }], { id: 'felt', kind: 'felt', width: 16 })
  assert.deepEqual(createEraserSession([object], 0).move({ x: 100, y: 47.7 }), ['felt'])
  assert.deepEqual(createEraserSession([object], 0).move({ x: 100, y: 49 }), [])
  const dot = createStroke([{ x: 40, y: 40 }], { id: 'dot', kind: 'felt', width: 16 })
  assert.deepEqual(createEraserSession([dot], 0).move({ x: 47, y: 40 }), ['dot'])
})

test('펠트펜 영역 지우기와 Undo/Redo는 종류와 재질을 보존한다', () => {
  const object = createStroke([{ x: 20, y: 80 }, { x: 240, y: 80 }], { id: 'felt', kind: 'felt', width: 16 })
  const session = createEraserSession([object], 8, 'area')
  session.move({ x: 120, y: 80 })
  let state = createInitialState({ pages: [{ id: 'page', objects: [object] }] })
  state = editorReducer(state, session.finish())
  const fragments = getCurrentPage(state).objects
  assert.equal(fragments.length, 2)
  assert.ok(fragments.every(o => o.penKind === 'felt' && o.renderVersion === 2))
  state = editorReducer(state, { type: 'undo' })
  assert.deepEqual(getCurrentPage(state).objects, [object])
  state = editorReducer(state, { type: 'redo' })
  assert.deepEqual(getCurrentPage(state).objects, fragments)
  assert.ok(FELT_LAYERS.at(-1).alpha >= 0.98)
})
