import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as strokes from '../src/editor/utils/strokes.js'
import * as assist from '../src/editor/utils/strokeAssist.js'
import * as settings from '../src/editor/utils/penSettings.js'
import * as preview from '../src/editor/utils/strokePreview.js'
import * as pencilBrush from '../src/editor/utils/pencilBrush.js'
import * as measurement from '../src/editor/utils/penPerformance.js'
import * as previewStore from '../src/editor/utils/penPreviewStore.js'
import { acknowledgeStrokeDisplay } from '../src/editor/utils/strokeDisplayHandoff.js'
import * as motion from '../src/editor/utils/penMotion.js'
import * as hook from '../src/editor/utils/penHook.js'
import * as pointer from '../src/editor/utils/penPointerInput.js'
import * as materials from '../src/editor/utils/penMaterials.js'
import * as stylusSensor from '../src/editor/utils/stylusSensor.js'
import * as nib from '../src/editor/utils/nibStroke.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/PenInput.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function fixture(kind, zoom = 1, straightAssist = true, web = false, realStylus = false) {
  let handlers, timer, cursor = 0, tree, strokeSequence = 0
  const refs = [], effects = [], cleanups = []
  const actions = [], converted = []
  const module = { exports: {} }
  const stylusModule = { exports: {} }
  if (realStylus) {
    const source = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/utils/stylus.js', import.meta.url), 'utf8'), {
      configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
    }).code
    new Function('require', 'module', 'exports', source)((id) => {
      if (id === 'react-native') return { Platform: { OS: web ? 'web' : 'ios' } }
      if (id.endsWith('/drawingInput')) return { markPenSeen() {} }
      if (id.endsWith('/stylusSensor.js')) return stylusSensor
      return require(id)
    }, stylusModule, stylusModule.exports)
  }
  const load = (id) => {
    if (id === 'react') return {
      useRef: (current) => { const i = cursor++; return refs[i] ??= { current } },
      useState: () => [null, () => {}], useEffect(fn) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup) },
      useLayoutEffect: (fn, deps) => { const i = cursor++; if (!effects[i] || deps.some((v, n) => v !== effects[i][n])) { fn(); effects[i] = deps } },
    }
    if (id === 'react-native') return { Platform: { OS: web ? 'web' : 'ios' }, View: 'view', StyleSheet: { create: (v) => v } }
    if (id.endsWith('/useStylusTouchBridge')) return { useStylusTouchBridge: () => undefined }
    if (id.endsWith('/usePan')) return { usePan: (value) => { handlers = value; return {} } }
    if (id.endsWith('/constants')) return { PAGE_WIDTH: 1188, PAGE_HEIGHT: 840 }
    if (id.endsWith('/common')) return { createId: () => `stroke-${++strokeSequence}` }
    if (id.endsWith('/strokes')) return { ...strokes, createStroke: (...args) => { converted.push(args[0].length); return strokes.createStroke(...args) } }
    if (id.endsWith('/penSettings')) return settings
    if (id.endsWith('/penDynamics')) return { getPenDynamics: () => ({ pressure: true, tilt: true }) }
    if (id.endsWith('/strokePreview.js')) return preview
    if (id.endsWith('/pencilBrush.js')) return pencilBrush
    if (id.endsWith('/penPerformance.js')) return measurement
    if (id.endsWith('/penPreviewStore.js')) return previewStore
    if (id.endsWith('/penMotion.js')) return motion
    if (id.endsWith('/penHook.js')) return hook
    if (id.endsWith('/penPointerInput.js')) return pointer
    if (id.endsWith('/penMaterials.js')) return materials
    if (id.endsWith('/stylusSensor.js')) return stylusSensor
    if (id.endsWith('/stylus')) return realStylus ? stylusModule.exports : { setPenPointerActive() {}, isSameIOSPenContact: (touch, pointerId) => touch?.identifier === 1 && pointerId === 9 }
    if (id.endsWith('/PenPreview')) return { __esModule: true, default: () => null }
    if (id.endsWith('/StrokePreview')) return { __esModule: true, default: () => null }
    if (id.endsWith('/strokeAssist')) return { ...assist, createHighlighterHold: (options) => assist.createHighlighterHold({ ...options,
      schedule: (callback) => { timer = callback; return 1 }, unschedule: () => { timer = null },
    }) }
    if (id.endsWith('/ObjectView')) return { __esModule: true, default: () => null }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  const render = (next = {}) => { cursor = 0; tree = module.exports.default({ zoom, straightAssist, dispatch: (a) => actions.push(a), settings: { kind, color: '#123456', width: 4 }, ...next }) }
  render()
  return { get handlers() { return handlers }, get pointers() { return tree.props }, get store() { return tree.props.children.props.store }, stylus: stylusModule.exports, actions, converted, render, unmount: () => cleanups.forEach(fn => fn()), hold: () => { const callback = timer; timer = null; callback?.() } }
}

test('색 선택·취소는 기록하지 않고 확정된 실제 획 색을 한 번만 전달한다', () => {
  const f = fixture('fountain', 1, false), used = []
  f.render({ onStrokeCommitted: object => used.push(object) })
  assert.deepEqual(used, [])
  f.handlers.onStart({ locationX: 20, locationY: 30 })
  f.handlers.onMove(40, 0, {})
  f.handlers.onEnd({ cancelled: true })
  assert.deepEqual(used, [])
  f.handlers.onStart({ locationX: 20, locationY: 30 })
  f.handlers.onMove(40, 0, {})
  f.handlers.onEnd({ cancelled: false })
  f.handlers.onEnd({ cancelled: false })
  assert.equal(used.length, 1)
  assert.equal(used[0], f.actions[0].objects[0])
  assert.equal(used[0].color, '#123456')
})

