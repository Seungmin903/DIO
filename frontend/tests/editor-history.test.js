import test from 'node:test'
import assert from 'node:assert/strict'
import { createInitialState, editorReducer, getCurrentPage } from '../src/editor/state/editorReducer.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { createText, textFormatPatch, textSettings } from '../src/editor/utils/text.js'
import { colorTextRange } from '../src/editor/utils/textRanges.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'

const reduce = (state, action) => editorReducer(state, action)
const original = () => ({ id: 'doc', pages: [{ id: 'page', objects: [] }] })
const stroke = (id, y = 40, kind = 'ballpoint') => createStroke([{ x: 20, y }, { x: 200, y }], { id, kind, width: 10 })

test('필기·형광펜·텍스트 수정·부분 색상·이동·크기·회전·지우개가 한 단계씩 Undo/Redo 된다', () => {
  let state = createInitialState(original())
  const snapshots = [state.doc]
  const commit = (actions) => {
    const before = state.past.length
    for (const action of actions) state = reduce(state, action)
    assert.equal(state.past.length, before + 1)
    snapshots.push(state.doc)
  }
  commit([{ type: 'addObjects', objects: [stroke('pen')] }])
  commit([{ type: 'addObjects', objects: [stroke('highlight', 80, 'highlighter')] }])
  const text = createText({ id: 'text', x: 250, y: 100, text: '안녕', fontSize: 20 })
  commit([{ type: 'addObjects', objects: [text] }])
  commit([{ type: 'updateObject', id: text.id, record: true, patch: textFormatPatch({ ...text, text: '안녕하세요' }, textSettings(text)) }])
  commit([{ type: 'updateObject', id: text.id, record: true, patch: { colorRanges: colorTextRange('안녕하세요', [], { start: 1, end: 3 }, '#DD887A') } }])
  for (const patches of [
    [{ x: 280 }, { x: 310 }],
    [{ w: 360, h: 60 }, { w: 400, h: 80 }],
    [{ rotation: 45 }, { rotation: 130 }],
  ]) commit([{ type: 'checkpoint' }, ...patches.map((patch) => ({ type: 'updateObject', id: text.id, patch }))])
  const eraser = createEraserSession(getCurrentPage(state).objects)
  eraser.move({ x: 100, y: 40 }, { x: 100, y: 80 })
  commit([eraser.finish()])
  assert.deepEqual(getCurrentPage(state).objects.map((o) => o.id), ['text'])
  for (let i = snapshots.length - 2; i >= 0; i--) {
    state = reduce(state, { type: 'undo' })
    assert.deepEqual(state.doc, snapshots[i])
  }
  for (let i = 1; i < snapshots.length; i++) {
    state = reduce(state, { type: 'redo' })
    assert.deepEqual(state.doc, snapshots[i])
  }
})

test('되돌린 상태에서 드래그를 취소하면 이전 문서·Undo·Redo를 모두 보존한다', () => {
  let state = createInitialState(original())
  state = reduce(state, { type: 'addObjects', objects: [stroke('pen')] })
  state = reduce(state, { type: 'addObjects', objects: [stroke('highlight', 80, 'highlighter')] })
  state = reduce(state, { type: 'undo' })
  const before = state
  state = reduce(state, { type: 'checkpoint' })
  state = reduce(state, { type: 'updateMany', patches: { pen: { x: 300 } } })
  state = reduce(state, { type: 'revertToCheckpoint' })
  assert.deepEqual(state.doc, before.doc)
  assert.deepEqual(state.past, before.past)
  assert.deepEqual(state.future, before.future)
  assert.equal(state.pendingCheckpoint, null)
  assert.equal(getCurrentPage(reduce(state, { type: 'redo' })).objects.length, 2)
})

test('이력 80개 상태에서 드래그를 취소해도 가장 오래된 Undo가 사라지지 않는다', () => {
  let state = createInitialState(original())
  for (let i = 0; i < 80; i++) state = reduce(state, { type: 'renameDoc', title: `제목 ${i}` })
  const before = state
  // 실제 드래그처럼 checkpoint 뒤 record 없이 문서만 갱신한다.
  state = reduce(before, { type: 'checkpoint' })
  state = reduce(state, { type: 'updateMany', patches: {} })
  state = reduce(state, { type: 'revertToCheckpoint' })
  assert.deepEqual(state.past, before.past)
  assert.deepEqual(state.doc, before.doc)
})

test('선택·빈 지우기·취소 지우기는 Redo를 유지하고 새 편집은 Redo를 비운다', () => {
  let state = createInitialState(original())
  state = reduce(state, { type: 'addObjects', objects: [stroke('pen')] })
  state = reduce(state, { type: 'addObjects', objects: [stroke('highlight', 80, 'highlighter')] })
  state = reduce(state, { type: 'undo' })
  state = reduce(state, { type: 'select', ids: ['pen'] })
  const before = state
  for (const cancelled of [false, true]) {
    const session = createEraserSession(getCurrentPage(state).objects)
    session.move(cancelled ? { x: 100, y: 40 } : { x: 500, y: 500 })
    assert.equal(session.finish(cancelled), null)
  }
  assert.deepEqual(state.future, before.future)
  for (const action of [
    { type: 'addObjects', objects: [stroke('new')] },
    { type: 'updateObject', id: 'pen', record: true, patch: { rotation: 30 } },
    { type: 'removeObjects', ids: ['pen'] },
  ]) assert.deepEqual(reduce(state, action).future, [])
})

test('Undo/Redo와 새 이력 작업 후에는 오래된 드래그 복원 정보를 사용하지 않는다', () => {
  let state = createInitialState(original())
  state = reduce(state, { type: 'addObjects', objects: [stroke('pen')] })
  state = reduce(state, { type: 'checkpoint' })
  state = reduce(state, { type: 'updateObject', id: 'pen', patch: { x: 300 } })
  for (const action of [{ type: 'undo' }, { type: 'renameDoc', title: '새 편집' }]) {
    assert.equal(reduce(state, action).pendingCheckpoint, null)
  }
  const undone = reduce(state, { type: 'undo' })
  assert.equal(reduce(undone, { type: 'redo' }).pendingCheckpoint, null)
  const loaded = reduce(state, { type: 'load', doc: JSON.parse(JSON.stringify(state.doc)) })
  assert.deepEqual(loaded.past, [])
  assert.deepEqual(loaded.future, [])
  assert.equal(loaded.pendingCheckpoint, null)
})
