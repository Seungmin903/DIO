import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const fromExpo = createRequire(require.resolve('expo/package.json'))
const { code } = fromExpo('@babel/core').transformSync(readFileSync(new URL('../src/auth/SessionRestoreScreen.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[fromExpo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], fromExpo.resolve('@babel/plugin-transform-modules-commonjs')],
})

// 회원 보관함 복구 화면을 실제 JSX 로 그린다. 버튼은 접근성 이름(label)과 모양(variant)으로 찾는다.
function load() {
  const module = { exports: {} }
  const native = {
    ScrollView: ({ children }) => React.createElement('div', null, children),
    StyleSheet: { create: (styles) => styles },
    Text: ({ children }) => React.createElement('span', null, children),
    View: ({ children }) => React.createElement('div', null, children),
  }
  const loader = (name) => {
    if (name === 'react-native') return native
    if (name === 'react-native-safe-area-context') return { SafeAreaView: ({ children }) => React.createElement('main', null, children) }
    if (name === '../shared/theme') return { colors: {} }
    if (name === '../shared/DioButton') return { __esModule: true, default: ({ label, variant, disabled, loading }) => React.createElement('button', { 'aria-label': label, 'data-variant': variant, disabled: disabled || loading, 'aria-busy': !!loading }, label) }
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(loader, module, module.exports)
  return module.exports.default
}
const buttons = (html) => [...html.matchAll(/aria-label="([^"]+)" data-variant="([^"]+)"/g)].map(([, label, variant]) => `${label}:${variant}`)

test('S15P31F106-718: 만료된 로그인은 재시도 없이 다시 로그인이 주 버튼이고 게스트 전환은 따로 골라야 한다', () => {
  const Screen = load()
  for (const error of [{ sessionExpired: true }, { status: 401, code: 'INVALID_TOKEN' }]) {
    const html = renderToStaticMarkup(React.createElement(Screen, { error, status: 'error', onRetry() {}, onLogin() {}, onGuest() {} }))
    assert.deepEqual(buttons(html), ['다시 로그인:filled', '게스트로 계속:ghost'], JSON.stringify(error))
    assert.match(html, /로그인이 만료됐어요/)
  }
})

test('통신 · 서버 오류는 연결 재시도가 주 버튼이고 다시 로그인 · 게스트로 계속이 뒤따른다', () => {
  const Screen = load()
  for (const error of [{ code: 'NETWORK_ERROR' }, { status: 503 }, { code: 'SECURE_STORE_UNAVAILABLE' }]) {
    const html = renderToStaticMarkup(React.createElement(Screen, { error, status: 'error', onRetry() {}, onLogin() {}, onGuest() {} }))
    assert.deepEqual(buttons(html), ['연결 재시도:filled', '다시 로그인:ghost', '게스트로 계속:ghost'], JSON.stringify(error))
  }
})

test('연결 재시도와 게스트 시작은 해당 버튼만 바쁘다고 알리고 모든 버튼 입력을 잠근다', () => {
  const Screen = load()
  for (const [status, label, variant] of [
    ['loading', '연결을 확인하는 중…', 'filled'],
    ['guest', '게스트 보관함을 여는 중…', 'ghost'],
  ]) {
    const html = renderToStaticMarkup(React.createElement(Screen, { error: { code: 'NETWORK_ERROR' }, status }))
    assert.match(html, new RegExp(`aria-label="${label}" data-variant="${variant}" disabled="" aria-busy="true">${label}`))
    assert.equal(html.match(/ disabled=""/g)?.length, 3)
    assert.equal(html.match(/ aria-busy="true"/g)?.length, 1)
  }
})
