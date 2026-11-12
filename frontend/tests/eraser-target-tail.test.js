import test from 'node:test'
import assert from 'node:assert/strict'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createStroke, strokeOutline, penContour } from '../src/editor/utils/strokes.js'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

const line = (id, kind = 'ball', version = 2) => createStroke([{ x: 20, y: 100, pressure: 1.5 }, { x: 280, y: 100, pressure: 1.5 }],
  { id, kind, width: 16, renderVersion: version, materialSeed: 101, lineCap: 'square' })
for (const mode of ['stroke', 'area']) for (const [target, expected] of [['all', ['pen', 'felt', 'hl']], ['pen', ['pen', 'felt']], ['highlighter', ['hl']]]) {
  test(`${mode}/${target}: 선택한 종류만 지우고 보호된 획은 보존한다`, () => {
    const objects = [line('pen'), line('felt', 'felt', 3), line('hl', 'highlighter'), { ...line('locked'), locked: true }, { ...line('hidden', 'highlighter'), hidden: true }]
    const before = JSON.stringify(objects), session = createEraserSession(objects, 10, mode, target)
    assert.deepEqual(session.move({ x: 150, y: 60 }, { x: 150, y: 140 }), expected)
    const action = session.finish()
    assert.deepEqual(mode === 'area' ? Object.keys(action.replacements) : action.ids, expected)
    assert.equal(JSON.stringify(objects), before)
  })
}

test('구버전 펜은 새 절단 끝만 필압 반경으로 마감하고 원래 끝과 버전을 보존한다', () => {
  for (const kind of ['fountain', 'brush']) {
    const source = line(kind, kind, 1), before = JSON.stringify(source)
    const session = createEraserSession([source], 10, 'area')
    session.move({ x: 150, y: 60 }, { x: 150, y: 140 })
    const [left, right] = session.finish().replacements[kind]
    assert.deepEqual(left.eraserCaps, { start: false, end: true })
    assert.deepEqual(right.eraserCaps, { start: true, end: false })
    assert.equal(left.renderVersion, 1)
    const values = strokeOutline(left.points, 16, left.eraserCaps).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number)
    const xs = values.filter((_, i) => i % 2 === 0)
    const last = left.points.at(-1)
    assert.ok(Math.max(...xs) > last.x + 11.9, '필압 1.5의 둥근 펜촉은 절단 중심에서 반경 12만큼 이어진다')
    assert.ok(Math.max(...xs) + left.x <= 140 + 1e-6, '지운 영역을 다시 채우지 않는다')
    assert.equal(JSON.stringify(source), before)
    const repeat = createEraserSession([left], 8, 'area')
    repeat.move({ x: 70, y: 60 }, { x: 70, y: 140 })
    assert.ok(repeat.finish().replacements[left.id].every(p => p.eraserCaps.end))
  }
})

test('신규 재질은 곡선·필압·seed를 유지하며 절단 후 Undo/Redo·JSON·출력 복원이 같다', () => {
  for (const kind of ['fountain', 'brush', 'felt', 'highlighter']) {
    const source = line('s', kind, kind === 'brush' || kind === 'highlighter' ? 2 : 3)
    const session = createEraserSession([source], 10, 'area')
    session.move({ x: 150, y: 60 }, { x: 150, y: 140 })
    const action = session.finish(), parts = action.replacements.s
    assert.equal(parts.length, 2)
    for (const p of parts) {
      assert.equal(p.penKind, kind)
      assert.equal(p.renderVersion, source.renderVersion)
      assert.equal(p.materialSeed, source.materialSeed)
      assert.ok(p.points.every(q => q.pressure === 1.5))
      if (kind === 'highlighter') assert.equal(p.lineCap, 'square', '설정한 형광펜 펜촉 보존')
      assert.ok(!penContour(p.points, p.strokeWidth, kind).includes('NaN'))
    }
    const doc = { pages: [{ id: 'p', objects: [source] }] }
    const initial = createInitialState(doc), erased = editorReducer(initial, action)
    const undone = editorReducer(erased, { type: 'undo' })
    assert.deepEqual(undone.doc, doc)
    assert.deepEqual(editorReducer(undone, { type: 'redo' }).doc, erased.doc)
    const restored = JSON.parse(JSON.stringify(erased.doc))
    assert.deepEqual(createExportSnapshot(restored.pages[0]).objects, parts)
  }
})
