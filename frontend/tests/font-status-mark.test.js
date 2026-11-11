import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

// 글꼴 받기 표시(FontStatusMark): 받기 아이콘 · 진행 막대 · 진행률을 모를 때 오가는 막대.
// 훅은 흉내 내고(useEffect 는 바로 실행) 함수 컴포넌트를 직접 펼쳐 그린 결과를 본다
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/controls/FontStatusMark.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

function load({ os = 'android', progress = null } = {}) {
  const timings = [], stopped = []
  const value = { interpolate: config => ({ interpolated: config }) }
  const native = {
    Platform: { OS: os },
    StyleSheet: { create: styles => styles },
    View: 'View',
    Easing: { inOut: fn => fn, ease: t => t },
    Animated: {
      View: 'Animated.View',
      Value: function Value() { return value },
      timing: (_value, config) => { timings.push(config); return { config } },
      loop: animation => ({ start: () => {}, stop: () => stopped.push(animation) }),
    },
  }
  const hooks = { ...React, useSyncExternalStore: (_subscribe, read) => read(), useRef: initial => ({ current: initial }), useEffect: effect => { const cleanup = effect(); if (cleanup) stopped.cleanup = cleanup } }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return hooks
    if (id === 'react-native') return native
    if (id === 'react/jsx-runtime') return require('react/jsx-runtime')
    if (id.endsWith('/shared/theme')) return { DISABLED_OPACITY: 0.4, colors: new Proxy({}, { get: (_t, key) => `color:${String(key)}` }) }
    if (id.endsWith('/utils/text')) return { textFontProgress: () => progress, subscribeTextFontProgress: () => () => {} }
    if (id === './Icon') return { __esModule: true, default: 'Icon' }
    return require(id)
  }, module, module.exports)
  return { module: module.exports, timings, stopped }
}
// 함수 컴포넌트를 끝까지 펼친다(문자열 컴포넌트는 그대로 둔다)
const expand = node => {
  if (Array.isArray(node)) return node.map(expand)
  if (!node || typeof node !== 'object') return node
  if (typeof node.type === 'function') return expand(node.type(node.props))
  return { type: node.type, props: { ...node.props, children: expand(node.props?.children) } }
}
const find = (node, predicate) => {
  if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found } return null }
  if (!node || typeof node !== 'object') return null
  return predicate(node) ? node : find(node.props?.children, predicate)
}

test('받기 전 · 받지 못한 글꼴은 받기 아이콘, 받은 글꼴은 아무것도 그리지 않는다', () => {
  const { module } = load()
  for (const status of ['download', 'error']) assert.equal(expand(React.createElement(module.default, { status, id: 'x' })).props.name, 'download')
  assert.equal(expand(React.createElement(module.default, { status: 'ready', id: 'x' })), null)
  assert.equal(expand(React.createElement(module.default, { status: 'loading', id: 'x' })), null)
})

test('받는 중 진행률을 알면 그만큼 채운 막대(화면 읽기 값 포함)를 그린다', () => {
  const { module, timings } = load({ progress: 0.42 })
  const tree = expand(React.createElement(module.default, { status: 'downloading', id: 'x' }))
  assert.equal(tree.props.accessibilityRole, 'progressbar')
  assert.deepEqual(tree.props.accessibilityValue, { min: 0, max: 100, now: 42 })
  assert.ok(find(tree, node => node.props?.style?.some?.(style => style?.width === '42%')), '42% 만큼 채운다')
  assert.equal(timings.length, 0, '진행률을 알면 오가는 애니메이션을 돌리지 않는다')
})

test('진행률을 모르면 오가는 막대를 돌리고, 웹은 네이티브 드라이버를 쓰지 않는다(react-native-web 에는 없다)', () => {
  for (const [os, nativeDriver] of [['web', false], ['android', true], ['ios', true]]) {
    const { module, timings, stopped } = load({ os })
    const tree = expand(React.createElement(module.default, { status: 'downloading', id: 'x' }))
    assert.equal(tree.props.accessibilityLabel, '받는 중')
    assert.ok(find(tree, node => node.type === 'Animated.View'), os)
    assert.equal(timings.length, 1, os)
    assert.equal(timings[0].useNativeDriver, nativeDriver, os)
    stopped.cleanup()
    assert.equal(stopped.length, 1, '화면에서 빠지면 애니메이션을 멈춘다')
  }
})
