import test from 'node:test'
import assert from 'node:assert/strict'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'
import { collaborationReducer } from '../src/collaboration/collaborationReducer.js'
import { encodeElement, decodeElement } from '../src/collaboration/canvasElements.js'
import { tastingElementValue } from '../src/editor/templates/tastingElements.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

for (const direction of ['portrait', 'landscape']) test(`${direction} 새 속지 채움과 지우기는 협업 요소로 기록된다`, () => {
  const pageId = '10000000-0000-4000-8000-000000000001'
  const reduce = (state, action) => collaborationReducer(editorReducer, state, { collaborationId: '30000000-0000-4000-8000-000000000001', ...action })
  let state = createInitialState({ pages: [{ id: pageId, backgroundAssetId: `remote-tasting-note-${direction}`, templateVersion: '1.0.0', objects: [] }] })
  state = reduce(state, { type: 'setPlanner', planner: { fills: { 'star-0': '#123456', 'visit-0': '#654321' } } })
  assert.equal(state.collaborationEdits.length, 1)
  assert.equal(state.collaborationEdits[0].after.length, 2)
  const page = state.doc.pages[0], rows = page.objects.map(o => ({ ...encodeElement(o), version: 1 }))
  const remote = { ...page, objects: rows.map(decodeElement) }
  assert.deepEqual(tastingElementValue(remote).fills, { 'star-0': '#123456', 'visit-0': '#654321' })
  const snapshot = createExportSnapshot(remote)
  assert.equal(snapshot.planner.fills['star-0'], '#123456'); assert.equal(snapshot.objects.length, 0)
  state = reduce(state, { type: 'setPlanner', planner: { fills: { 'visit-0': '#654321' } } })
  assert.equal(state.collaborationEdits.length, 2)
  assert.equal(tastingElementValue(state.doc.pages[0]).fills['star-0'], undefined)
  assert.equal(state.doc.pages[0].objects.find(o => o.tastingMark === 'star-0').fill, 'none')
})

test('협업 실행 취소는 상대가 추가한 다른 표시를 보존한다', () => {
  const pageId = '10000000-0000-4000-8000-000000000001'
  const reduce = (state, action) => collaborationReducer(editorReducer, state, { collaborationId: '30000000-0000-4000-8000-000000000001', ...action })
  let state = createInitialState({ pages: [{ id: pageId, backgroundAssetId: 'remote-tasting-note-portrait', objects: [] }] })
  state = reduce(state, { type: 'setPlanner', planner: { fills: { 'star-0': '#123456' } } })
  const mine = state.doc.pages[0].objects[0]
  const friend = { ...mine, id: '40000000-0000-4000-8000-000000000001', tastingMark: 'star-1', fill: '#654321' }
  state = reduce(state, { type: 'importCollaborationElements', pageId, expectedElements: [mine], objects: [mine, friend] })
  state = reduce(state, { type: 'collaborationHistoryApplied', direction: 'undo', pageId, expectedElements: [mine, friend], objects: [friend] })
  assert.deepEqual(tastingElementValue(state.doc.pages[0]).fills, { 'star-1': '#654321' })
})
