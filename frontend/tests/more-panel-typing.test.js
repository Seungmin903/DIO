import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as common from '../src/editor/utils/common.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))

// 옵션 창(MorePanel)이 키보드가 뜰 때와 칸을 옮길 때 적는 칸 자리를 재고 그 칸이 보이게 스크롤하는지
function fixture({ keyboardVisible = false, focused: initialFocus }) {
  let focused = initialFocus
  const listeners = {}, typing = [], scrolls = [], cleanups = []
  let cursor = 0
  const states = []
  const mocks = {
    react: {
      // 상태가 바뀌면 다시 그린다(편집 화면에 알리는 onTypingChange 가 실제 바뀐 값을 받는지 보려고). ref 는 그리기 사이에 유지한다
      useState: (v) => { const i = cursor++; if (!(i in states)) states[i] = v; return [states[i], (n) => { if (states[i] !== n) { states[i] = n; render() } }] },
      useRef: (v) => { const i = cursor++; if (!(i in states)) states[i] = { current: v }; return states[i] },
      useCallback: (f) => f, useContext: () => () => {},
      useEffect: (fn) => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup) },
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
  let all
  const render = () => { cursor = 0; all = nodes(module.exports.default({ objects: [object], dispatch: () => {}, onTypingChange: (v) => { if (typing.at(-1) !== v) typing.push(v) } })) }
  render()
  all.find((n) => n.type === 'scroll').props.ref.current = { scrollTo: (o) => scrolls.push(o.y) }
  all.find((n) => n.props?.collapsable === false).props.ref.current = {}
  const provider = () => all.find((n) => n.type === 'focus-provider').props.value
  return { unmount: () => cleanups.splice(0).forEach((c) => c()), listeners, scrolls, typing, headerShown: () => all.some((n) => n.props?.accessibilityLabel === '옵션 닫기' || n.props?.accessibilityRole === 'tablist'), onInputFocus: () => provider().onFocus(), onInputBlur: () => provider().onBlur(), setFocused: (input) => { focused = input } }
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
  assert.equal(panel.headerShown(), true)
  panel.listeners.keyboardDidShow()
  assert.deepEqual(panel.scrolls, [210])
  // 적는 동안은 창 제목 · 탭을 접어 낮아진 창을 적는 칸에 쓴다
  assert.equal(panel.headerShown(), false)
  panel.listeners.keyboardDidHide()
  assert.equal(panel.headerShown(), true)
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

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

test('창 안 칸에서 창 밖 칸(캔버스 글상자 등)으로 포커스가 옮겨 가면 적기를 끝낸다', async () => {
  const panel = fixture({ keyboardVisible: true, focused: inputAt(100) })
  panel.listeners.keyboardDidShow()
  assert.equal(panel.typing.at(-1), true)
  panel.setFocused({ measureLayout: (relative, ok, fail) => fail() })
  panel.onInputBlur()
  await tick()
  assert.equal(panel.typing.at(-1), false)
})

test('창 안 다른 칸으로 옮기거나 포커스 칸이 없으면(키보드가 내려가며 끝난다) 적기를 유지한다', async () => {
  const panel = fixture({ keyboardVisible: true, focused: inputAt(100) })
  panel.listeners.keyboardDidShow()
  panel.setFocused(inputAt(300))
  panel.onInputBlur()
  await tick()
  assert.equal(panel.typing.at(-1), true)
  panel.setFocused(null)
  panel.onInputBlur()
  await tick()
  assert.equal(panel.typing.at(-1), true)
  panel.listeners.keyboardDidHide()
  assert.equal(panel.typing.at(-1), false)
})

test('포커스가 빠진 뒤의 확인은 하나만 예약하고, 창이 닫히면 지운다', async () => {
  let measured = 0
  const outside = { measureLayout: (relative, ok, fail) => { measured++; fail() } }
  const panel = fixture({ keyboardVisible: true, focused: inputAt(100) })
  panel.listeners.keyboardDidShow()
  panel.setFocused(outside)
  panel.onInputBlur()
  panel.onInputBlur() // 연달아 빠져도 확인은 한 번
  await tick()
  assert.equal(measured, 1)
  // 확인 전에 창이 닫히면(옵션 닫기 · 선택 해제) 사라진 창을 재지 않는다
  panel.onInputBlur()
  panel.unmount()
  await tick()
  assert.equal(measured, 1)
})
