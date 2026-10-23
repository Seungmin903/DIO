import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as common from '../src/editor/utils/common.js'
import * as reducer from '../src/editor/state/editorReducer.js'
import * as placement from '../src/editor/utils/popoverPlacement.js'
import * as text from '../src/editor/utils/text.js'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const source = readFileSync(new URL('../src/editor/components/canvas/SelectionOverlay.js', import.meta.url), 'utf8')
const { code } = expo('@babel/core').transformSync(source + '\nexport { Handle, handlesFor, cursorFor }', {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

function fixture(object, zoom = 1, textMinHeight = null) {
  let handlers
  const actions = []
  const angles = []
  let state = reducer.createInitialState({ pages: [{ id: 'page', objects: [object] }] })
  const dispatch = (action) => { actions.push(action); state = reducer.editorReducer(state, action) }
  const module = { exports: {} }
  const load = (id) => {
    if (id === 'react') return { useRef: (current) => ({ current }) }
    if (id === 'react-native') return { View: 'view', Platform: { OS: 'web' }, StyleSheet: { create: (value) => value } }
    if (id.endsWith('/theme')) return { colors: {} }
    if (id.endsWith('/common')) return common
    if (id.endsWith('/popoverPlacement')) return placement
    if (id.endsWith('/text')) return text
    if (id.endsWith('/usePan')) return { usePan: (value) => { handlers = value; return {} } }
    if (id === '../controls/Icon') return { __esModule: true, default: () => null }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  return {
    api: module.exports, actions, angles, state: () => state,
    handle: (handle, kind = 'resize') => {
      module.exports.Handle({ kind, handle, object, zoom, textMinHeight, dispatch, onInteracting() {}, onRotation: (angle) => angles.push(angle) })
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

test('텍스트는 네 변만 조절하고 옆면 취소는 원래 폭과 높이를 복원한다', () => {
  const start = text.createText({ id: 'text', x: 100, y: 80, width: 240, text: '가나다라마바사', fontSize: 20 })
  assert.deepEqual(fixture(start).api.handlesFor(start).map(({ sx, sy }) => [sx, sy]), [[0, -1], [0, 1], [-1, 0], [1, 0]])
  const cancelled = fixture(start), side = cancelled.handle({ sx: 1, sy: 0 })
  side.onStart(); side.onMove(-120, 0); side.onEnd({ cancelled: true })
  assert.deepEqual(cancelled.state().doc.pages[0].objects[0], start)
})

test('텍스트 상하 축소는 실측 내용 높이에서 멈추고 회전·배율과 반대편 고정점을 보존한다', () => {
  for (const zoom of [0.5, 1, 2.5]) for (const rotation of [0, 37, 90, 225]) for (const sy of [-1, 1]) {
    const start = { ...text.createText({ id: 'text', x: 100, y: 80, width: 240, text: 'Dynamic\n한글 둘째 줄\n마지막 줄', fontSize: 28, styleRanges: [{ start: 8, end: 10, fontSize: 40 }] }), h: 240, rotation }
    const handle = { sx: 0, sy }, f = fixture(start, zoom, 130), input = f.handle(handle)
    const delta = common.rotateVector(0, -sy * 1000, rotation)
    input.onStart(); input.onMove(delta.x * zoom, delta.y * zoom); input.onEnd({ cancelled: false })
    const end = f.state().doc.pages[0].objects[0]
    close(end.h, 130); close(end.w, start.w)
    const before = anchor(start, handle), after = anchor(end, handle)
    close(after.x, before.x); close(after.y, before.y)
    assert.equal(end.text, start.text)
    assert.equal(end.baseWidth, start.baseWidth)
    assert.equal(end.fontSize, start.fontSize)
    assert.deepEqual(end.styleRanges, start.styleRanges)
    const undone = reducer.editorReducer(f.state(), { type: 'undo' })
    assert.deepEqual(undone.doc.pages[0].objects[0], start)
    const restored = JSON.parse(JSON.stringify(reducer.editorReducer(undone, { type: 'redo' }).doc.pages[0].objects[0]))
    assert.deepEqual(restored, end)
  }
})

test('텍스트 높이 확장·취소와 실측 전 안전한 축소 한도를 유지한다', () => {
  const start = { ...text.createText({ id: 'text', x: 100, y: 80, text: '한 줄', fontSize: 28 }), h: 100 }
  for (const sy of [-1, 1]) {
    const f = fixture(start, 1, 38), input = f.handle({ sx: 0, sy })
    input.onStart(); input.onMove(0, sy * 70); input.onEnd({ cancelled: false })
    close(f.state().doc.pages[0].objects[0].h, 170)
    const cancelled = fixture(start, 1, 38), cancelInput = cancelled.handle({ sx: 0, sy })
    cancelInput.onStart(); cancelInput.onMove(0, sy * 70); cancelInput.onEnd({ cancelled: true })
    assert.deepEqual(cancelled.state().doc.pages[0].objects[0], start)
  }
  const f = fixture(start), input = f.handle({ sx: 0, sy: 1 })
  input.onStart(); input.onMove(0, -200); input.onEnd({ cancelled: false })
  assert.deepEqual(f.state().doc.pages[0].objects[0], start)
  assert.equal(f.state().past.length, 0)
})

function rotationInput(start, zoom = 1) {
  const f = fixture(start, zoom), input = f.handle(undefined, 'rotate')
  const radius = start.h / 2 + 34 / zoom
  const first = common.rotateVector(0, -radius, start.rotation)
  input.onStart()
  return { ...f, input, move: (angle) => {
    const next = common.rotateVector(0, -radius, angle)
    input.onMove((next.x - first.x) * zoom, (next.y - first.y) * zoom)
  } }
}

test('회전은 확대 배율과 시작 각도에 관계없이 0~360도 범위로 저장하고 표시한다', () => {
  for (const zoom of [0.5, 1, 2.5]) for (const initial of [0, 37, 180, 315]) {
    for (const target of [0, 45, 90, 135, 180, 225, 270, 315, 355]) {
      const start = object({ rotation: initial }), f = rotationInput(start, zoom)
      assert.equal(f.angles[0], initial)
      f.move(target)
      const result = f.state().doc.pages[0].objects[0]
      close(result.rotation, target)
      assert.ok(result.rotation >= 0 && result.rotation < 360)
      assert.deepEqual([result.x, result.y, result.w, result.h], [start.x, start.y, start.w, start.h])
      f.input.onEnd({ cancelled: false })
      assert.equal(f.angles.at(-1), null)
      close(f.state().doc.pages[0].objects[0].rotation, target)
    }
  }
})

test('회전은 직각 근처에서 붙고 경계를 넘으면 각도가 순환한다', () => {
  const f = rotationInput(object())
  for (const [target, expected] of [[88, 90], [182, 180], [268, 270], [358, 0], [362, 0], [-5, 355], [365, 5]]) {
    f.move(target)
    close(f.state().doc.pages[0].objects[0].rotation, expected)
    close(f.angles.at(-1), expected)
  }
  assert.equal(f.state().past.length, 1)
})

test('회전 핸들 단순 탭은 현재 각도만 표시하고 이력을 추가하지 않는다', () => {
  const f = rotationInput(object({ rotation: 37 }))
  f.input.onEnd({ cancelled: false })
  assert.deepEqual(f.angles, [37, null])
  assert.equal(f.state().past.length, 0)
})

test('회전 종료는 값을 유지하고 취소는 원래 각도를 복원한다', () => {
  for (const cancelled of [false, true]) {
    const start = object({ rotation: 37 }), f = rotationInput(start)
    f.move(100); f.move(230)
    f.input.onEnd({ cancelled })
    assert.equal(f.angles.at(-1), null)
    close(f.state().doc.pages[0].objects[0].rotation, cancelled ? 37 : 230)
    assert.equal(f.state().past.length, cancelled ? 0 : 1)
    if (!cancelled) {
      const restored = reducer.editorReducer(f.state(), { type: 'undo' })
      close(restored.doc.pages[0].objects[0].rotation, 37)
      close(reducer.editorReducer(restored, { type: 'redo' }).doc.pages[0].objects[0].rotation, 230)
    }
  }
})
