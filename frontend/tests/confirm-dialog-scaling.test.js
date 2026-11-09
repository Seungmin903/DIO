import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { keepKoreanWords } from '../src/shared/keepWords.js'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/controls/ConfirmDialog.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const mod = { exports: {} }
new Function('require', 'module', 'exports', code)(id => id === 'react-native' ? {
  Platform: { OS: 'android' }, Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: value => value },
} : id === '../../../shared/theme' ? { colors: {}, shadow: {} }
  : id === '../../../shared/keepWords' ? { keepKoreanWords }
  : id === '../ToolPanel' ? { PANEL_RADIUS: 12 }
    : id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: 'EditorModal' }, mod, mod.exports)
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]

test('확인창은 긴 내용과 확대된 버튼을 스크롤하고 두 동작을 유지한다', () => {
  let confirmed = 0, cancelled = 0
  const all = nodes(mod.exports.ConfirmDialogContent({ title: '삭제할까요?', message: '내용', onConfirm: () => confirmed++, onCancel: () => cancelled++ }))
  const scroll = all.find(node => node.type === 'ScrollView')
  assert.ok(scroll)
  assert.equal(scroll.props.style.maxHeight, '100%')
  const texts = all.filter(node => node.type === 'Text')
  assert.ok(texts.every(node => node.props.maxFontSizeMultiplier === 0))
  const buttons = all.filter(node => node.type === 'Pressable' && node.props.accessibilityRole === 'button')
  assert.equal(buttons.length, 2)
  buttons.forEach(button => { const style = button.props.style({ pressed: false })[0]; assert.equal(style.minHeight, 48); assert.equal(style.height, undefined); button.props.onPress() })
  assert.equal(confirmed, 1); assert.equal(cancelled, 1)
})
