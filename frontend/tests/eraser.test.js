import test from 'node:test'
import assert from 'node:assert/strict'
import { createEraserSession, eraserPreviewPage, ERASER_RADIUS } from '../src/editor/utils/eraser.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { createInitialState, editorReducer, getCurrentPage } from '../src/editor/state/editorReducer.js'

const line = (id, y = 100, settings = {}) => createStroke([{ x: 40, y }, { x: 240, y }], { id, width: 4, ...settings })
const hit = (object, point, radius = ERASER_RADIUS) => createEraserSession([object], radius).move(point)

test('미리보기는 편집 중 텍스트를 숨기고 획 조각을 제자리에 넣으며 원본을 보존한다', () => {
  const a = { id: 'a' }, text = { id: 'text' }, stroke = { id: 'stroke' }, b = { id: 'b' }
  const pieces = [{ id: 'piece-1' }, { id: 'piece-2' }]
  const page = { id: 'page', objects: [a, text, stroke, b] }
  assert.deepEqual(eraserPreviewPage(page, ['text', 'stroke'], { stroke: pieces }).objects, [a, ...pieces, b])
  assert.deepEqual(page.objects, [a, text, stroke, b])
  assert.equal(eraserPreviewPage(page, [], null), page)
  assert.deepEqual(eraserPreviewPage(page, ['stroke'], null).objects, [a, text, b])
})

test('샘플 점 사이에 닿아도 획 전체를 지우고 큰 경계 상자 안의 빈 곳은 지우지 않는다', () => {
  const stroke = line('line'), original = structuredClone(stroke)
  assert.deepEqual(hit(stroke, { x: 140, y: 100 }), ['line'])
  const session = createEraserSession([stroke])
  session.move({ x: 140, y: 100 })
  assert.deepEqual(session.finish(), { type: 'removeObjects', ids: ['line'] })
  assert.deepEqual(stroke, original)
  const u = createStroke([{ x: 20, y: 20 }, { x: 20, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 20 }], { id: 'u', width: 3 })
  assert.deepEqual(hit(u, { x: 110, y: 80 }), [])
})

test('빠른 드래그의 두 이벤트 사이를 지나간 가는 획도 놓치지 않는다', () => {
  const vertical = createStroke([{ x: 150, y: 0 }, { x: 150, y: 200 }], { id: 'v', width: 1 })
  const session = createEraserSession([vertical])
  assert.deepEqual(session.move({ x: 0, y: 100 }), [])
  assert.deepEqual(session.move({ x: 0, y: 100 }, { x: 300, y: 100 }), ['v'])
})

test('지우개는 펜·형광펜만 지우고 잠금·숨김 획과 사진·텍스트·스티커·테이프는 보존한다', () => {
  const objects = [line('pen'), line('hl', 100, { kind: 'highlighter', width: 20 }),
    { ...line('locked'), locked: true }, { ...line('hidden'), hidden: true },
    ...['photo', 'text', 'sticker', 'tape'].map((type) => ({ ...line(type), type }))]
  const session = createEraserSession(objects)
  assert.deepEqual(session.move({ x: 100, y: 100 }), ['pen', 'hl'])
  assert.deepEqual(session.move({ x: 100, y: 100 }), ['pen', 'hl'])
})

test('단일 점과 두꺼운 획의 가장자리, 라운드·스퀘어 끝 모양을 반영한다', () => {
  const dot = createStroke([{ x: 100, y: 100, pressure: 2 }], { id: 'dot', width: 10 })
  assert.deepEqual(hit(dot, { x: 108, y: 100 }, 0), ['dot'])
  assert.deepEqual(hit(dot, { x: 111, y: 100 }, 0), [])
  const round = line('round', 100, { kind: 'highlighter', width: 20, lineCap: 'round' })
  const square = line('square', 100, { kind: 'highlighter', width: 20, lineCap: 'square' })
  assert.deepEqual(hit(round, { x: 31, y: 109 }, 0), [])
  assert.deepEqual(hit(square, { x: 31, y: 109 }, 0), ['square'])
  assert.deepEqual(hit(square, { x: 100, y: 109 }, 0), ['square'])
  assert.deepEqual(hit(square, { x: 100, y: 111 }, 0), [])
})

