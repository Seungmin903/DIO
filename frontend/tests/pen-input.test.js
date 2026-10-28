import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as strokes from '../src/editor/utils/strokes.js'
import * as assist from '../src/editor/utils/strokeAssist.js'
import * as settings from '../src/editor/utils/penSettings.js'
import * as preview from '../src/editor/utils/strokePreview.js'
import * as measurement from '../src/editor/utils/penPerformance.js'
import * as previewStore from '../src/editor/utils/penPreviewStore.js'
import { acknowledgeStrokeDisplay } from '../src/editor/utils/strokeDisplayHandoff.js'
import * as motion from '../src/editor/utils/penMotion.js'
import * as pointer from '../src/editor/utils/penPointerInput.js'
import * as materials from '../src/editor/utils/penMaterials.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/PenInput.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function fixture(kind, zoom = 1, straightAssist = true, web = false) {
  let handlers, timer, cursor = 0, tree, strokeSequence = 0
  const refs = [], effects = [], cleanups = []
  const actions = [], converted = []
  const module = { exports: {} }
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
    if (id.endsWith('/strokePreview.js')) return preview
    if (id.endsWith('/penPerformance.js')) return measurement
    if (id.endsWith('/penPreviewStore.js')) return previewStore
    if (id.endsWith('/penMotion.js')) return motion
    if (id.endsWith('/penPointerInput.js')) return pointer
    if (id.endsWith('/penMaterials.js')) return materials
    if (id.endsWith('/stylus')) return { setPenPointerActive() {} }
    if (id.endsWith('/PenPreview')) return { __esModule: true, default: () => null }
    if (id.endsWith('/StrokePreview')) return { __esModule: true, default: () => null }
    if (id.endsWith('/strokeAssist')) return { createHighlighterHold: (options) => assist.createHighlighterHold({ ...options,
      schedule: (callback) => { timer = callback; return 1 }, unschedule: () => { timer = null },
    }) }
    if (id.endsWith('/ObjectView')) return { __esModule: true, default: () => null }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  const render = (next = {}) => { cursor = 0; tree = module.exports.default({ zoom, straightAssist, dispatch: (a) => actions.push(a), settings: { kind, color: '#123456', width: 4 }, ...next }) }
  render()
  return { get handlers() { return handlers }, get pointers() { return tree.props }, get store() { return tree.props.children.props.store }, actions, converted, render, unmount: () => cleanups.forEach(fn => fn()), hold: () => { const callback = timer; timer = null; callback?.() } }
}

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
  assert.equal(f.actions.length, 2)
  const stroke = f.actions[0].objects[0]
  assert.equal(stroke.renderVersion, 3)
  assert.equal(stroke.points[0].force, 0.1)
  assert.equal(stroke.points[1].force, 0.8)
  assert.equal(stroke.points.at(-1).force, 0.8)
  assert.equal(stroke.points.at(-1).time, 20)
  assert.equal(stroke.points.at(-1).x - stroke.points[0].x, 60)
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
    assert.equal(f.actions.length, 2)
    const stroke = f.actions[0].objects[0]
    assert.equal(stroke.points.length, 2)
    assert.equal(stroke.penKind, kind)
    assert.equal(stroke.color, '#123456')
    assert.deepEqual(f.actions[1], { type: 'selectExact', ids: [] })
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

test('페이지 밖으로 나가면 직선 보정을 중단하고 재진입까지 원래 경로를 보존한다', () => {
  for (const kind of ['ball', 'highlighter']) {
    const f = fixture(kind), h = f.handlers
    h.onStart({ locationX: 20, locationY: 30 })
    h.onMove(50, 80, {}); h.onMove(150, 10, {}); f.hold()
    h.onMove(1300, 50, {}); h.onMove(200, 50, {}); f.hold()
    h.onEnd({ cancelled: false })
    assert.equal(f.actions[0].objects[0].points.length, 5)
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