test('플래너 칸 기록으로 소비되어 남지 않은 획은 최근 색에 기록하지 않는다', () => {
  const f = fixture('highlighter', 1, false), used = []
  f.render({ onStrokeCommitted: object => used.push(object), onPlannerStroke: () => true })
  f.handlers.onStart({ locationX: 20, locationY: 30 })
  f.handlers.onMove(40, 0, {})
  f.handlers.onEnd({ cancelled: false })
  assert.deepEqual(used, []); assert.deepEqual(f.actions, [])
})

test('Pencil 포인터 실측 필압은 responder와 중복 저장하지 않고 새 획에만 재질 버전을 붙인다', () => {
  const f = fixture('fountain', 1, false)
  const event = (x, pressure, timeStamp) => ({ nativeEvent: { pointerId: 9, pointerType: 'pen', offsetX: x, offsetY: 30,
    clientX: x + 100, clientY: 230, pressure, timeStamp, tiltX: 20, tiltY: 10 } })
  f.pointers.onPointerDown(event(20, 0.1, 100))
  f.handlers.onStart({ locationX: 20, locationY: 30, force: 0 })
  f.pointers.onPointerMove(event(60, 0.8, 110))
  f.handlers.onMove(40, 0, { force: 0 })
  f.handlers.onEnd({ cancelled: false })
  assert.equal(f.actions.length, 0)
  f.pointers.onPointerUp(event(80, 0, 120))
  f.handlers.onEnd({ cancelled: false })
  assert.equal(f.actions.length, 1)
  const stroke = f.actions[0].objects[0]
  assert.equal(stroke.renderVersion, 3)
  assert.equal(stroke.points[0].force, 0.1)
  assert.equal(stroke.points[1].force, 0.8)
  assert.equal(stroke.points.at(-1).force, 0.8)
  assert.equal(stroke.points.at(-1).time, 20)
  assert.equal(stroke.points.at(-1).x - stroke.points[0].x, 60)
})

test('responder가 먼저 그린 뒤 같은 Pencil 포인터가 시작해도 처음부터 한 획으로 보존한다', () => {
  const f = fixture('fountain', 1, false)
  const event = (x, timeStamp) => ({ nativeEvent: { pointerId: 9, pointerType: 'pen', offsetX: x, offsetY: 30,
    clientX: x + 100, clientY: 230, pressure: 0.5, timeStamp } })
  f.handlers.onStart({ locationX: 10, locationY: 30, identifier: 1, pageX: 110, pageY: 230, force: 0 })
  f.handlers.onMove(10, 0, { force: 0 })
  f.pointers.onPointerDown(event(20, 100))
  f.pointers.onPointerMove(event(40, 110))
  f.handlers.onEnd({ cancelled: false })
  f.pointers.onPointerUp(event(50, 120))
  f.handlers.onEnd({ cancelled: false })
  const additions = f.actions.filter(action => action.type === 'addObjects')
  assert.equal(additions.length, 1)
  const stroke = additions[0].objects[0], points = stroke.points
  assert.equal(stroke.x + points[0].x, 10)
  assert.equal(stroke.x + points.at(-1).x, 50)
})

test('실제 iOS 접촉 판정과 PenInput: 터치가 먼저 오고 포인터가 늦어도 한 획의 처음과 끝을 보존한다', () => {
  const f = fixture('fountain', 1, false, false, true)
  const event = (x, timeStamp) => ({ nativeEvent: { pointerId: 9, pointerType: 'pen', offsetX: x, offsetY: 30,
    clientX: x + 100, clientY: 230, pressure: 0.5, timeStamp } })
  f.handlers.onStart({ locationX: 10, locationY: 30, identifier: 1, pageX: 110, pageY: 230, force: 0 })
  f.handlers.onMove(10, 0, { force: 0 })
  f.stylus.notePointerDown(event(10, 100))
  f.pointers.onPointerDown(event(10, 100))
  f.pointers.onPointerMove(event(40, 110))
  f.handlers.onEnd({ cancelled: false })
  f.pointers.onPointerUp(event(50, 120))
  f.handlers.onEnd({ cancelled: false })
  const additions = f.actions.filter(action => action.type === 'addObjects')
  assert.equal(additions.length, 1)
  const stroke = additions[0].objects[0]
  assert.equal(stroke.x + stroke.points[0].x, 10)
  assert.equal(stroke.x + stroke.points.at(-1).x, 50)
})

test('실제 iOS 접촉 판정과 PenInput: 포인터가 먼저 오면 responder와 중복 저장하지 않는다', () => {
  const f = fixture('highlighter', 1, false, false, true)
  const event = (x, timeStamp) => ({ nativeEvent: { pointerId: 9, pointerType: 'pen', offsetX: x, offsetY: 30,
    clientX: x + 100, clientY: 230, pressure: 0.5, timeStamp } })
  f.stylus.notePointerDown(event(10, 100))
  f.pointers.onPointerDown(event(10, 100))
  f.handlers.onStart({ locationX: 10, locationY: 30, identifier: 1, pageX: 110, pageY: 230 })
  f.handlers.onMove(20, 0, { force: 0 })
  f.pointers.onPointerMove(event(30, 110))
  f.pointers.onPointerUp(event(50, 120))
  f.handlers.onEnd({ cancelled: false })
  const additions = f.actions.filter(action => action.type === 'addObjects')
  assert.equal(additions.length, 1)
  const stroke = additions[0].objects[0]
  assert.equal(stroke.x + stroke.points[0].x, 10)
  assert.equal(stroke.x + stroke.points.at(-1).x, 50)
})

