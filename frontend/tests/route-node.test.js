import test from 'node:test'
import assert from 'node:assert/strict'
import { createRouteNode, isRouteNode, normalizeRouteNode, routeNodeBox, routeNodeKindLabel, ROUTE_NODE_SIZE } from '../src/editor/widgets/routeNode.js'
import { routePathOf } from '../src/editor/templates/routePaper.js'
import { encodeElement, decodeElement, sharedObject } from '../src/collaboration/canvasElements.js'
import { editorReducer, createInitialState } from '../src/editor/state/editorReducer.js'
import { collaborationReducer } from '../src/collaboration/collaborationReducer.js'
import { isUuid } from '../src/collaboration/canvasElements.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

const pageId = '10000000-0000-4000-8000-000000000001'

test('지점은 노선 위 점에 가운데가 오는 32 크기 스티커이고 기록은 모양 · t · 색 · 이름만 검증해 담는다', () => {
  const route = routePathOf('landscape'), hit = route.nearest({ x: 500, y: 215 })
  const node = createRouteNode({ kind: 'end', point: hit, color: '#a69acb' })
  assert.ok(isUuid(node.id)); assert.equal(node.type, 'sticker'); assert.equal(isRouteNode(node), true)
  assert.deepEqual([node.w, node.h, node.rotation], [ROUTE_NODE_SIZE, ROUTE_NODE_SIZE, 0])
  assert.ok(Math.abs(node.x + ROUTE_NODE_SIZE / 2 - hit.x) < 1e-9 && Math.abs(node.y + ROUTE_NODE_SIZE / 2 - hit.y) < 1e-9)
  assert.deepEqual(node.routeNode, { kind: 'end', t: hit.t, color: '#A69ACB' }); assert.equal(node.name, '여행 노선 · 도착')
  assert.deepEqual(normalizeRouteNode({ kind: 'nowhere', t: 7, color: 'red', label: '  한라산  ' }), { kind: 'stop', t: 1, color: '#91A886', label: '한라산' })
  assert.deepEqual(normalizeRouteNode(null, '#626970'), { kind: 'stop', t: 0, color: '#626970' })
  assert.equal(normalizeRouteNode({ label: 'x'.repeat(60) }).label.length, 40)
  assert.deepEqual(routeNodeBox({ x: 100, y: 50 }, 20), { x: 90, y: 40, w: 20, h: 20 })
  assert.equal(routeNodeKindLabel('start'), '출발'); assert.equal(isRouteNode({ type: 'sticker', emoji: '⭐' }), false)
})

test('지점은 STICKER 요소로 서버에 오가며 routeNode 가 propertiesJson 에 그대로 남는다(백엔드 변경 없음)', () => {
  const node = createRouteNode({ kind: 'start', point: routePathOf('portrait').pointAt(0.3), color: '#91A886' })
  node.routeNode.t = routePathOf('portrait').nearest(node).t
  assert.equal(sharedObject(node), true)
  const encoded = encodeElement(node)
  assert.equal(encoded.elementType, 'STICKER'); assert.deepEqual(encoded.propertiesJson.routeNode, node.routeNode); assert.equal('mediaFileId' in encoded, false)
  const decoded = decodeElement({ ...encoded, version: 1 })
  assert.deepEqual(decoded.routeNode, node.routeNode); assert.equal(decoded.type, 'sticker'); assert.equal(decoded.w, ROUTE_NODE_SIZE)
})

