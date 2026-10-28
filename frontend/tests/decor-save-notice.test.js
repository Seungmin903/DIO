import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/panels/DecorSaveNotice.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', code)(id => {
  if (id === 'react-native') return { View: 'view', Text: 'text', Pressable: 'button', StyleSheet: { create: x => x } }
  if (id.endsWith('/theme')) return { colors: {}, radius: {}, DISABLED_OPACITY: 0.4 }
  if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  throw new Error(`Unexpected dependency ${id}`)
}, module, module.exports)
const Notice = module.exports.default
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]

test('저장 실패가 없으면 안내를 표시하지 않는다', () => {
  assert.equal(Notice({ error: null, pending: false, onRetry() {} }), null)
})
test('저장 실패를 접근성 알림으로 표시하고 다시 저장 버튼을 연결한다', () => {
  let calls = 0
  const tree = Notice({ error: '저장하지 못했어요.', pending: false, onRetry: () => { calls++ } })
  assert.equal(tree.props.accessibilityRole, 'alert')
  assert.ok(nodes(tree).some(n => n.props?.children === '저장하지 못했어요.'))
  const button = nodes(tree).find(n => n.type === 'button')
  assert.equal(button.props.accessibilityLabel, '꾸미기 보관함 저장 재시도')
  assert.equal(button.props.disabled, false)
  button.props.onPress()
  assert.equal(calls, 1)
})
test('재시도 중에는 안내를 유지하고 버튼 비활성·진행 표시를 제공한다', () => {
  const tree = Notice({ error: '저장하지 못했어요.', pending: true, onRetry() {} })
  const button = nodes(tree).find(n => n.type === 'button')
  assert.equal(button.props.disabled, true)
  assert.deepEqual(button.props.accessibilityState, { disabled: true, busy: true })
  assert.ok(nodes(tree).some(n => n.props?.children === '다시 저장 중…'))
})
