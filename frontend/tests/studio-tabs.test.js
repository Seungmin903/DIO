import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/components/StudioTabs.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const TABS = ['폰트', '스티커', '테이프', '표지', '속지', '도구'].map(label => ({ id: label, label }))
// 줄 폭을 잰 뒤의 모습: useState 는 값 하나(rowWidth)
function render({ compact = false, width }) {
  let state = 0
  const react = { useState: () => [state, next => { state = typeof next === 'function' ? next(state) : next }] }
  const mocks = { react, 'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: v => v } },
    '../../editor/components/controls/FadeScroll': { __esModule: true, default: 'FadeScroll', CANVAS_FADE_RGB: '0,0,0' }, '../../shared/theme': { colors: {} } }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => (id === 'react/jsx-runtime' ? require(id) : mocks[id]), module, module.exports)
  const props = { tabs: TABS, value: '폰트', onChange() {}, compact }
  const first = module.exports.default(props)
  nodes(first).find(node => node.props?.onLayout).props.onLayout({ nativeEvent: { layout: { width } } })
  return module.exports.default(props)
}
const tablist = tree => nodes(tree).find(node => node.props?.accessibilityRole === 'tablist')
const tabWidths = tree => nodes(tree).filter(node => node.props?.accessibilityRole === 'tab').map(node => [node.props.style].flat(Infinity).find(style => style && 'width' in style)?.width)

test('넓은 창은 104 폭 탭을 가로로 밀고, 좁은 창(세로 태블릿)은 같은 폭으로 나눈다', () => {
  const wide = render({ width: 1000 })
  assert.equal(tablist(wide).type, 'FadeScroll')
  assert.deepEqual(tabWidths(wide), [104, 104, 104, 104, 104, 104])
  const narrow = render({ width: 600 }) // 6 × 104 + 5 × 6 = 654 > 600
  assert.equal(tablist(narrow).type, 'View')
  assert.deepEqual(tabWidths(narrow), [undefined, undefined, undefined, undefined, undefined, undefined])
})

test('폰은 재기 전후 모두 같은 폭으로 나눈다', () => {
  assert.equal(tablist(render({ compact: true, width: 379 })).type, 'View')
})