test('iOS 확대·이동 뒤 responder에서 포인터로 인계해도 한 획의 시작과 끝이 유지된다', () => {
  for (const zoom of [0.5, 2]) for (const origin of [{ x: 100, y: 200 }, { x: -80, y: 430 }]) {
    const f = fixture('fountain', zoom, false, false, true)
    const pointer = (x, stamp) => ({ nativeEvent: { pointerId: 9, pointerType: 'pen', offsetX: x, offsetY: 30 * zoom,
      clientX: origin.x + x, clientY: origin.y + 30 * zoom, pressure: 0.5, timeStamp: stamp } })
    const startX = 10 * zoom
    f.handlers.onStart({ locationX: startX, locationY: 30 * zoom, identifier: 1,
      pageX: origin.x + startX, pageY: origin.y + 30 * zoom, force: 0 })
    f.handlers.onMove(10 * zoom, 0, { force: 0 })
    f.stylus.notePointerDown(pointer(startX, 100))
    f.pointers.onPointerDown(pointer(20 * zoom, 100))
    f.pointers.onPointerMove(pointer(40 * zoom, 110))
    f.handlers.onEnd({ cancelled: false })
    f.pointers.onPointerUp(pointer(50 * zoom, 120))
    const additions = f.actions.filter(action => action.type === 'addObjects')
    assert.equal(additions.length, 1, `zoom=${zoom}, origin=${origin.x}`)
    const stroke = additions[0].objects[0]
    assert.equal(stroke.x + stroke.points[0].x, 10)
    assert.equal(stroke.x + stroke.points.at(-1).x, 50)
    f.stylus.resetStylusPointers()
  }
})

test('실제 iOS 접촉 판정과 PenInput: 다른 위치의 손가락 획을 Pencil에 결합하지 않는다', () => {
  const f = fixture('fountain', 1, false, false, true)
  const event = (x, timeStamp) => ({ nativeEvent: { pointerId: 9, pointerType: 'pen', offsetX: x, offsetY: 30,
    clientX: x + 100, clientY: 230, pressure: 0.5, timeStamp } })
  f.stylus.notePointerDown({ nativeEvent: { pointerId: 2, pointerType: 'touch', clientX: 110, clientY: 230 } })
  f.handlers.onStart({ locationX: 10, locationY: 30, identifier: 1, pageX: 110, pageY: 230, force: 0 })
  f.handlers.onMove(10, 0, { force: 0 })
  f.stylus.notePointerDown(event(60, 100))
  f.pointers.onPointerDown(event(60, 100))
  f.pointers.onPointerMove(event(80, 110))
  f.pointers.onPointerUp(event(90, 120))
  const additions = f.actions.filter(action => action.type === 'addObjects')
  assert.equal(additions.length, 1)
  const stroke = additions[0].objects[0]
  assert.equal(stroke.x + stroke.points[0].x, 60)
  assert.equal(stroke.x + stroke.points.at(-1).x, 90)
})

test('미지원 responder의 0은 force로 저장하지 않고, 실측 수신 뒤의 0만 보존한다', () => {
  const missing = fixture('fountain', 1, false)
  missing.handlers.onStart({ locationX: 10, locationY: 10, force: 0 })
  missing.handlers.onMove(20, 0, { force: 0 })
  missing.handlers.onEnd({ cancelled: false })
  assert.ok(missing.actions[0].objects[0].points.every(point => !('force' in point)))
  const sensed = fixture('fountain', 1, false)
  sensed.handlers.onStart({ locationX: 10, locationY: 10, force: 0.4 })
  sensed.handlers.onMove(20, 0, { force: 0 })
  sensed.handlers.onEnd({ cancelled: false })
  assert.deepEqual(sensed.actions[0].objects[0].points.map(p => p.force), [0.4, 0])
})

test('실제 필압의 증감이 저장되고, 정지 중 압력 변화와 해제의 0을 구분한다', () => {
  const f = fixture('brush', 1, false), h = f.handlers
  h.onStart({ locationX: 20, locationY: 30, force: 0.2 })
  h.onMove(40, 0, { force: 0.8 })
  h.onMove(80, 0, { force: 0.8 })
  const before = f.store.getSnapshot().parts.at(-1).points.at(-1).pressure
  for (let i = 0; i < 15; i++) h.onMove(80, 0, { force: 0.05 })
  const after = f.store.getSnapshot().parts.at(-1).points.at(-1).pressure
  assert.ok(after < before)
  h.onMove(80, 0, { force: 0, isRelease: true })
  h.onEnd({ cancelled: false })
  const points = f.actions[0].objects[0].points
  assert.equal(points.length, 3)
  assert.equal(points.at(-1).pressure, after)
})

test('모든 펜과 형광펜은 끝점 유지 후 직선 하나로 확정하고 설정·선택 해제를 유지한다', () => {
  for (const kind of [...settings.PEN_TYPES.map((p) => p.id), 'highlighter']) for (const zoom of [0.5, 1, 2]) {
    const f = fixture(kind, zoom), h = f.handlers
    h.onStart({ locationX: 20 * zoom, locationY: 30 * zoom })
    h.onMove(50 * zoom, 80 * zoom, {})
    h.onMove(150 * zoom, 10 * zoom, {})
    f.hold()
    h.onEnd({ cancelled: false })
    // 획 추가와 선택 해제는 한 번의 dispatch 로 보낸다(전체 화면을 두 번 그리지 않게)
    assert.equal(f.actions.length, 1)
    const stroke = f.actions[0].objects[0]
    assert.equal(stroke.points.length, 2)
    assert.equal(stroke.penKind, kind)
    assert.equal(stroke.color, '#123456')
    assert.equal(f.actions[0].select, false)
  }
})

