import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as textFormats from '../src/editor/utils/textFormats.js'

const require = createRequire(import.meta.url)
const expoRequire = createRequire(require.resolve('expo/package.json'))
const { code } = expoRequire('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/TextLinkDialog.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expoRequire.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expoRequire.resolve('@babel/plugin-transform-modules-commonjs')],
})

function dialog(platform, initialValue = '') {
  const state = [], saves = [], opens = []
  let cursor = 0, cancelled = 0
  const native = Object.fromEntries(['KeyboardAvoidingView', 'Modal', 'Pressable', 'ScrollView', 'Switch', 'Text', 'TextInput', 'View'].map(name => [name, name]))
  Object.assign(native, { Platform: { OS: platform }, StyleSheet: { create: x => x }, Linking: { openURL: async url => opens.push(url) } })
  const module = { exports: {} }
  const load = id => {
    if (id === 'react') return { useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value }] } }
    if (id === 'react-native') return native
    if (id === '../../shared/theme') return { colors: {}, shadow: { float: {} } }
    if (id === './ToolPanel') return { PANEL_RADIUS: 16 }
    if (id === '../utils/textFormats') return textFormats
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  function render() { cursor = 0; return module.exports.default({ initialValue, onSave: value => saves.push(value), onCancel: () => cancelled++ }) }
  function nodes(node = render()) { return [node, ...[node?.props?.children].flat(Infinity).filter(child => child && typeof child === 'object').flatMap(child => nodes(child))] }
  const button = label => nodes().find(node => node.type === 'Pressable' && node.props.children?.props.children === label)
  return { render, nodes, button, saves, opens, state, cancelled: () => cancelled }
}

test('iOS 모달 내부에서 키보드 회피와 스크롤을 제공하고 버튼 탭을 전달한다', () => {
  const d = dialog('ios'), nodes = d.nodes()
  assert.equal(nodes.find(n => n.type === 'KeyboardAvoidingView').props.behavior, 'padding')
  const scroll = nodes.find(n => n.type === 'ScrollView').props
  assert.equal(scroll.keyboardShouldPersistTaps, 'handled')
  assert.equal(scroll.automaticallyAdjustKeyboardInsets, false)
  assert.equal(scroll.contentContainerStyle.flexGrow, 1)
  assert.equal(nodes.find(n => n.props?.accessibilityLabel === '텍스트 링크 편집').props.style.flexShrink, 0)
  for (const platform of ['android', 'web']) assert.equal(dialog(platform).nodes().find(n => n.type === 'KeyboardAvoidingView').props.behavior, undefined)
})

test('URL 수정·열기·적용·제거·취소 동작을 유지한다', async () => {
  const d = dialog('ios', 'https://old.example/')
  d.nodes().find(n => n.type === 'TextInput').props.onChangeText('new.example/path')
  await d.button('열기').props.onPress()
  d.button('적용').props.onPress()
  d.button('링크 제거').props.onPress()
  d.button('취소').props.onPress()
  assert.deepEqual(d.opens, ['https://new.example/path'])
  assert.deepEqual(d.saves, ['https://new.example/path', ''])
  assert.equal(d.cancelled(), 1)
  d.render().props.onRequestClose()
  assert.equal(d.cancelled(), 2)
})

test('잘못된 URL은 저장하지 않고 오류를 표시하며 재입력하면 해제한다', () => {
  const d = dialog('ios')
  d.nodes().find(n => n.type === 'TextInput').props.onChangeText('javascript:alert(1)')
  d.button('적용').props.onPress()
  assert.equal(d.saves.length, 0)
  assert.ok(d.nodes().some(n => n.props?.accessibilityLiveRegion === 'polite'))
  d.nodes().find(n => n.type === 'TextInput').props.onChangeText('https://example.com')
  assert.ok(!d.nodes().some(n => n.props?.accessibilityLiveRegion === 'polite'))
})
