import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { normalizeTextLink } from '../src/editor/utils/textFormats.js'

const require = createRequire(import.meta.url)
const fromExpo = createRequire(require.resolve('expo/package.json'))
const babel = fromExpo('@babel/core')
const { code } = babel.transformSync(readFileSync(new URL('../src/editor/components/TextLinkDialog.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[fromExpo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], fromExpo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]
}
function render(platform, initialValue = '') {
  const errors = [], saves = [], cancels = [], opened = []
  let stateIndex = 0
  const mocks = {
    react: { useState: (value) => [value, stateIndex++ ? (v) => errors.push(v) : () => {}] },
    'react-native': { Platform: { OS: platform }, StyleSheet: { create: (s) => s }, Linking: { openURL: async (url) => opened.push(url) },
      ...Object.fromEntries(['KeyboardAvoidingView', 'Modal', 'Pressable', 'ScrollView', 'Switch', 'Text', 'TextInput', 'View'].map((name) => [name, name])),
    },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' },
    '../../shared/theme': { colors: {}, shadow: {} }, './ToolPanel': { PANEL_RADIUS: 16 },
    '../utils/textFormats': { normalizeTextLink },
    './controls/EditorModal': { __esModule: true, default: 'Modal' },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => mocks[id] ?? require(id), module, module.exports)
  const tree = module.exports.default({ initialValue, onSave: (v) => saves.push(v), onCancel: () => cancels.push(true) })
  const list = nodes(tree)
  const button = (label) => list.find((node) => node.type === 'Pressable' && nodes(node).some((child) => child.type === 'Text' && child.props.children === label))
  return { tree, list, button, errors, saves, cancels, opened }
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: 키보드 회피·회전·안전 영역과 작은 높이의 스크롤 및 첫 탭 조작을 지원한다`, () => {
    const { tree, list } = render(platform)
    assert.deepEqual(tree.props.supportedOrientations, ['portrait', 'landscape'])
    const avoiding = list.find((node) => node.type === 'KeyboardAvoidingView')
    assert.equal(avoiding.props.behavior, platform === 'ios' ? 'padding' : 'height')
    const scroll = nodes(avoiding).find((node) => node.type === 'ScrollView')
    assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled')
    assert.equal(scroll.props.contentContainerStyle.flexGrow, 1)
    assert.ok(list.some((node) => node.type === 'SafeAreaProvider'))
    const content = nodes(scroll)
    assert.ok(content.some((node) => node.props?.accessibilityLabel === '텍스트 링크 URL'))
    for (const label of ['적용', '취소']) assert.ok(content.some((node) => node.type === 'Text' && node.props.children === label))
  })
}
test('링크 수정·열기·제거·취소와 시스템 닫기 경로를 유지한다', async () => {
  const e = render('ios', 'example.com')
  e.button('적용').props.onPress()
  assert.deepEqual(e.saves, ['https://example.com/'])
  await e.button('열기').props.onPress()
  assert.deepEqual(e.opened, ['https://example.com/'])
  e.button('링크 제거').props.onPress()
  assert.deepEqual(e.saves, ['https://example.com/', ''])
  e.button('취소').props.onPress()
  e.tree.props.onRequestClose()
  assert.equal(e.cancels.length, 2)
})
test('지원하지 않는 주소는 저장하지 않고 오류 안내를 유지한다', () => {
  const e = render('ios', 'javascript:alert(1)')
  e.button('적용').props.onPress()
  assert.equal(e.saves.length, 0)
  assert.equal(e.errors.length, 1)
})