test('빠른 해제는 자유곡선을 유지하고 두 손가락·responder 취소는 획을 저장하지 않는다', () => {
  for (const mode of ['release', 'multi', 'cancel']) {
    const f = fixture('ball'), h = f.handlers
    h.onStart({ locationX: 20, locationY: 30 })
    h.onMove(50, 80, {}); h.onMove(150, 10, {})
    if (mode === 'multi') h.onMove(150, 10, { touches: [{}, {}] })
    h.onEnd({ cancelled: mode === 'cancel' })
    f.hold()
    if (mode === 'release') assert.equal(f.actions[0].objects[0].points.length, 3)
    else assert.deepEqual(f.actions, [])
  }
})

test('페이지 밖으로 나갔다 다시 들어와도 이미 보정한 직선으로 저장한다', () => {
  for (const kind of ['ball', 'highlighter']) {
    const f = fixture(kind), h = f.handlers
    h.onStart({ locationX: 20, locationY: 30 })
    h.onMove(50, 80, {}); h.onMove(150, 10, {}); f.hold()
    h.onMove(1300, 50, {}); h.onMove(200, 50, {}); f.hold()
    h.onEnd({ cancelled: false })
    assert.equal(f.actions[0].objects[0].points.length, 2)
  }
})

test('직선 보정을 끄면 펜·형광펜 모두 끝점 유지 후에도 자유곡선으로 저장한다', () => {
  for (const kind of ['ball', 'fountain', 'brush', 'pencil', 'highlighter']) {
    const f = fixture(kind, 1, false), h = f.handlers
    h.onStart({ locationX: 20, locationY: 30 })
    h.onMove(50, 80, {}); h.onMove(150, 10, {}); f.hold()
    h.onEnd({ cancelled: false })
    assert.equal(f.actions[0].objects[0].points.length, 3)
  }
})


test('필기 중 배율 변경은 진행 획과 직선 보정 타이머를 취소하고 다음 획은 새 배율을 쓴다', () => {
  for (const kind of ['ball', 'highlighter']) {
    const f = fixture(kind)
    f.handlers.onStart({ locationX: 20, locationY: 30 })
    f.handlers.onMove(100, 20, {})
    f.render({ zoom: 2 })
    f.hold()
    f.handlers.onEnd({ cancelled: false })
    assert.deepEqual(f.actions, [])
    f.handlers.onStart({ locationX: 40, locationY: 60 })
    f.handlers.onMove(200, 40, {})
    f.handlers.onEnd({ cancelled: false })
    const points = f.actions[0].objects[0].points
    assert.equal(points[1].x - points[0].x, 100)
    assert.equal(points[1].y - points[0].y, 20)
  }
})


test('도구 정책 변경·언마운트 후 지연된 직선 보정이나 획을 확정하지 않는다', () => {
  for (const kind of ['ball', 'highlighter']) for (const change of [
    { straightAssist: false }, { pageWidth: 600 }, { settings: { kind: 'pencil', color: '#123456', width: 4 } }, 'unmount',
  ]) {
    const f = fixture(kind)
    f.handlers.onStart({ locationX: 20, locationY: 30 })
    f.handlers.onMove(100, 20, {})
    if (change === 'unmount') f.unmount()
    else f.render(change)
    f.hold(); f.handlers.onEnd({ cancelled: false })
    assert.deepEqual(f.actions, [])
  }
})


test('팀원의 프레임 미리보기 예약도 배율 변경·두 손가락 취소 때 함께 제거한다', () => {
  const request = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame
  const frames = new Map(); let id = 0
  globalThis.requestAnimationFrame = fn => { frames.set(++id, fn); return id }
  globalThis.cancelAnimationFrame = key => frames.delete(key)
  try {
    for (const kind of ['ball', 'highlighter']) for (const mode of ['zoom', 'multi']) {
      const f = fixture(kind)
      f.handlers.onStart({ locationX: 20, locationY: 30 })
      f.handlers.onMove(100, 20, {})
      assert.equal(frames.size, 1)
      if (mode === 'zoom') f.render({ zoom: 2 })
      else f.handlers.onMove(100, 20, { touches: [{}, {}] })
      assert.equal(frames.size, 0)
      f.hold(); f.handlers.onEnd({ cancelled: false })
      assert.deepEqual(f.actions, [])
    }
  } finally {
    if (request) globalThis.requestAnimationFrame = request; else delete globalThis.requestAnimationFrame
    if (cancel) globalThis.cancelAnimationFrame = cancel; else delete globalThis.cancelAnimationFrame
  }
})


