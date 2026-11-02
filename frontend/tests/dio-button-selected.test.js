import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
function load() {
  const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/shared/DioButton.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react-native') return { Pressable: 'button', Text: 'text', View: 'view', StyleSheet: { create: value => value } }
    if (id.endsWith('/AppIcon')) return { __esModule: true, default: 'icon' }
    if (id.endsWith('/theme')) return { colors: { surface: 'WHITE', primaryText: 'NAVY', primaryStrong: 'BLUE', dangerStrong: 'RED', surfaceMuted: 'GRAY', primary: 'P', butter: 'Y', text: 'T' } }
    return require(id)
  }, module, module.exports)
  return module.exports.default
}
const labelColor = tree => [tree.props.children].flat(3).find(node => node?.type === 'text').props.style.find(style => style?.color).color

test('채움 버튼은 글자가 흰색이고, 고른 상태(흰 면)가 되면 primaryText 로 바뀌어 묻히지 않는다', () => {
  const DioButton = load()
  assert.equal(labelColor(DioButton({ variant: 'filled', label: '저장' })), 'WHITE')
  assert.equal(labelColor(DioButton({ variant: 'filled', label: '저장', selected: true })), 'NAVY')
  assert.equal(labelColor(DioButton({ variant: 'tonal', label: '저장', selected: true })), 'NAVY')
})
