import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// 지라 619: 여러 권 휴지통 결과는 목록 위 칸(옛 긴 버튼)이 아니라 알약 토스트로 알린다.
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json')), babel = expo('@babel/core')
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]
const texts = tree => nodes(tree).flatMap(n => typeof n.props?.children === 'string' ? [n.props.children] : [])

const renderNotice = props => {
  const source = babel.transformSync(readFileSync(new URL('../src/diary/components/MemberLibraryNotice.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code
  const mod = { exports: {} }
  const mocks = { 'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator' }, '../styles': { styles: {} }, '../constants': { C: {} },
    '../../auth/sessionExpiry.js': { authenticationErrorMessage: () => '다시 로그인해 주세요' },
    '../../auth/AuthenticationRecovery': { __esModule: true, default: 'AuthenticationRecovery', needsAuthenticationRecovery: error => error?.status === 401 } }
  new Function('require', 'module', 'exports', source)(id => id === 'react/jsx-runtime' ? require(id) : mocks[id], mod, mod.exports)
  return mod.exports.default({ library: {}, ...props })
}

test('여러 권 휴지통 결과(진행 · 성공 · 실패)는 목록 위 칸에 글줄이나 버튼을 남기지 않는다', () => {
  for (const bulk of [
    { ids: ['a', 'b'], succeeded: ['a'], failed: [], busy: true },
    { ids: ['a', 'b'], succeeded: ['a', 'b'], failed: [], busy: false },
    { ids: ['a', 'b'], succeeded: ['a'], failed: [{ id: 'b', error: { status: 503 } }], busy: false, canRetry: true },
    { ids: ['a'], succeeded: ['a'], failed: [], busy: false, refreshError: { status: 503 }, canRetry: true },
  ]) {
    const tree = renderNotice({ bulk })
    assert.deepEqual(texts(tree), [])
    assert.equal(nodes(tree).some(n => n.type === 'Pressable'), false)
  }
})

test('다시 로그인해야 하는 실패만 목록 위에 남긴다', () => {
  const tree = renderNotice({ bulk: { ids: ['a'], succeeded: [], failed: [{ id: 'a', error: { status: 401 } }], busy: false } })
  assert.deepEqual(texts(tree), ['다시 로그인해 주세요'])
  assert.equal(nodes(tree).some(n => n.type === 'AuthenticationRecovery'), true)
})

test('App 은 결과를 알약 토스트로 띄우고 성공 2초 · 실패 6초 뒤 닫으며, 옛 닫기 버튼은 없다', () => {
  const app = readFileSync(new URL('../App.js', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /선택 작업 안내 닫기|onDismissBulk|이동 완료/)
  assert.match(app, /bulkTrashToastMessage\(bulkTrash\)/)
  assert.match(app, /권을 휴지통으로 옮길까요\?/)
  assert.match(app, /dismissBulkTrash\(\), bulkTrashFailed \? ACTION_TOAST_MS : BULK_TRASH_DONE_MS/)
  assert.match(app, /\{trashToast \|\| libraryToast\}/)
  // 휴지통 알약에 가려진 동안 보조 저장 알약의 시간은 멈춘다
  assert.match(app, /libraryNotice\.busy \|\| libraryToastHidden\) return undefined;/)
  assert.match(app, /busy=\{bulkTrashRetrying\} onAction=\{retryBulkTrash\}/)
  assert.match(app, /if \(bulkTrashRetryingRef\.current\) return;/)
})

test('토스트 문구: 진행 · 성공 · 일부 실패 · 목록 갱신 실패 · 다시 로그인', async () => {
  const { bulkTrashToastMessage, bulkTrashNeedsLogin, BULK_TRASH_DONE_MS } = await import('../src/diary/utils/bulkTrashToast.js')
  assert.equal(BULK_TRASH_DONE_MS, 2000)
  assert.equal(bulkTrashToastMessage(null), null)
  assert.equal(bulkTrashToastMessage({ ids: ['a', 'b'], succeeded: ['a'], failed: [], busy: true }), '휴지통으로 옮기고 있어요. 1/2권')
  assert.equal(bulkTrashToastMessage({ ids: ['a', 'b'], succeeded: ['a', 'b'], failed: [] }), '2권을 휴지통으로 옮겼어요.')
  assert.equal(bulkTrashToastMessage({ ids: ['a', 'b'], succeeded: ['a'], failed: [{ id: 'b', error: { status: 503 } }] }), '1권을 옮겼고 1권은 옮기지 못했어요.')
  assert.equal(bulkTrashToastMessage({ ids: ['a'], succeeded: ['a'], failed: [], refreshError: { status: 503 } }), '휴지통으로 옮겼지만 목록을 새로 불러오지 못했어요.')
  const login = { ids: ['a'], succeeded: [], failed: [{ id: 'a', error: { status: 401 } }] }
  assert.equal(bulkTrashNeedsLogin(login), true)
  assert.equal(bulkTrashToastMessage(login), null)
})

test('남은 페이지가 있는 동안(이어 받는 중 · 오류로 멈춤) 전체 선택을 막는다', () => {
  const library = readFileSync(new URL('../src/diary/screens/LibraryScreen.js', import.meta.url), 'utf8')
  assert.match(library, /const allLabel = allSelected \? '전체 해제' : '전체 선택'/)
  assert.match(library, /disabled=\{trashing \|\| !manageable\.length \|\| hasMore\}/)
})