test('한 프레임 안의 입력을 모두 보존하고 전체 획 변환은 확정할 때만 한다', () => {
  const request = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame
  const frames = new Map(); let id = 0
  globalThis.requestAnimationFrame = fn => { frames.set(++id, fn); return id }
  globalThis.cancelAnimationFrame = key => frames.delete(key)
  try {
    const f = fixture('fountain', 1, false)
    const store = f.store, seen = []
    store.subscribe(() => seen.push(store.getSnapshot()))
    f.handlers.onStart({ locationX: 10, locationY: 20 })
    for (let x = 1; x <= 100; x++) f.handlers.onMove(x, x / 2, {})
    assert.equal(frames.size, 1)
    assert.deepEqual(f.converted, [], '화면 프레임 전에 O(n) 변환을 반복하지 않는다')
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn())
    assert.equal(seen.length, 2, '즉시 시작점 1회와 이동 미리보기 1회만 전달한다')
    assert.equal(seen[0].parts[0].points.length, 1)
    assert.equal(new Set(store.getSnapshot().parts.flatMap(part => part.points.map(point => `${point.x},${point.y}`))).size, 101)
    assert.deepEqual(f.actions, [], '미리보기 갱신은 문서를 변경하지 않는다')
    assert.deepEqual(f.converted, [], '미리보기는 전체 저장 좌표 변환을 호출하지 않는다')
    f.handlers.onMove(110, 55, {})
    f.handlers.onEnd({ cancelled: false })
    assert.equal(frames.size, 0)
    assert.equal(store.getSnapshot(), null, '확정 시 미리보기만 비우고 원본 획으로 인계한다')
    const stroke = f.actions[0].objects[0]
    assert.equal(stroke.points.length, 102)
    assert.equal(stroke.points.at(-1).x - stroke.points[0].x, 110)
    assert.deepEqual(f.converted, [102], '마지막 프레임을 기다리지 않고 전체 좌표를 한 번 확정한다')
  } finally {
    if (request) globalThis.requestAnimationFrame = request; else delete globalThis.requestAnimationFrame
    if (cancel) globalThis.cancelAnimationFrame = cancel; else delete globalThis.cancelAnimationFrame
  }
})

test('모든 펜의 긴 필기에서도 프레임마다 전체 좌표를 복사하지 않고 한 획으로 확정한다', () => {
  const request = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame
  const frames = new Map(); let id = 0
  globalThis.requestAnimationFrame = fn => { frames.set(++id, fn); return id }
  globalThis.cancelAnimationFrame = key => frames.delete(key)
  try {
    for (const kind of [...settings.PEN_TYPES.map(item => item.id), 'highlighter']) {
      const f = fixture(kind, 1, false)
      f.handlers.onStart({ locationX: 10, locationY: 20 })
      for (let i = 1; i <= 5000; i++) {
        f.handlers.onMove(i, Math.sin(i / 10) * 40, {})
        if (i % 8 === 0) {
          const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn())
        }
      }
      assert.deepEqual(f.converted, [])
      f.handlers.onEnd({ cancelled: false })
      assert.deepEqual(f.converted, [5001])
      assert.equal(f.actions[0].objects[0].points.length, 5001)
      assert.equal(f.actions[0].objects[0].points.at(-1).x - f.actions[0].objects[0].points[0].x, 5000)
      assert.equal(frames.size, 0)
    }
  } finally {
    if (request) globalThis.requestAnimationFrame = request; else delete globalThis.requestAnimationFrame
    if (cancel) globalThis.cancelAnimationFrame = cancel; else delete globalThis.cancelAnimationFrame
  }
})

test('RAF 전에 끝나는 연속 획도 즉시 시작점이 보이고 이전 콜백이 다음 획을 지우지 않는다', () => {
  const request = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame
  const frames = new Map(); let frameId = 0
  globalThis.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId }
  globalThis.cancelAnimationFrame = id => frames.delete(id)
  try {
    const f = fixture('fountain', 1, false), ids = new Set()
    let stale
    for (let i = 0; i < 20; i++) {
      f.handlers.onStart({ locationX: 10, locationY: 20 + i })
      const first = f.store.getSnapshot()
      assert.ok(first, '시작점은 다음 RAF 전에도 존재해야 한다')
      assert.equal(first.parts[0].points.length, 1)
      ids.add(first.strokeId)
      stale?.()
      assert.equal(f.store.getSnapshot(), first, '이전 획의 늦은 콜백이 새 시작점을 비우지 않는다')
      f.handlers.onMove(20, 0, {})
      stale = [...frames.values()].at(-1)
      f.handlers.onEnd({ cancelled: false })
      assert.equal(f.store.getSnapshot(), null)
    }
    assert.equal(ids.size, 20)
    assert.equal(f.actions.filter(action => action.type === 'addObjects').length, 20)
    assert.equal(frames.size, 0)
  } finally { globalThis.requestAnimationFrame = request; globalThis.cancelAnimationFrame = cancel }
})

test('앱은 대기 획 없이 펜을 떼는 호출 안에서 미리보기를 지우고 새 획을 넣는다', () => {
  const f = fixture('ball', 1, false)
  f.handlers.onStart({ locationX: 10, locationY: 20 })
  assert.ok(f.store.getSnapshot())
  f.handlers.onMove(20, 0, {})
  f.handlers.onEnd({ cancelled: false })
  assert.equal(f.store.getSnapshot(), null)
  assert.equal(f.store.getPendingSnapshot().length, 0)
  assert.equal(f.actions.filter(action => action.type === 'addObjects').length, 1)
})

test('웹 연속 획은 문서 표시가 늦어도 이전 획을 보존하고 다음 획을 지우지 않는다', () => {
  const f = fixture('fountain', 1, false, true)
  f.handlers.onStart({ locationX: 10, locationY: 20 })
  f.handlers.onMove(20, 0, {})
  f.handlers.onEnd({ cancelled: false })
  const a = f.actions[0].objects[0]
  assert.equal(f.store.getPendingSnapshot()[0].strokeId, a.id)
  f.handlers.onStart({ locationX: 50, locationY: 50 })
  const active = f.store.getSnapshot()
  acknowledgeStrokeDisplay(a.id)
  assert.equal(f.store.getSnapshot(), active)
  assert.equal(f.store.getPendingSnapshot().length, 0)
  f.handlers.onMove(10, 0, {})
  f.handlers.onEnd({ cancelled: false })
  assert.equal(f.store.getPendingSnapshot().length, 1)
  f.unmount()
  assert.equal(f.store.getPendingSnapshot().length, 0)
})


