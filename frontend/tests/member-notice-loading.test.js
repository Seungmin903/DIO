import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const walk = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(walk)]
function load(name) {
  const source = readFileSync(new URL(`../src/diary/components/${name}.js`, import.meta.url), 'utf8')
  const code = expo('@babel/core').transformSync(source, { configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code
  const mod = { exports: {} }
  const mocks = { 'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View' }, '../styles': { styles: {} }, '../../shared/DioButton': { __esModule: true, default: 'Pressable' }, '../../auth/sessionExpiry.js': { authenticationErrorMessage: () => '인증 오류' }, '../../auth/AuthenticationRecovery': { __esModule: true, default: 'AuthenticationRecovery' } }
  new Function('require', 'module', 'exports', code)(id => mocks[id] || require(id), mod, mod.exports)
  return mod.exports.default
}
const trash = load('MemberTrashNotice'), request = load('MemberRequestNotice')
const buttons = node => walk(node).filter(n => n.type === 'Pressable')
const words = node => walk(node).filter(n => n.type === 'Text').map(n => n.props.children)

test('휴지통은 처음 받을 때만 문구를 보이고, 옮기기 · 복원 뒤 다시 받는 동안은 칸을 그리지 않는다(목록이 밀리지 않게)', () => {
  const first = trash({ state: { trashLoading: true } })
  assert.equal(buttons(first).length, 0)
  assert.ok(words(first).some(s => s.includes('있어요')))
  for (const state of [{ lifecycle: { busy: true } }, { trashLoading: true, trashLoaded: true, trash: [{ id: 'a' }] }, {}]) assert.equal(trash({ state }), null)
})

test('휴지통 오류·재시도·메타데이터 경고 시 기존 복구 동작을 유지한다', () => {
  const calls = [], reload = () => calls.push('reload'), retry = () => calls.push('retry'), dismiss = () => calls.push('dismiss')
  const state = { lifecycle: { canRetry: true, error: { status: 503 } }, metadataCleanupError: { code: 'cleanup', message: '정리 경고' }, store: { dismissMetadataCleanupWarning: dismiss } }
  const view = trash({ state, onReload: reload, onRetry: retry })
  const actions = buttons(view)
  assert.equal(actions.length, 3)
  actions.forEach(button => button.props.onPress())
  assert.deepEqual(calls, ['dismiss', 'reload', 'retry'])
  const busyView = trash({ state: { ...state, trashLoading: true }, onReload: reload, onRetry: retry })
  assert.ok(buttons(busyView).filter(b => b.props.onPress === reload || b.props.onPress === retry).every(b => b.props.disabled))
})

test('회원 목록을 다시 받기만 할 때는 칸을 그리지 않는다(목록이 밀리지 않게)', () => {
  assert.equal(request({ refreshing: true }), null)
  assert.equal(request({}), null)
})

test('회원 생성 확인·오류·만료 요청에는 기존 복구 버튼을 유지한다', () => {
  const calls = [], onRetry = () => calls.push('retry'), onReload = () => calls.push('reload'), onArchiveExpired = () => calls.push('archive')
  for (const props of [{ pending: {} }, { error: { message: '오류' } }, { pending: { expired: true } }]) {
    const view = request({ ...props, onRetry, onReload, onArchiveExpired })
    buttons(view).forEach(button => button.props.onPress())
  }
  assert.deepEqual(calls, ['retry', 'reload', 'reload', 'archive'])
})
