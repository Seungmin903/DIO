import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/auth/AccountLinks.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const mocks = { react: { Fragment: 'Fragment' }, 'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View' }, './styles': { authStyles: new Proxy({}, { get: (_, key) => key }) } }
const module = { exports: {} }
new Function('require', 'module', 'exports', code)(id => (id === 'react/jsx-runtime' ? require(id) : mocks[id]), module, module.exports)
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]

test('로그인 아래 계정 줄은 비밀번호 찾기 | 회원가입 둘뿐이고 구분선은 그 사이 하나다', () => {
  const pressed = []
  const tree = module.exports.default({ onPress: id => pressed.push(id) })
  const all = nodes(tree)
  const links = all.filter(node => node.type === 'Pressable')
  assert.deepEqual(links.map(node => node.props.accessibilityLabel), ['비밀번호 찾기', '회원가입'])
  assert.equal(all.filter(node => node.type === 'Text' && node.props.children === '|').length, 1)
  // 순서: 비밀번호 찾기 → 구분선 → 회원가입
  const order = all.filter(node => node.type === 'Pressable' || (node.type === 'Text' && node.props.children === '|')).map(node => node.props.accessibilityLabel ?? '|')
  assert.deepEqual(order, ['비밀번호 찾기', '|', '회원가입'])
  // 줄 컨테이너는 하나뿐이다(항목마다 View 를 겹치지 않는다)
  assert.equal(all.filter(node => node.type === 'View').length, 1)
  links[0].props.onPress(); links[1].props.onPress()
  assert.deepEqual(pressed, ['password-reset', 'signup'])
})

test('로그인 요청 중에는 두 링크가 비활성이라 입력이 비워지지 않는다', () => {
  const pressed = []
  const links = nodes(module.exports.default({ onPress: id => pressed.push(id), disabled: true })).filter(node => node.type === 'Pressable')
  assert.deepEqual(links.map(node => node.props.disabled), [true, true])
  assert.deepEqual(links.map(node => node.props.accessibilityState), [{ disabled: true }, { disabled: true }])
  assert.deepEqual(pressed, [])
})