test('해제와 동일한 coalesced 표본도 release 0으로 끝 굵기를 줄이지 않는다', () => {
  const f = fixture('fountain', 1, false)
  const event = (x, pressure, timeStamp) => ({ nativeEvent: { pointerId: 7, pointerType: 'pen', offsetX: x, offsetY: 20, pressure, timeStamp } })
  f.pointers.onPointerDown(event(10, .6, 10))
  f.pointers.onPointerMove(event(30, .7, 20))
  const up = event(50, 0, 30)
  up.nativeEvent.getCoalescedEvents = () => [{ ...up.nativeEvent }]
  f.pointers.onPointerUp(up)
  const points = f.actions[0].objects[0].points
  assert.equal(points.at(-1).force, .7)
  assert.equal(points.at(-1).x - points[0].x, 40)
})


test('웹 pointerup 유실 뒤 재접촉은 앞 획을 보존하고 새 획을 분리하며 늦은 해제를 무시한다', () => {
  const f = fixture('fountain', 1, false, true)
  const target = { getBoundingClientRect: () => ({ left: 100, top: 200, width: 400, height: 300 }) }
  const e = (x, timeStamp) => ({ currentTarget: target, nativeEvent: { pointerId: 7, pointerType: 'pen', button: 0, clientX: 100 + x, clientY: 220, pressure: .5, timeStamp } })
  f.pointers.onPointerDown(e(10, 10)); f.pointers.onPointerMove(e(40, 20))
  f.pointers.onPointerDown(e(100, 30))
  assert.equal(f.actions.filter(a => a.type === 'addObjects').length, 1)
  f.pointers.onPointerUp(e(40, 20))
  assert.equal(f.actions.filter(a => a.type === 'addObjects').length, 1)
  f.pointers.onPointerMove(e(130, 40)); f.pointers.onPointerUp(e(140, 50))
  const strokes = f.actions.filter(a => a.type === 'addObjects').map(a => a.objects[0])
  assert.equal(strokes.length, 2)
  assert.ok(strokes[0].points.every(p => p.x + strokes[0].x < 60))
  assert.ok(strokes[1].points.every(p => p.x + strokes[1].x >= 100))
  f.unmount()
})


test('웹 플래너가 소비한 획은 일반 획으로 중복 저장하거나 인계 미리보기로 남기지 않는다', () => {
  const f = fixture('fountain', 1, false, true)
  let consumed = 0
  f.render({ onPlannerStroke: () => { consumed++; return true } })
  f.handlers.onStart({ locationX: 20, locationY: 20, force: 0.3 })
  f.handlers.onMove(30, 0, { force: 0.5 })
  f.handlers.onEnd({ cancelled: false })
  assert.equal(consumed, 1)
  assert.deepEqual(f.actions, [])
  f.handlers.onEnd({ cancelled: false })
  assert.equal(consumed, 1)
})

// 힘 · 기울기별로 곧은 획을 그어 실제 그리기 함수의 몸통 굵기를 잰다
const pathHeight = path => {
  const ys = [...path.matchAll(/-?[\d.]+ (-?[\d.]+)/g)].map(match => Number(match[1]))
  return Math.max(...ys) - Math.min(...ys)
}
function bodyWidth(kind, force, lean) {
  const f = fixture(kind, 1, false), h = f.handlers, event = (i) => ({ force, tiltX: lean, tiltY: 0, timeStamp: i * 16 })
  h.onStart({ locationX: 20, locationY: 100, ...event(0) })
  for (let i = 1; i <= 60; i++) h.onMove(i * 8, 0, event(i))
  h.onEnd({ cancelled: false })
  const stroke = f.actions[0].objects[0], all = stroke.points
  const middle = all.slice(25, 45)
  if (kind === 'pencil') {
    const dabs = pencilBrush.pencilDabs(pencilBrush.brushSampledPoints(all, 0), stroke.strokeWidth), mid = dabs.filter(d => d.x > 150 && d.x < 330)
    return mid.reduce((sum, dab) => sum + dab.r * 2, 0) / mid.length
  }
  const object = { ...stroke, points: middle }
  return kind === 'ball' ? pathHeight(nib.ballSweepPath(middle, stroke.strokeWidth)) : pathHeight(nib.nibContour({ ...object, sampled: true, taperBaked: kind === 'taperBrush' }))
}

test('펜 4종 모두: 세게 누르면 굵어지고 눕히면 넓어진다(입력부터 그리기 함수까지)', () => {
  for (const kind of ['ball', 'calligraphy', 'taperBrush', 'pencil']) {
    const light = bodyWidth(kind, 0.08, 0), firm = bodyWidth(kind, 0.6, 0), tilted = bodyWidth(kind, 0.22, 60), upright = bodyWidth(kind, 0.22, 0)
    assert.ok(firm > light * 1.1, `${kind} 필압 ${light} → ${firm}`)
    assert.ok(tilted > upright * 1.05, `${kind} 기울기 ${upright} → ${tilted}`)
  }
})

