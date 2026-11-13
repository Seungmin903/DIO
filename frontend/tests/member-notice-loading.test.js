import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as libraryQuery from '../src/diary/utils/libraryQuery.js'
import * as diarySelection from '../src/diary/utils/diarySelection.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const walk = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(walk)]
function load(name, overrides = {}, { allExports = false } = {}) {
  const source = readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  const code = expo('@babel/core').transformSync(source, { configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code
  const mod = { exports: {} }
  const mocks = { 'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View' }, '../styles': { styles: {} }, '../../shared/DioButton': { __esModule: true, default: 'Pressable' }, '../../auth/sessionExpiry.js': { authenticationErrorMessage: () => '인증 오류' }, '../../auth/AuthenticationRecovery': { __esModule: true, default: 'AuthenticationRecovery' } }
  new Function('require', 'module', 'exports', code)(id => overrides[id] || mocks[id] || require(id), mod, mod.exports)
  return allExports ? mod.exports : mod.exports.default
}
const trash = load('diary/components/MemberTrashNotice'), request = load('diary/components/MemberRequestNotice')
const buttons = node => walk(node).filter(n => n.type === 'Pressable')
const words = node => walk(node).filter(n => n.type === 'Text').map(n => n.props.children)

test('825: 보관함 오류 안내 위치, 재시도 및 401 로그인 복구', () => {
  const react = { memo: fn => fn, useCallback: fn => fn, useEffect() {}, useMemo: fn => fn(),
    useRef: current => ({ current }), useState: initial => [initial, () => {}] }
  const native = { View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable',
    StyleSheet: { create: styles => styles }, Platform: { OS: 'web' },
    Animated: { Value: class {}, createAnimatedComponent: () => 'FlatList', event() {} } }
  const styles = { styles: { libraryCenteredNotice: { justifyContent: 'center' }, libraryFixedTop: 'fixedTop' } }
  const loginCalls = []
  const authRecovery = load('auth/AuthenticationRecovery', {
    'react-native': native, './loginGate': { useLoginEntry: () => value => loginCalls.push(value) },
    '../shared/DioButton': { __esModule: true, default: 'Pressable' },
  }, { allExports: true })
  const recovery = authRecovery.default
  const notice = load('diary/components/MemberLibraryNotice', {
    '../../auth/AuthenticationRecovery': authRecovery,
  })
  const stub = name => ({ __esModule: true, default: name })
  const screen = load('diary/screens/LibraryScreen', {
    react, 'react-native': native, '../styles': styles,
    '../constants': { C: {}, FILTERS: [{ id: 'all' }, { id: 'favorite' }], LIBRARY_SCOPES: [],
      CAROUSEL_ITEM_WIDTH: 200, CAROUSEL_GAP: 20, CAROUSEL_STEP: 220 },
    '../utils/libraryQuery': libraryQuery, '../utils/diarySelection': diarySelection,
    '../utils/useDiaryGrid': { useDiaryGrid: () => null }, '../utils/carouselFollow': { carouselMotion: () => ({}) },
    '../components/OpenBookShelf': { ...stub('OpenBookShelf'), preloadOpenBooks() {} },
    '../components/EmptyState': { ...stub('EmptyState'), LoadingSpot: 'LoadingSpot' },
    '../components/PopoverMenu': stub('PopoverMenu'), '../components/LibraryCreateMenu': stub('LibraryCreateMenu'), '../../editor/components/controls/FadeScroll': stub('FadeScroll'),
    '../../shared/AppIcon': stub('AppIcon'), '../../shared/FavoriteStar': stub('FavoriteStar'),
    ...Object.fromEntries(['DiaryCard', 'IconButton', 'PhoneBell', 'SelectionBar', 'SelectionButton', 'LibrarySearchScreen']
      .map(name => [`../components/${name}`, stub(name)])),
  })
  const error = { message: '서버에 연결하지 못했어요.' }
  let retries = 0
  const onRetry = () => retries++
  const props = { diaries: [], view: 'grid', carousel: 0, filter: 'all', suppressEmpty: true }
  const centered = notice({ library: { error }, centered: true, onRetry })
  for (const view of ['grid', 'open', 'carousel']) {
    const tree = screen({ ...props, view, centeredNotice: centered })
    const body = walk(tree).find(node => node.type === 'ScrollView')
    assert.equal(body.props.contentContainerStyle, styles.styles.libraryCenteredNotice)
    assert.deepEqual(words(body).filter(word => word === error.message), [error.message])
    assert.equal(walk(tree).filter(node => node === centered).length, 1)
  }
  const retry = buttons(centered).find(button => button.props.label === '다시 불러오기')
  retry.props.onPress()
  assert.equal(retries, 1)

  const inline = notice({ library: { error }, onRetry })
  const populated = walk(screen({ ...props, diaries: [{ id: 'one' }], remoteQuery: {}, requestNotice: inline }))
  const header = populated.find(node => node.type === 'View' && node.props.style?.includes?.('fixedTop'))
  assert.ok(walk(header).includes(inline))
  assert.ok(populated.some(node => node.type === 'DiaryCard' && node.props.diary.id === 'one'))

  const expired = notice({ library: { error: { status: 401, sessionExpired: true } }, centered: true, onRetry })
  assert.equal(buttons(expired).length, 0)
  const recoveryNode = walk(expired).find(node => node.type === recovery)
  const loginButton = recovery(recoveryNode.props)
  assert.equal(loginButton.props.label, '다시 로그인')
  loginButton.props.onPress()
  assert.deepEqual(loginCalls, [{ sessionExpired: true }])
})

test('휴지통 알림 칸은 불러오는 동안 줄을 그리지 않는다(처음 불러올 때는 휴지통 자리 가운데 스피너 — TrashScreen loading, 지라 590)', () => {
  for (const state of [{ trashLoading: true }, { lifecycle: { busy: true } }, { trashLoading: true, trashLoaded: true, trash: [{ id: 'a' }] }, {}]) assert.equal(trash({ state }), null)
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

test('보관함은 휴지통 복원·영구 삭제 오류를 숨기고 휴지통 이동 복구는 유지한다', () => {
  const error = { status: 503 }
  for (const kind of ['restore', 'purge']) {
    const state = { lifecycle: { kind, error, canRetry: true }, trashError: error, metadataCleanupError: { code: 'cleanup', message: '정리 경고' } }
    assert.equal(trash({ state, context: 'library' }), null)
    assert.ok(trash({ state }), '휴지통에서는 오류를 볼 수 있어야 한다')
  }
  const calls = []
  const state = { lifecycle: { kind: 'trash', error, canRetry: true } }
  const view = trash({ state, context: 'library', onReload: () => calls.push('reload'), onRetry: () => calls.push('retry') })
  assert.ok(words(view).includes('처리 결과를 확인하지 못했어요. 다시 확인해 주세요.'))
  buttons(view).forEach(button => button.props.onPress())
  assert.deepEqual(calls, ['reload', 'retry'])
  assert.equal(trash({ state: { trashError: error }, context: 'library' }), null)
})

test('회원 목록을 다시 받기만 할 때는 칸을 그리지 않는다(목록이 밀리지 않게)', () => {
  assert.equal(request({ refreshing: true }), null)
  assert.equal(request({}), null)
})

test('S15P31F106-723: 생성 안내는 사용자가 아는 말로 적고 확인 · 목록 확인 · 정리를 구분한다', () => {
  const labels = node => buttons(node).map(b => b.props.label)
  const pending = request({ pending: {}, onRetry() {}, onReload() {}, onArchiveExpired() {} })
  assert.deepEqual(words(pending), ['다이어리가 만들어졌는지 확인하지 못했어요.'])
  assert.deepEqual(labels(pending), ['생성 결과 확인'])
  const expired = request({ pending: { expired: true }, onRetry() {}, onReload() {}, onArchiveExpired() {} })
  assert.match(words(expired)[0], /확인할 수 있는 기간이 지나/)
  assert.deepEqual(labels(expired), ['보관함 목록 확인', '이전 요청 정리'], '목록 확인과 요청 정리를 따로 둔다')
  for (const view of [pending, expired]) for (const text of words(view)) assert.doesNotMatch(String(text), /요청|키|응답/, '내부 용어를 쓰지 않는다')
  const failed = request({ pending: {}, error: { message: '서버에 연결하지 못했어요.' }, onRetry() {}, onReload() {} })
  assert.deepEqual(words(failed), ['다이어리가 만들어졌는지 확인하지 못했어요.', '서버에 연결하지 못했어요.'], '확인 실패 이유를 둘째 줄에')
  assert.deepEqual(labels(request({ error: { message: '오류' }, onReload() {} })), ['보관함 다시 불러오기'])
  assert.deepEqual(labels(request({ pending: {}, busy: true, onRetry() {} })), ['확인 중…'])
})

test('회원 생성 확인·오류·만료 요청에는 기존 복구 버튼을 유지한다', () => {
  const calls = [], onRetry = () => calls.push('retry'), onReload = () => calls.push('reload'), onArchiveExpired = () => calls.push('archive')
  for (const props of [{ pending: {} }, { error: { message: '오류' } }, { pending: { expired: true } }]) {
    const view = request({ ...props, onRetry, onReload, onArchiveExpired })
    buttons(view).forEach(button => button.props.onPress())
  }
  assert.deepEqual(calls, ['retry', 'reload', 'reload', 'archive'])
})
