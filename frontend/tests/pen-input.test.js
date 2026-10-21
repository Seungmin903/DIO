import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as strokes from '../src/editor/utils/strokes.js'
import * as assist from '../src/editor/utils/strokeAssist.js'
import * as settings from '../src/editor/utils/penSettings.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/PenInput.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function fixture(kind, zoom = 1, straightAssist = true) {
  let handlers, timer
  const actions = []
  const module = { exports: {} }
  const load = (id) => {
    if (id === 'react') return { useRef: (current) => ({ current }), useState: () => [null, () => {}], useEffect() {} }
    if (id === 'react-native') return { View: 'view', StyleSheet: { create: (v) => v } }
    if (id.endsWith('/usePan')) return { usePan: (value) => { handlers = value; return {} } }
    if (id.endsWith('/constants')) return { PAGE_WIDTH: 1188, PAGE_HEIGHT: 840 }
    if (id.endsWith('/common')) return { createId: () => 'stroke' }
    if (id.endsWith('/strokes')) return strokes
    if (id.endsWith('/penSettings')) return settings
    if (id.endsWith('/strokeAssist')) return { createHighlighterHold: (options) => assist.createHighlighterHold({ ...options,
      schedule: (callback) => { timer = callback; return 1 }, unschedule: () => { timer = null },
    }) }
    if (id.endsWith('/ObjectView')) return { __esModule: true, default: () => null }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  module.exports.default({ zoom, straightAssist, dispatch: (a) => actions.push(a), settings: { kind, color: '#123456', width: 4 } })
  return { handlers, actions, hold: () => { const callback = timer; timer = null; callback?.() } }
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