test('시작점에도 기울기가 저장된다', () => {
  const f = fixture('pencil', 1, false), h = f.handlers
  h.onStart({ locationX: 20, locationY: 30, force: 0.2, tiltX: 50, tiltY: 10, timeStamp: 0 })
  h.onMove(40, 0, { force: 0.2, tiltX: 50, tiltY: 10, timeStamp: 16 })
  h.onEnd({ cancelled: false })
  assert.equal(f.actions[0].objects[0].points[0].tiltX, 50)
})

// 손을 뗀 뒤 저장된 획의 끝이 마지막 프레임과 같아야 끝이 다시 그려져 달라 보이지 않는다
const lastShown = f => { const parts = f.store.getSnapshot().parts, points = parts.at(-1).points, first = parts[0].points[0], last = points.at(-1); return { x: last.x - first.x, y: last.y - first.y } }
const lastSaved = f => { const points = f.actions[0].objects[0].points; return { x: points.at(-1).x - points[0].x, y: points.at(-1).y - points[0].y } }
for (const kind of ['ball', 'calligraphy', 'taperBrush', 'pencil']) {
  test(`${kind}: 쓰는 중 끝 갈고리는 보이지 않고, 뗀 뒤 끝이 마지막 프레임과 같다`, () => {
    const f = fixture(kind, 1, false), h = f.handlers
    h.onStart({ locationX: 20, locationY: 100, force: 0.2, timeStamp: 0 })
    for (let i = 1; i <= 15; i++) h.onMove(i * 6, 0, { force: 0.2, timeStamp: i * 8 })
    const body = lastShown(f)
    // 짧게 위로 말린 끝
    h.onMove(90.5, -1.5, { force: 0.2, timeStamp: 128 })
    h.onMove(90.8, -3, { force: 0.2, timeStamp: 136 })
    const hooked = lastShown(f)
    assert.ok(Math.abs(hooked.y - body.y) < 0.5, `갈고리가 보임 ${hooked.y}`)
    h.onEnd({ cancelled: false })
    assert.deepEqual(lastSaved(f), hooked)
  })

  test(`${kind}: 빠르게 쓰다 떼도 끝점이 튀지 않는다(필터 지연 없이 펜 끝 좌표)`, () => {
    const f = fixture(kind, 1, false), h = f.handlers
    h.onStart({ locationX: 20, locationY: 100, force: 0.2, timeStamp: 0 })
    for (let i = 1; i <= 30; i++) h.onMove(i * 7, Math.sin(i / 3) * 12, { force: 0.2, timeStamp: i * 4 })
    const shown = lastShown(f)
    h.onEnd({ cancelled: false })
    assert.deepEqual(lastSaved(f), shown)
    assert.equal(shown.x, 210)
  })
}

test('꺾은 뒤 계속 쓰면 멈칫한 점이 빠지지 않고 그대로 보인다', () => {
  const f = fixture('ball', 1, false), h = f.handlers
  h.onStart({ locationX: 20, locationY: 100, timeStamp: 0 })
  for (let i = 1; i <= 15; i++) h.onMove(i * 6, 0, { timeStamp: i * 8 })
  h.onMove(90, -2, { timeStamp: 128 })
  h.onMove(90, -4, { timeStamp: 136 })
  for (let i = 1; i <= 5; i++) h.onMove(90, -4 - i * 6, { timeStamp: 136 + i * 8 })
  assert.equal(lastShown(f).y, -34)
  h.onEnd({ cancelled: false })
  assert.equal(lastSaved(f).y, -34)
})

test('화면 배율이 달라도 같은 크기의 끝 갈고리가 쓰는 중부터 잘린다(점 간격이 넓어도)', () => {
  for (const zoom of [0.43, 1, 2]) {
    const f = fixture('ball', zoom, false), h = f.handlers
    h.onStart({ locationX: 20, locationY: 100, force: 0.25, timeStamp: 0 })
    for (let i = 1; i <= 40; i++) h.onMove(i * 10, 0, { force: 0.25, timeStamp: i * 8 })
    h.onMove(400.6, -1.2, { force: 0.2, timeStamp: 328 })
    h.onMove(401, -2.5, { force: 0.1, timeStamp: 330 })
    assert.ok(Math.abs(lastShown(f).y) < 0.5 / zoom, `zoom ${zoom} 쓰는 중 ${lastShown(f).y}`)
    h.onMove(401, -2.5, { force: 0, isRelease: true, timeStamp: 600 })
    h.onEnd({ cancelled: false })
    assert.ok(Math.abs(lastSaved(f).y) < 0.5 / zoom, `zoom ${zoom} 뗀 뒤 ${lastSaved(f).y}`)
  }
})

test('붓펜: 저장된 획 외곽선의 몸통 굵기가 쓰는 중과 같다', () => {
  const f = fixture('taperBrush', 1, false), h = f.handlers
  h.onStart({ locationX: 20, locationY: 100, force: 0.22, timeStamp: 0 })
  for (let i = 1; i <= 40; i++) h.onMove(i * 8, 0, { force: 0.22, timeStamp: i * 16 })
  const live = nib.nibPreviewPaths(f.store.getSnapshot().parts, 4, 'taperBrush').join('')
  h.onEnd({ cancelled: false })
  const saved = nib.nibContour(f.actions[0].objects[0])
  const body = (path, x0) => { const ys = [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].filter(m => Math.abs(Number(m[1]) - x0) < 20).map(m => Number(m[2])); return Math.max(...ys) - Math.min(...ys) }
  const stroke = f.actions[0].objects[0]
  assert.ok(Math.abs(body(live, 180) - body(saved, 180 - stroke.x)) < 0.2, `${body(live, 180)} ${body(saved, 180 - stroke.x)}`)
})

