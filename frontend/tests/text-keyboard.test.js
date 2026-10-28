import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import React from 'react'
import * as text from '../src/editor/utils/text.js'
import * as ranges from '../src/editor/utils/textRanges.js'
import * as formats from '../src/editor/utils/textFormats.js'
import { requestTextKeyboard, startTextKeyboard } from '../src/editor/utils/textKeyboard.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
function clock() {
  let id = 0, now = 0
  const frames = new Map(), timers = new Map()
  return {
    requestFrame: fn => { frames.set(++id, fn); return id }, cancelFrame: id => frames.delete(id),
    schedule: (fn, ms) => { timers.set(++id, { fn, at: now + ms }); return id }, clear: id => timers.delete(id),
    frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()) },
    advance(ms) { now += ms; for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) if (t.at <= now && timers.has(id)) { timers.delete(id); t.fn() } },
    pending: () => frames.size + timers.size,
  }
}
for (const platform of ['android', 'ios']) test(`${platform}: 이미 focus된 입력은 blur 없이 실제 명령으로 다시 요청한다`, () => {
  let calls = 0
  const input = { isFocused: () => true, focus: () => assert.fail('RN 동일 focus 경로를 반복하면 안 된다'), blur: () => assert.fail('편집 종료 금지') }
  requestTextKeyboard(input, { platform, findNodeHandle: node => { assert.equal(node, input); return 42 }, dispatchCommand: (tag, command, args) => { assert.equal(tag, 42); assert.equal(command, 'focus'); assert.deepEqual(args, []); calls++ } }, true)
  assert.equal(calls, 1)
})
for (const platform of ['android', 'ios', 'web']) test(`${platform}: 미포커스 입력은 원래 focus를 사용한다`, () => {
  let calls = 0
  requestTextKeyboard({ isFocused: () => false, focus: () => calls++ }, { platform, findNodeHandle: () => assert.fail('미포커스 입력에 native 명령 금지') }, true)
  assert.equal(calls, 1)
})
test('제거된 handle·명령 미지원은 예외나 blur 없이 기존 경로를 유지한다', () => {
  for (const findNodeHandle of [() => null, () => { throw Error('unmounted') }]) {
    let calls = 0
    requestTextKeyboard({ isFocused: () => true, focus: () => calls++ }, { platform: 'android', findNodeHandle }, true)
    assert.equal(calls, 1)
  }
})
test('80/200/400ms에만 재시도하고 표시·해제 후에는 키보드를 다시 열지 않는다', () => {
  const time = clock(), native = [], input = { focus() {}, isFocused: () => true }
  let visible = false
  const stop = startTextKeyboard({ ...time, platform: 'android', getInput: () => input, canFocus: () => true, isVisible: () => visible, findNodeHandle: () => 42, dispatchCommand: () => native.push(true) })
  time.frame(); time.advance(79); assert.equal(native.length, 0)
  time.advance(1); assert.equal(native.length, 1)
  visible = true; time.advance(120); visible = false; time.advance(200)
  assert.equal(native.length, 1)
  assert.equal(time.pending(), 0)
  stop(); stop()
})
test('취소·저장·링크 편집·unmount 조건은 대기 중 재시도를 중단한다', () => {
  for (const reason of ['cancel', 'save', 'link', 'unmount']) {
    const time = clock(); let allowed = true, calls = 0
    startTextKeyboard({ ...time, platform: 'android', getInput: () => ({ focus: () => calls++ }), canFocus: () => allowed, isVisible: () => false })
    time.frame(); allowed = false; time.advance(80); allowed = true; time.advance(400)
    assert.equal(calls, 1, reason)
    assert.equal(time.pending(), 0)
  }
})
test('web은 최초 focus만 수행하고 정리 시 남은 frame·timer도 제거한다', () => {
  const time = clock(); let calls = 0
  const stop = startTextKeyboard({ ...time, platform: 'web', getInput: () => ({ focus: () => calls++ }), canFocus: () => true, isVisible: () => false })
  time.frame(); time.advance(500); assert.equal(calls, 1)
  stop(); assert.equal(time.pending(), 0)
  const other = clock()
  const cleanup = startTextKeyboard({ ...other, platform: 'android', getInput: () => assert.fail(), canFocus: () => true, isVisible: () => false })
  cleanup(); other.frame(); other.advance(500); assert.equal(other.pending(), 0)
})

function nativeFocusState() {
  const file = require.resolve('react-native/package.json').replace(/package\.json$/, 'Libraries/Components/TextInput/TextInputState.js')
  const { code } = babel.transformSync(readFileSync(file, 'utf8'), { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-flow-strip-types'), expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  let calls = 0
  const commands = { focus() { calls++ }, blur() { assert.fail('native blur must not run') } }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', '__DEV__', code)(id => {
    if (id.includes('NativeComponent')) return { Commands: commands }
    if (id.includes('RendererProxy')) return { findNodeHandle: () => 42 }
    if (id.includes('Utilities/Platform')) return { default: { OS: 'android' } }
    throw Error(id)
  }, module, module.exports, false)
  return { state: module.exports.default, command: commands.focus, count: () => calls }
}
test('실제 RN TextInputState의 동일 focus 생략을 우회하고 native focus를 재전송한다', () => {
  const rn = nativeFocusState(), input = { currentProps: { editable: true } }
  input.focus = () => rn.state.focusTextInput(input)
  input.isFocused = () => rn.state.currentlyFocusedInput() === input
  input.focus(); input.focus(); assert.equal(rn.count(), 1, '실제 RN의 기존 no-op 조건')
  requestTextKeyboard(input, { platform: 'android', findNodeHandle: () => 42, dispatchCommand: rn.command }, true)
  assert.equal(rn.count(), 2)
})

