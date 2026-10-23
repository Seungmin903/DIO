import test from 'node:test'
import assert from 'node:assert/strict'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { editorReducer } from '../src/editor/state/editorReducer.js'

const line = (id = 'line') => createStroke([{ x: 0, y: 100 }, { x: 300, y: 100 }], { id, width: 4 })
const pageX = (stroke) => stroke.points.map((p) => p.x + stroke.x)

test('영역 지우기는 가운데를 지나가면 획을 양쪽 두 조각으로 나눈다', () => {
  const session = createEraserSession([line()], 10, 'area')
  session.move({ x: 150, y: 60 }, { x: 150, y: 140 })
  const action = session.finish()
  assert.equal(action.type, 'replaceObjects')
  const [left, right] = action.replacements.line
  assert.equal(action.replacements.line.length, 2)
  // 지우개 반지름 10 + 획 반 굵기 2 안의 점은 남지 않는다
  assert.ok(Math.max(...pageX(left)) < 150 - 10)
  assert.ok(Math.min(...pageX(right)) > 150 + 10)
  assert.equal(Math.min(...pageX(left)), 0)
  assert.equal(Math.max(...pageX(right)), 300)
  assert.notEqual(left.id, right.id)
  assert.equal(left.color, line().color)
})

test('점 사이가 넓어도 지우개가 그 사이를 지나가면 지운다', () => {
  const session = createEraserSession([line()], 6, 'area')
  session.move({ x: 200, y: 100 })
  assert.equal(session.finish().replacements.line.length, 2)
})

test('끝까지 문지르면 획이 모두 지워지고, 닿지 않은 획과 취소는 문서를 바꾸지 않는다', () => {
  const full = createEraserSession([line()], 10, 'area')
  full.move({ x: -10, y: 100 }, { x: 310, y: 100 })
  assert.deepEqual(full.finish().replacements, { line: [] })
  const miss = createEraserSession([line()], 10, 'area')
  miss.move({ x: 150, y: 300 })
  assert.equal(miss.finish(), null)
  const cancelled = createEraserSession([line()], 10, 'area')
  cancelled.move({ x: 150, y: 100 })
  assert.equal(cancelled.finish(true), null)
})

test('replaceObjects 는 같은 층 위치에 조각을 넣고 되돌리기 한 번으로 돌아간다', () => {
  const a = line('a'), b = line('b')
  const state = { doc: { pages: [{ id: 'p', objects: [a, b] }] }, pageId: 'p', selectedIds: ['a'], past: [], future: [] }
  const pieces = [{ ...a, id: 'a-0' }, { ...a, id: 'a-1' }]
  const next = editorReducer(state, { type: 'replaceObjects', replacements: { a: pieces } })
  assert.deepEqual(next.doc.pages[0].objects.map((o) => o.id), ['a-0', 'a-1', 'b'])
  assert.deepEqual(next.selectedIds, [])
  const undone = editorReducer(next, { type: 'undo' })
  assert.deepEqual(undone.doc.pages[0].objects.map((o) => o.id), ['a', 'b'])
})