test('지점 추가 · 노선 위 이동 · 색 바꾸기는 기존 리듀서(addObjects · updateMany · setPlanner)로 처리되고 협업 편집으로 기록된다', () => {
  const reduce = (state, action) => collaborationReducer(editorReducer, state, { collaborationId: '30000000-0000-4000-8000-00000000000' + ((state.past.length % 9) + 1), ...action })
  const route = routePathOf('landscape')
  let s = createInitialState({ pages: [{ id: pageId, backgroundAssetId: 'route-planner-landscape', templateVersion: '1.0.0', objects: [] }] })
  const node = createRouteNode({ kind: 'stop', point: route.nearest({ x: 300, y: 240 }), color: '#91A886' })
  s = reduce(s, { type: 'addObjects', objects: [node] })
  assert.equal(s.collaborationEdits.length, 1); assert.deepEqual(s.selectedIds, [node.id])
  // 끌기: 체크포인트 → 노선 위 점으로 updateMany(x · y · t) → 확정
  s = reduce(s, { type: 'checkpoint' })
  const hit = route.nearest({ x: 700, y: 560 })
  s = reduce(s, { type: 'updateMany', patches: { [node.id]: { x: hit.x - ROUTE_NODE_SIZE / 2, y: hit.y - ROUTE_NODE_SIZE / 2, routeNode: { ...node.routeNode, t: hit.t } } } })
  s = reduce(s, { type: 'commitCheckpoint' })
  const moved = s.doc.pages[0].objects[0]
  assert.ok(Math.abs(moved.routeNode.t - hit.t) < 1e-9); assert.ok(Math.abs(moved.x + ROUTE_NODE_SIZE / 2 - hit.x) < 1e-9)
  assert.equal(s.collaborationEdits.length, 2)
  // 노선 색 바꾸기: 기록(setPlanner) + 지점 색(updateMany record 없이). 회원 다이어리에서는 지점 색 변경이 협업 편집으로 기록돼 친구에게 간다
  const before = s.doc
  s = reduce(s, { type: 'setPlanner', planner: { options: { color: '#A69ACB', width: 6, opacity: 1 } } })
  s = reduce(s, { type: 'updateMany', patches: { [node.id]: { routeNode: { ...moved.routeNode, color: '#A69ACB' } } }, record: false })
  assert.equal(s.doc.pages[0].objects[0].routeNode.color, '#A69ACB'); assert.equal(s.doc.pages[0].planner.options.color, '#A69ACB')
  assert.equal(s.collaborationEdits.length, 3, '지점 색 변경도 서버로 보낸다')
  // 게스트(기기 전용) 편집기에서는 되돌리기 한 번에 노선 색과 지점 색이 함께 돌아간다. 회원 다이어리의 요소 되돌리기는 서버 이력을 따른다(기존 플래너와 같은 제한).
  let g = createInitialState({ pages: [{ id: pageId, backgroundAssetId: 'route-planner-landscape', templateVersion: '1.0.0', objects: [moved] }] })
  g = editorReducer(g, { type: 'setPlanner', planner: { options: { color: '#A69ACB', width: 6, opacity: 1 } } })
  g = editorReducer(g, { type: 'updateMany', patches: { [node.id]: { routeNode: { ...moved.routeNode, color: '#A69ACB' } } }, record: false })
  assert.equal(g.doc.pages[0].objects[0].routeNode.color, '#A69ACB')
  g = editorReducer(g, { type: 'undo' })
  assert.equal(g.doc.pages[0].objects[0].routeNode.color, '#91A886'); assert.equal(g.doc.pages[0].planner, undefined)
  void before
})

test('지점은 내보내기 스냅샷에 스티커로 들어가고 장소 이름은 기록에 남으며 빈 이름은 지운다', () => {
  const route = routePathOf('landscape')
  const node = createRouteNode({ kind: 'stop', point: route.nearest({ x: 300, y: 240 }), color: '#91A886' })
  const named = { ...node, routeNode: { ...node.routeNode, label: '성산일출봉' } }
  const snapshot = createExportSnapshot({ id: pageId, backgroundAssetId: 'route-planner-landscape', templateVersion: '1.0.0', objects: [named] })
  assert.equal(snapshot.objects.length, 1); assert.equal(snapshot.objects[0].type, 'sticker'); assert.equal(snapshot.objects[0].routeNode.label, '성산일출봉')
  assert.deepEqual(normalizeRouteNode({ ...named.routeNode, label: '   ' }), { kind: 'stop', t: named.routeNode.t, color: '#91A886' }, '빈 이름은 지운다')
})
