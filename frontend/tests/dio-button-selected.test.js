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
    if (id === 'react-native') return { ActivityIndicator: 'spinner', Pressable: 'button', Text: 'text', View: 'view', StyleSheet: { create: value => value } }
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

test('처리 중(loading) 버튼은 아이콘 자리에 글자색 스피너를 두고, 누르기만 막고 흐리게 하지 않으며 busy를 알린다', () => {
  const DioButton = load()
  const kids = tree => [tree.props.children].flat(3).filter(Boolean)
  const find = (tree, type) => kids(tree).flatMap(node => [node, ...kids(node)]).find(node => node?.type === type)
  const flat = style => Object.assign({}, ...[style].flat(3).filter(Boolean))
  const idle = DioButton({ variant: 'filled', label: '사진 선택', icon: 'image' })
  assert.equal(find(idle, 'icon')?.props.name, 'image')
  assert.equal(find(idle, 'spinner'), undefined)

  const busy = DioButton({ variant: 'filled', label: '사진 선택', text: '사진 불러오는 중', icon: 'image', loading: true, disabled: true })
  assert.equal(find(busy, 'icon'), undefined)
  assert.equal(find(busy, 'spinner').props.color, 'WHITE')
  assert.equal(busy.props.disabled, true)
  assert.deepEqual(busy.props.accessibilityState, { disabled: true, selected: false, busy: true })
  // react-native-web은 accessibilityState.busy를 aria-busy로 옮기지 않아 따로 넘긴다
  assert.equal(busy.props['aria-busy'], true)
  assert.equal(busy.props.accessibilityLabel, '사진 선택')
  assert.equal(flat(busy.props.style).opacity, undefined)
  assert.equal(labelColor(busy), 'WHITE')

  // 처리 중이 아닌 비활성은 지금처럼 흐린다
  assert.equal(flat(DioButton({ variant: 'tonal', label: '이미지 바꾸기', disabled: true }).props.style).opacity, 0.4)
  // 토널 버튼의 스피너는 글자색(primaryText)
  assert.equal(find(DioButton({ variant: 'tonal', label: '이미지 바꾸기', icon: 'image', loading: true }), 'spinner').props.color, 'NAVY')
})