test('이동·비균등 크기 변경·회전·반전된 획은 표시 좌표에서 판정한다', () => {
  const stroke = { id: 'transformed', type: 'stroke', x: 300, y: 200, w: 200, h: 50, baseWidth: 100, baseHeight: 100,
    rotation: 90, flipX: true, strokeWidth: 4, penKind: 'ball', renderVersion: 2,
    points: [{ x: 10, y: 20 }, { x: 30, y: 20 }] }
  assert.deepEqual(hit(stroke, { x: 415, y: 285 }, 0), ['transformed'])
  assert.deepEqual(hit(stroke, { x: 415, y: 285 }, 1), ['transformed'])
  assert.deepEqual(hit(stroke, { x: 415, y: 165 }), [])
  // 두께 역시 비균등 배율을 따라야 하며 max(scale)로 부풀려 잡지 않는다.
  const flat = { ...stroke, rotation: 0, flipX: false, points: [{ x: 10, y: 50 }, { x: 90, y: 50 }], strokeWidth: 20 }
  assert.deepEqual(hit(flat, { x: 400, y: 229 }, 0), ['transformed'])
  assert.deepEqual(hit(flat, { x: 400, y: 231 }, 0), [])
})

test('붓펜·만년필·연필과 이전 가변 굵기 획을 지울 수 있다', () => {
  for (const kind of ['ball', 'pencil', 'brush', 'fountain']) {
    const stroke = createStroke([{ x: 30, y: 80, pressure: 1 }, { x: 130, y: 80, pressure: 2 }, { x: 230, y: 80, pressure: 0.7 }], { id: kind, kind, width: 10 })
    assert.deepEqual(hit(stroke, { x: 130, y: 80 }, 1), [kind])
    assert.deepEqual(hit({ ...stroke, renderVersion: 1 }, { x: 130, y: 80 }, 1), [kind])
  }
})

test('삭제 후보는 확정 전 문서·히스토리를 바꾸지 않고, 여러 획 삭제도 Undo/Redo 한 단계다', () => {
  const original = { id: 'doc', pages: [{ id: 'page', objects: [line('a', 100), line('b', 160), { id: 'text', type: 'text', text: '유지' }] }] }
  let state = createInitialState(original)
  const session = createEraserSession(getCurrentPage(state).objects)
  session.move({ x: 100, y: 100 }, { x: 100, y: 160 })
  assert.equal(state.doc, original)
  assert.equal(state.past.length, 0)
  state = editorReducer(state, session.finish())
  assert.deepEqual(getCurrentPage(state).objects.map((o) => o.id), ['text'])
  assert.equal(state.past.length, 1)
  const saved = JSON.parse(JSON.stringify(state.doc))
  assert.deepEqual(getCurrentPage(createInitialState(saved)).objects.map((o) => o.id), ['text'])
  state = editorReducer(state, { type: 'undo' })
  assert.deepEqual(state.doc, original)
  state = editorReducer(state, { type: 'redo' })
  assert.deepEqual(state.doc, saved)
})

test('빈 곳·제스처 취소·중복 종료는 문서에 삭제 액션을 보내지 않는다', () => {
  const blank = createEraserSession([line('a')])
  blank.move({ x: 500, y: 400 })
  assert.equal(blank.finish(), null)
  const cancelled = createEraserSession([line('a')])
  cancelled.move({ x: 100, y: 100 })
  assert.equal(cancelled.finish(true), null)
  assert.equal(cancelled.finish(), null)
  assert.deepEqual(cancelled.move({ x: 100, y: 100 }), ['a'])
  const once = createEraserSession([line('a')])
  once.move({ x: 100, y: 100 })
  assert.ok(once.finish())
  assert.equal(once.finish(), null)
})

test('화면 배율 0.5/1/2.5를 페이지 좌표로 환산해 같은 위치의 획을 지운다', () => {
  for (const zoom of [0.5, 1, 2.5]) {
    const screen = { x: 140 * zoom, y: 100 * zoom }
    assert.deepEqual(hit(line('a'), { x: screen.x / zoom, y: screen.y / zoom }), ['a'])
  }
})
