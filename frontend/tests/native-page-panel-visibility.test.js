import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/panels/PagePanelVisibility.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

test('iPad에서 닫는 동안 이전 목록을 유지하고 접근을 막으며 다시 열면 최신 목록을 표시한다', () => {
  let ref
  const module = { exports: {} }
  const load = id => id === 'react' ? { useRef: value => ref ??= { current: value } } : id === 'react-native' ? { View: 'view' } : require(id)
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  const render = module.exports.default
  const before = { id: 'before' }, updated = { id: 'updated' }
  const opened = render({ enabled: true, hidden: false, children: before })
  assert.equal(opened.props.children, before)
  assert.deepEqual(opened.props.style, { alignSelf: 'stretch', flexShrink: 0 })
  const closing = render({ enabled: true, hidden: true, children: updated })
  assert.equal(closing.props.children, before)
  assert.equal(closing.props.pointerEvents, 'none')
  assert.deepEqual(closing.props.style, { alignSelf: 'stretch', flexShrink: 0, opacity: 0 })
  assert.equal(closing.props.accessibilityElementsHidden, true)
  const reopened = render({ enabled: true, hidden: false, children: updated })
  assert.equal(reopened.props.children, updated)
  assert.equal(reopened.props.pointerEvents, 'auto')
  assert.equal(render({ enabled: false, hidden: false, children: before }), before)
})
