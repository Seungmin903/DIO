import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as common from '../src/editor/utils/common.js'
import * as reducer from '../src/editor/state/editorReducer.js'
import * as text from '../src/editor/utils/text.js'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const source = readFileSync(new URL('../src/editor/components/canvas/SelectionOverlay.js', import.meta.url), 'utf8')
const { code } = expo('@babel/core').transformSync(source + '\nexport { Handle, handlesFor, cursorFor }', {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

function fixture(object, zoom = 1) {
  let handlers
  const actions = []
  let state = reducer.createInitialState({ pages: [{ id: 'page', objects: [object] }] })
  const dispatch = (action) => { actions.push(action); state = reducer.editorReducer(state, action) }
  const module = { exports: {} }
  const load = (id) => {
    if (id === 'react') return { useRef: (current) => ({ current }) }
    if (id === 'react-native') return { View: 'view', Platform: { OS: 'web' }, StyleSheet: { create: (value) => value } }
    if (id.endsWith('/theme')) return { colors: {} }
    if (id.endsWith('/common')) return common
    if (id.endsWith('/text')) return text
    if (id.endsWith('/usePan')) return { usePan: (value) => { handlers = value; return {} } }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  return {
    api: module.exports, actions, state: () => state,
    handle: (handle) => {
      module.exports.Handle({ kind: 'resize', handle, object, zoom, dispatch, onInteracting() {} })
      return handlers
    },
    overlay: () => module.exports.default({ object, zoom, dispatch, onInteracting() {} }),
  }
}
const object = (extra = {}) => ({ id: 'object', type: 'stroke', x: 100, y: 80, w: 120, h: 60, rotation: 0, ...extra })
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
function anchor(o, handle) {
  const center = common.centerOf(o)
  const offset = common.rotateVector(-handle.sx * o.w / 2, -handle.sy * o.h / 2, o.rotation)
  return { x: center.x + offset.x, y: center.y + offset.y }
}

test('모든 크기 핸들은 확대·회전 상태에서 반대편 고정점을 유지한다', () => {
  for (const zoom of [0.5, 1, 2.5]) for (const rotation of [0, 37, 90, 225]) {
    const start = object({ rotation })
    for (const handle of fixture(start).api.handlesFor(start)) {
      const f = fixture(start, zoom), input = f.handle(handle)
      const delta = common.rotateVector(handle.sx * 30, handle.sy * 15, rotation)
      input.onStart()
      input.onMove(delta.x * zoom, delta.y * zoom)
      input.onEnd({ cancelled: false })
      const end = f.state().doc.pages[0].objects[0]
      close(end.w, start.w + (handle.sx ? 30 : 0))
      close(end.h, start.h + (handle.sy ? 15 : 0))
      const before = anchor(start, handle), after = anchor(end, handle)
      close(after.x, before.x); close(after.y, before.y)
      assert.equal(f.state().past.length, 1)
    }
  }
})

test('최소 크기를 지키며 단순 탭·크기 불변 입력은 이력을 만들지 않는다', () => {
  for (const delta of [0, -100]) {
    const f = fixture(object({ w: 20 })), input = f.handle({ sx: 1, sy: 0 })
    input.onStart(); input.onMove(delta, 0); input.onEnd({ cancelled: false })
    assert.equal(f.state().past.length, 0)
    assert.equal(f.state().doc.pages[0].objects[0].w, 20)
  }
  const f = fixture(object()), input = f.handle({ sx: -1, sy: -1 })
  input.onStart(); input.onMove(1000, 1000); input.onEnd({ cancelled: false })
  const end = f.state().doc.pages[0].objects[0]
  close(end.h, 20); close(end.w / end.h, 2)
})

test('크기 조절 취소는 원래 좌표와 크기를 복원하고 연속 드래그는 Undo 한 단계다', () => {
  for (const cancelled of [true, false]) {
    const start = object(), f = fixture(start), input = f.handle({ sx: 1, sy: 0 })
    input.onStart(); input.onMove(10, 0); input.onMove(30, 0); input.onEnd({ cancelled })
    assert.equal(f.state().past.length, cancelled ? 0 : 1)
    if (cancelled) assert.deepEqual(f.state().doc.pages[0].objects[0], start)
    else assert.equal(reducer.editorReducer(f.state(), { type: 'undo' }).doc.pages[0].objects[0].w, start.w)
  }
})

test('사진·스티커는 모서리만, 테이프는 길이만 조절하는 기존 규칙을 유지한다', () => {
  const api = fixture(object()).api
  for (const type of ['photo', 'sticker']) {
    const handles = api.handlesFor(object({ type }))
    assert.equal(handles.length, 4)
    assert.ok(handles.every((h) => h.sx && h.sy))
  }
  assert.deepEqual(api.handlesFor(object({ type: 'tape' })).map((h) => [h.sx, h.sy]), [[-1, 0], [1, 0]])
  assert.equal(api.handlesFor(object({ type: 'stroke' })).length, 8)
})

test('웹 양방향 커서는 회전된 변·모서리 방향에 맞는다', () => {
  const api = fixture(object()).api
  for (const [rotation, expected] of [[0, 'ew-resize'], [45, 'nwse-resize'], [90, 'ns-resize'], [135, 'nesw-resize'], [180, 'ew-resize']]) {
    assert.equal(api.cursorFor({ sx: 1, sy: 0 }, rotation), expected)
  }
  assert.equal(api.cursorFor({ sx: -1, sy: -1 }, 0), 'nwse-resize')
  assert.equal(api.cursorFor({ sx: 1, sy: -1 }, 0), 'nesw-resize')
})

test('텍스트 옆면은 기존 확대 배율의 글씨 크기를 유지하고 폭에 따라 줄바꿈한다', () => {
  for (const zoom of [0.5, 1, 2.5]) for (const sx of [-1, 1]) for (const scale of [1, 2]) {
    const start = text.createText({ id: 'text', x: 100, y: 80, width: 240, text: '가나다라마바사아자차카타파하', fontSize: 20 })
    start.w *= scale; start.h *= scale
    const f = fixture(start, zoom), input = f.handle({ sx, sy: 0 })
    input.onStart(); input.onMove(-sx * start.w / 2 * zoom, 0); input.onEnd({ cancelled: false })
    const end = f.state().doc.pages[0].objects[0]
    close(end.w, start.w / 2)
    close(end.w / end.baseWidth, scale)
    close(end.y, start.y)
    close(sx === 1 ? end.x : end.x + end.w, sx === 1 ? start.x : start.x + start.w)
    assert.ok(end.h > start.h)
    const settings = text.textSettings(end)
    assert.equal(settings.fontSize, 20)
    assert.equal(text.textStyle(end, end.w / end.baseWidth).fontSize, 20 * scale)
  }
})

test('텍스트 모서리는 글씨와 박스를 함께 확대하고 옆면 조절 취소는 기준 폭까지 복원한다', () => {
  const start = text.createText({ id: 'text', x: 100, y: 80, width: 240, text: '가나다라마바사', fontSize: 20 })
  const f = fixture(start), input = f.handle({ sx: 1, sy: 1 })
  input.onStart(); input.onMove(start.w, start.h); input.onEnd({ cancelled: false })
  const end = f.state().doc.pages[0].objects[0]
  close(end.w, start.w * 2); close(end.h, start.h * 2)
  assert.equal(end.baseWidth, start.baseWidth)
  assert.equal(text.textStyle(end, end.w / end.baseWidth).fontSize, 40)
  const cancelled = fixture(start), side = cancelled.handle({ sx: 1, sy: 0 })
  side.onStart(); side.onMove(-120, 0); side.onEnd({ cancelled: true })
  assert.deepEqual(cancelled.state().doc.pages[0].objects[0], start)
})