// 실제 TextEditor를 실행하되 플랫폼 입력/React 스케줄러만 대체한다.
const editorCode = babel.transformSync(readFileSync(new URL('../src/editor/components/TextEditor.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
function mountEditor(platform = 'android') {
  const time = clock(), effects = [], listeners = new Map(), saves = [], cancelled = []
  let palette, unmounted = false
  const rn = nativeFocusState(), input = { currentProps: { editable: true }, measureInWindow() {} }
  input.focus = () => rn.state.focusTextInput(input)
  input.isFocused = () => rn.state.currentlyFocusedInput() === input
  const hooks = { ...React, useRef: current => ({ current }), useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect: fn => { effects.push(fn) } }
  const native = { Platform: { OS: platform }, View: 'view', Text: 'text', Pressable: 'button', TextInput: 'input', StyleSheet: { create: x => x },
    Keyboard: { isVisible: () => false, dismiss() {}, addListener: (name, cb) => { listeners.set(name, cb); return { remove: () => listeners.delete(name) } } },
    findNodeHandle: () => 42, UIManager: { dispatchViewManagerCommand: rn.command } }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', editorCode)(id => {
    if (id === 'react') return hooks
    if (id === 'react-native') return native
    if (id === '../../shared/theme') return { colors: {} }
    if (id === '../utils/text') return text
    if (id === '../utils/textRanges') return ranges
    if (id === '../utils/textFormats') return formats
    if (id === '../utils/textKeyboard') return { startTextKeyboard, requestTextKeyboard }
    if (id === '../hooks/useTextFont') return { useTextFont() {} }
    if (id === '../services/textClipboard') return { copyText: async () => {}, useTextClipboardAvailable: () => true }
    if (id === './TextActionBar') return { __esModule: true, default: 'action-bar' }
    if (id === './TextLinkDialog') return { __esModule: true, default: 'link-dialog' }
    return require(id)
  }, module, module.exports)
  const tree = module.exports.default({ object: { id: 'text', text: '한글', x: 0, y: 0, w: 100, h: 30 }, zoom: 1, boundary: { current: null }, paletteBounds: { current: null }, onPaletteChange: value => { palette = value }, onSave: (...args) => saves.push(args), onCancel: () => cancelled.push(true) })
  const nodes = []
  const visit = node => { if (!node?.props) return; nodes.push(node); React.Children.toArray(node.props.children).forEach(visit) }
  visit(tree)
  const field = nodes.find(n => n.type === 'input')
  field.props.ref.current = input
  const globals = Object.fromEntries(['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'].map(k => [k, globalThis[k]]))
  Object.assign(globalThis, { requestAnimationFrame: time.requestFrame, cancelAnimationFrame: time.cancelFrame, setTimeout: time.schedule, clearTimeout: time.clear })
  const cleanups = effects.map(fn => fn()).filter(fn => typeof fn === 'function')
  return { time, input, field, saves, cancelled, listeners, calls: rn.count,
    link: () => React.Children.toArray(palette.content.props.children).find(n => n.type === 'action-bar').props.onLink(),
    unmount: () => { if (unmounted) return; unmounted = true; cleanups.forEach(fn => fn()); Object.assign(globalThis, globals) } }
}
for (const ending of ['show-hide', 'save', 'link', 'unmount']) test(`실제 TextEditor: ${ending} 이후에는 대기 중 focus가 편집을 다시 시작하지 않는다`, () => {
  const f = mountEditor()
  try {
    f.time.frame(); assert.equal(f.calls(), 1)
    f.time.advance(80); assert.equal(f.calls(), 2)
    if (ending === 'show-hide') { f.listeners.get('keyboardDidShow')({ endCoordinates: { screenY: 300 } }); f.listeners.get('keyboardDidHide')() }
    if (ending === 'save') { f.field.props.onEndEditing({ nativeEvent: { text: '저장한 한글' } }); assert.equal(f.saves.length, 1) }
    if (ending === 'link') f.link()
    if (ending === 'unmount') f.unmount()
    f.time.advance(500); assert.equal(f.calls(), 2)
  } finally { f.unmount() }
})

test('실제 web TextEditor: Escape 직후 frame과 blur가 취소를 뒤집지 않는다', () => {
  const f = mountEditor('web')
  try {
    f.field.props.onKeyDown({ key: 'Escape', stopPropagation() {} })
    f.field.props.onBlur({ target: { value: '취소한 초안' } })
    f.time.frame(); f.time.advance(500)
    assert.equal(f.cancelled.length, 1)
    assert.equal(f.saves.length, 0)
    assert.equal(f.calls(), 0)
  } finally { f.unmount() }
})
