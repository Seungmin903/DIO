import test from 'node:test'
import assert from 'node:assert/strict'
import { editorReducer } from '../src/editor/state/editorReducer.js'

const state = (ids) => ({ doc: { pages: ids.map((id) => ({ id, objects: [] })) }, pageId: ids[0], selectedIds: [], past: [], future: [] })
const order = (s) => s.doc.pages.map((p) => p.id)

test('movePages 는 고른 페이지를 순서 그대로 기준 페이지 앞이나 뒤로 함께 옮긴다', () => {
  const start = state(['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(order(editorReducer(start, { type: 'movePages', ids: ['b', 'd'], anchorId: 'e', place: 'after' })), ['a', 'c', 'e', 'b', 'd'])
  assert.deepEqual(order(editorReducer(start, { type: 'movePages', ids: ['d', 'b'], anchorId: 'a', place: 'before' })), ['b', 'd', 'a', 'c', 'e'])
})

test('movePages 는 되돌리기 한 번으로 돌아가고, 기준이 함께 옮기는 페이지면 바꾸지 않는다', () => {
  const start = state(['a', 'b', 'c'])
  const moved = editorReducer(start, { type: 'movePages', ids: ['a', 'b'], anchorId: 'c', place: 'after' })
  assert.deepEqual(order(editorReducer(moved, { type: 'undo' })), ['a', 'b', 'c'])
  assert.equal(editorReducer(start, { type: 'movePages', ids: ['a', 'b'], anchorId: 'b', place: 'after' }), start)
})
