import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as catalog from '../src/editor/templates/catalog.js'
const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/TemplatePicker.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
let measuredWidth = null
let viewportWidth = 414
const mocks = {
  react: { useState: () => [measuredWidth, value => { measuredWidth = value }] },
  'react-native': { useWindowDimensions: () => ({ width: viewportWidth, height: 896 }), Pressable: 'button', ScrollView: 'scroll', Text: 'text', View: 'view', StyleSheet: { create: v => v, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } } },
  'react-native-safe-area-context': { SafeAreaProvider: 'provider', SafeAreaView: 'safe' },
  './controls/EditorModal': { __esModule: true, default: 'modal' },
  '../templates/catalog.js': catalog,
  '../../shared/theme': { colors: {}, shadow: {} },
  './ToolPanel': { PANEL_RADIUS: 24, ToolPanelHeader: 'header' },
}
const module = { exports: {} }
new Function('require', 'module', 'exports', code)(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: 'preview' }), module, module.exports)
const Picker = module.exports.default
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const style = node => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean))
for (const orientation of ['portrait', 'landscape']) test(`모바일 ${orientation}: 목록 오른쪽의 남은 공간에 맞추고 속지 선택·닫기를 유지한다`, () => {
  for (const width of [320, 375, 414, 720]) {
    measuredWidth = null
    viewportWidth = width
    const selected = [], closed = []
    const props = { compact: true, orientation, anchor: { left: 184, bottom: 16 }, onSelect: id => selected.push(id), onClose: () => closed.push(true) }
    const tree = Picker(props)
    assert.equal(tree.type, 'view')
    const card = nodes(tree).find(n => n.props.accessibilityLabel === '페이지 추가')
    const bounds = style(card)
    assert.equal(bounds.position, 'absolute')
    assert.equal(bounds.left, 184)
    assert.ok(bounds.left + bounds.width <= width - 16)
    assert.equal(bounds.bottom, 16)
    assert.equal(bounds.maxHeight, '90%')
    assert.ok(nodes(card).some(n => style(n).flexWrap === 'wrap'))
    assert.ok(nodes(card).some(n => n.type === 'scroll' && style(n).flexShrink === 1))
    const options = nodes(card).filter(n => n.props.accessibilityRole === 'button')
    for (const option of options) assert.ok(style({ props: { style: option.props.style({ pressed: false }) } }).width <= bounds.width - 32)
    for (const item of catalog.reusableTemplates(orientation)) nodes(card).find(n => n.props.accessibilityLabel === item.name).props.onPress()
    assert.deepEqual(selected, catalog.reusableTemplates(orientation).map(item => item.assetId))
    nodes(card).find(n => n.type === 'header').props.onClose()
    nodes(tree).find(n => n.type === 'button' && n.props.accessibilityLabel === '페이지 추가 닫기').props.onPress()
    assert.equal(closed.length, 2)
    tree.props.onLayout({ nativeEvent: { layout: { width: width - 20 } } })
    const resized = style(nodes(Picker(props)).find(n => n.props.accessibilityLabel === '페이지 추가'))
    assert.ok(resized.left + resized.width <= width - 20 - 16)
  }
})
test('태블릿은 기존 앵커·90% 높이·한 줄 그룹 배치를 유지한다', () => {
  const tree = Picker({ anchor: { left: 184, bottom: 16 } })
  assert.equal(tree.type, 'view')
  assert.ok(!nodes(tree).some(n => n.type === 'modal'))
  const card = nodes(tree).find(n => n.props.accessibilityLabel === '페이지 추가')
  assert.equal(style(card).left, 184)
  assert.equal(style(card).bottom, 16)
  assert.equal(style(card).maxHeight, '90%')
  assert.ok(!nodes(card).some(n => style(n).flexWrap === 'wrap'))
})
