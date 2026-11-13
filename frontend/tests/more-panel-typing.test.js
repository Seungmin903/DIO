import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as common from '../src/editor/utils/common.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))

// 옵션 창(MorePanel)이 키보드가 뜰 때와 칸을 옮길 때 적는 칸 자리를 재고 그 칸이 보이게 스크롤하는지
function fixture({ keyboardVisible = false, focused }) {
  const listeners = {}, typing = [], scrolls = []
  let cursor = 0
  const states = []
  const mocks = {
    react: {
      useState: (v) => { const i = cursor++; if (!(i in states)) states[i] = v; return [states[i], (n) => { states[i] = n }] },
      useRef: (v) => ({ current: v }), useCallback: (f) => f, useContext: () => () => {},
      useEffect: (fn) => { fn() },
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      View: 'view', Text: 'text', Pressable: 'button', ScrollView: 'scroll', Platform: { select: () => ({}) }, StyleSheet: { create: (s) => s },
      Keyboard: { addListener: (name, fn) => { listeners[name] = fn; return { remove() {} } }, isVisible: () => keyboardVisible },
      TextInput: { State: { currentlyFocusedInput: () => focused } },
    },
  }
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/panels/MorePanel.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => {
    if (mocks[id]) return mocks[id]
    if (id.endsWith('/theme')) return { colors: {}, shadow: {} }
    if (id.endsWith('/common')) return common
    if (id.endsWith('/ObjectView')) return { objectOpacity: () => 1 }
    if (id.endsWith('/ColorPicker')) return { PaletteInteractionContext: { Provider: 'palette-provider' } }
    if (id.endsWith('/inputFocusContext')) return { InputFocusContext: { Provider: 'focus-provider' } }
    if (id.endsWith('/routeNode')) return { isRouteNode: () => false }
    return { __esModule: true, default: id.split('/').at(-1) }
  }, module, module.exports)
  const object = { id: 'w', type: 'sticker', widget: { kind: 'dday' }, x: 0, y: 0, w: 100, h: 100 }
  const tree = module.exports.default({ objects: [object], dispatch: () => {}, onTypingChange: (v) => typing.push(v) })
  const all = nodes(tree)
  all.find((n) => n.type === 'scroll').props.ref.current = { scrollTo: (o) => scrolls.push(o.y) }
  all.find((n) => n.props?.collapsable === false).props.ref.current = {}
  const onInputFocus = all.find((n) => n.type === 'focus-provider').props.value
  return { listeners, scrolls, onInputFocus }
}
function nodes(value) {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (typeof value.type === 'function') return [value]
  return [value, ...nodes(value.props?.children)]
}
const inputAt = (y) => ({ measureLayout: (relative, ok) => ok(0, y) })

test('키보드가 뜨면 창 안 입력칸이 보이게 제목까지 스크롤한다', () => {
  const panel = fixture({ focused: inputAt(240) })
  panel.listeners.keyboardDidShow()
  assert.deepEqual(panel.scrolls, [210])
})

test('키보드가 떠 있는 채로 다른 칸으로 옮기면 새 칸 자리를 다시 재 스크롤한다', () => {
  const focused = inputAt(100)
  const panel = fixture({ keyboardVisible: true, focused })
  panel.listeners.keyboardDidShow()
  focused.measureLayout = (relative, ok) => ok(0, 400)
  panel.onInputFocus()
  assert.deepEqual(panel.scrolls, [70, 370])
})

test('키보드가 아직 안 떴을 때의 포커스는 재지 않는다 (keyboardDidShow 가 맡는다)', () => {
  const panel = fixture({ keyboardVisible: false, focused: inputAt(100) })
  panel.onInputFocus()
  assert.deepEqual(panel.scrolls, [])
})

test('창 밖 입력칸(measureLayout 실패)은 건드리지 않는다', () => {
  const panel = fixture({ keyboardVisible: true, focused: { measureLayout: (relative, ok, fail) => fail() } })
  panel.listeners.keyboardDidShow()
  panel.onInputFocus()
  assert.deepEqual(panel.scrolls, [])
})
