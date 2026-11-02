import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/auth/loginGate.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
// 훅 없이 값만 확인할 수 있게 react 를 작게 흉내 낸다: useContext 는 가장 최근 제공자 값, useCallback 은 그대로
function load(value) {
  const shown = []
  const react = { createContext: initial => ({ initial }), createElement: () => null, useMemo: fn => fn(), useCallback: fn => fn, useContext: context => value ?? context.initial }
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => id === 'react' ? react : { confirmAction: request => shown.push(request) }, mod, mod.exports)
  return { ...mod.exports, shown }
}

test('로그인한 사용자는 동작을 그대로 실행하고 안내 창은 뜨지 않는다', () => {
  const { useLoginGate, shown } = load({ authenticated: true, onLogin: () => {} })
  let ran = 0
  useLoginGate()('내 폰트 만들기', () => ran++)
  assert.equal(ran, 1); assert.equal(shown.length, 0)
})

test('제공자가 없는 곳은 통과시킨다', () => {
  const { useLoginGate, shown } = load(null)
  let ran = 0
  useLoginGate()('스티커 시트 분리', () => ran++)
  assert.equal(ran, 1); assert.equal(shown.length, 0)
})

test('게스트는 기능 대신 로그인 안내 창을 보고, 확인하면 로그인 화면으로 보낸다', () => {
  let moved = 0
  const { useLoginGate, shown } = load({ authenticated: false, onLogin: () => moved++ })
  let ran = 0
  useLoginGate()('사진 속 대상 오리기', () => ran++)
  assert.equal(ran, 0); assert.equal(shown.length, 1)
  const [request] = shown
  assert.equal(request.title, '로그인이 필요해요')
  assert.equal(request.message, '사진 속 대상 오리기는 회원가입하고 로그인한 사용자만 쓸 수 있어요.')
  assert.equal(request.confirmLabel, '로그인 · 회원가입'); assert.equal(request.cancelLabel, '나중에')
  assert.equal(request.danger, false)
  assert.equal(moved, 0, '안내 창을 띄운 것만으로는 로그인 화면으로 가지 않는다')
  request.onConfirm(); assert.equal(moved, 1)
})

test('세 기능 이름 모두 받침에 맞는 조사를 쓴다', () => {
  const { loginGateCopy } = load(null)
  assert.match(loginGateCopy('내 폰트 만들기').message, /^내 폰트 만들기는 /)
  assert.match(loginGateCopy('스티커 시트 분리').message, /^스티커 시트 분리는 /)
  assert.match(loginGateCopy('사진 속 대상 오리기').message, /^사진 속 대상 오리기는 /)
  assert.match(loginGateCopy('손글씨 공방').message, /^손글씨 공방은 /)
})