const previewPointsOf = f => f.store.getSnapshot().parts.flatMap(part => part.points)
const closeCoordinate = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)
function assertSavedPreview(f, points) {
  const stored = JSON.parse(JSON.stringify(f.actions[0].objects[0]))
  assert.equal(stored.points.length, 2)
  for (let i = 0; i < 2; i++) {
    closeCoordinate(stored.x + stored.points[i].x, points[i].x)
    closeCoordinate(stored.y + stored.points[i].y, points[i].y)
  }
}

test('모든 펜·형광펜은 네 방향 경계와 재진입·바깥 해제에서도 직선 미리보기·저장 좌표를 유지한다', () => {
  const edges = [{ x: -300, y: 203, axis: 'y' }, { x: 1500, y: 203, axis: 'y' }, { x: 203, y: -300, axis: 'x' }, { x: 203, y: 1100, axis: 'x' }]
  for (const kind of [...settings.PEN_TYPES.map(p => p.id), 'highlighter']) for (const zoom of [0.5, 1, 2]) for (const edge of edges) for (const reenter of [false, true]) {
    const f = fixture(kind, zoom), h = f.handlers
    h.onStart({ locationX: 200 * zoom, locationY: 200 * zoom })
    h.onMove(40 * zoom, 100 * zoom, {})
    h.onMove(160 * zoom, 20 * zoom, {})
    f.hold()
    assert.equal(previewPointsOf(f).length, 2)
    h.onMove((edge.x - 200) * zoom, (edge.y - 200) * zoom, {})
    const outside = previewPointsOf(f)
    assert.equal(outside.length, 2, `${kind}: boundary must not restore the curve`)
    closeCoordinate(outside[1][edge.axis], 200)
    if (reenter) {
      h.onMove(300 * zoom, 3 * zoom, {})
      f.hold()
      assert.equal(previewPointsOf(f).length, 2)
      closeCoordinate(previewPointsOf(f)[1].y, 200)
    }
    const expected = previewPointsOf(f).map(point => ({ ...point }))
    h.onEnd({ cancelled: false })
    assert.equal(f.actions.length, 1)
    assertSavedPreview(f, expected)
    f.unmount()
  }
})

test('직선 해제 표본의 미세 이동과 필압 변경도 수평 보정을 해제하지 않는다', () => {
  for (const kind of ['ball', 'highlighter']) {
    const f = fixture(kind), h = f.handlers
    h.onStart({ locationX: 200, locationY: 200, force: 0.5 })
    h.onMove(100, 50, { force: 0.5 }); h.onMove(300, 3, { force: 0.5 }); f.hold()
    h.onMove(1300, 3, { force: 0.5 })
    h.onMove(1300, 3, { force: 0.9 })
    closeCoordinate(previewPointsOf(f)[1].y, 200)
    h.onMove(1300.1, 3.1, { force: 0, isRelease: true })
    h.onEnd({ cancelled: false })
    const stroke = f.actions[0].objects[0]
    assert.equal(stroke.points.length, 2)
    closeCoordinate(stroke.points[0].y, stroke.points[1].y)
    f.unmount()
  }
})

test('직선으로 전환하기 전에 페이지 밖으로 나간 자유 획은 자동으로 직선이 되지 않는다', () => {
  const f = fixture('ball'), h = f.handlers
  h.onStart({ locationX: 20, locationY: 30 })
  h.onMove(50, 80, {}); h.onMove(150, 10, {})
  h.onMove(1300, 50, {}); f.hold()
  h.onMove(200, 50, {}); f.hold()
  h.onEnd({ cancelled: false })
  assert.ok(f.actions[0].objects[0].points.length > 2)
  f.unmount()
})

test('펜 포인터의 페이지 밖 pointerup과 재진입 뒤 pointerup도 직선으로 저장한다', () => {
  for (const reenter of [false, true]) {
    const f = fixture('ball')
    const event = (x, y, timeStamp) => ({ nativeEvent: { pointerId: 9, pointerType: 'pen', offsetX: x, offsetY: y, clientX: x + 100, clientY: y + 200, pressure: 0.5, timeStamp } })
    f.pointers.onPointerDown(event(200, 200, 100))
    f.pointers.onPointerMove(event(240, 300, 110))
    f.pointers.onPointerMove(event(360, 220, 120)); f.hold()
    f.pointers.onPointerMove(event(1500, 203, 130))
    assert.equal(previewPointsOf(f).length, 2)
    if (reenter) f.pointers.onPointerMove(event(500, 203, 140))
    f.pointers.onPointerUp(event(reenter ? 500.1 : 1500.1, 203.1, 150))
    assert.equal(f.actions.length, 1)
    const stroke = f.actions[0].objects[0]
    assert.equal(stroke.points.length, 2)
    closeCoordinate(stroke.points[0].y, stroke.points[1].y)
    closeCoordinate(stroke.x + stroke.points[0].x, 200)
    closeCoordinate(stroke.y + stroke.points[0].y, 200)
    f.unmount()
  }
})

test('페이지 밖 직선도 두 손가락·제스처 취소 시 저장하지 않는다', () => {
  for (const mode of ['multi', 'cancel']) {
    const f = fixture('ball'), h = f.handlers
    h.onStart({ locationX: 200, locationY: 200 })
    h.onMove(40, 100, {}); h.onMove(160, 20, {}); f.hold()
    h.onMove(1300, 3, {})
    if (mode === 'multi') h.onMove(1300, 3, { touches: [{}, {}] })
    h.onEnd({ cancelled: mode === 'cancel' })
    assert.deepEqual(f.actions, [])
    f.unmount()
  }
})
