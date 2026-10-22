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

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/PenInput.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function fixture(kind, zoom = 1, straightAssist = true) {
  let handlers, timer, cursor = 0, tree
  const refs = [], effects = [], cleanups = []
  const actions = [], converted = []
  const module = { exports: {} }
  const load = (id) => {
    if (id === 'react') return {
      useRef: (current) => { const i = cursor++; return refs[i] ??= { current } },
      useState: () => [null, () => {}], useEffect(fn) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup) },
      useLayoutEffect: (fn, deps) => { const i = cursor++; if (!effects[i] || deps.some((v, n) => v !== effects[i][n])) { fn(); effects[i] = deps } },
    }
    if (id === 'react-native') return { View: 'view', StyleSheet: { create: (v) => v } }
    if (id.endsWith('/usePan')) return { usePan: (value) => { handlers = value; return {} } }
    if (id.endsWith('/constants')) return { PAGE_WIDTH: 1188, PAGE_HEIGHT: 840 }
    if (id.endsWith('/common')) return { createId: () => 'stroke' }
    if (id.endsWith('/strokes')) return { ...strokes, createStroke: (...args) => { converted.push(args[0].length); return strokes.createStroke(...args) } }
    if (id.endsWith('/penSettings')) return settings
    if (id.endsWith('/strokePreview.js')) return preview
    if (id.endsWith('/penPerformance.js')) return measurement
    if (id.endsWith('/penPreviewStore.js')) return previewStore
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
  return { get handlers() { return handlers }, get store() { return tree.props.children.props.store }, actions, converted, render, unmount: () => cleanups.forEach(fn => fn()), hold: () => { const callback = timer; timer = null; callback?.() } }
}

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
    assert.equal(seen.length, 1, '한 프레임의 미리보기만 표시 층 구독자에게 전달한다')
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
