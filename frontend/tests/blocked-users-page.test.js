import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
function load(file, mocks) {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  const m = { exports: {} }; new Function('require', 'module', 'exports', code)(id => id in mocks ? mocks[id] : require(id), m, m.exports); return m.exports
}
const all = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(all)]
const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : !n || typeof n !== 'object' ? '' : [n.props?.children].flat(Infinity).map(text).join('')
function mount(store, state) {
  let hooks = [], cursor = 0, effects = []
  const react = {
    useState: v => { const i = cursor++; if (!(i in hooks)) hooks[i] = v; return [hooks[i], next => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next }] },
    useRef: v => { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: v }; return hooks[i] },
    useEffect: fn => { effects.push(fn) },
  }
  const Page = load('../src/safety/BlockedUsersPage.js', {
    react, 'react-native': { ActivityIndicator: 'spinner', Pressable: 'button', ScrollView: 'scroll', StyleSheet: { create: x => x }, Text: 'text', View: 'view' },
    '../editor/components/controls/ConfirmDialog': { __esModule: true, default: 'confirm' },
    '../diary/components/BackButton': { __esModule: true, default: 'back' },
    '../diary/components/EmptyState': { __esModule: true, default: 'empty' },
    '../diary/components/Header': { __esModule: true, default: 'header' },
    '../shared/theme': { colors: {} },
    './SafetyProvider': { useSafety: () => ({ store, state }) },
    './SafetyScreen': { Person: 'person', SafetyButton: 'safety-button' },
    './safetyModel': { UNAVAILABLE: '서버 미연결' },
    './styles': { safetyStyles: new Proxy({}, { get: () => ({}) }) },
  }).default
  return { render: props => { cursor = 0; effects = []; const tree = Page({ onClose() {}, ...props }); effects.forEach(fn => fn()); return tree } }
}

test('537: 태블릿 차단 목록 페이지는 들어올 때 목록을 새로 받고, 비면 빈 상태를 남은 높이 가운데에 둔다', () => {
  let refreshed = 0
  const store = { mode: 'server', refresh() { refreshed++ } }
  const ui = mount(store, { status: 'ready', blocks: [], busy: false })
  const tree = ui.render()
  assert.equal(refreshed, 1)
  assert.equal(all(tree).find(n => n.type === 'header').props.title, '차단한 사용자')
  const empty = all(tree).find(n => n.type === 'empty')
  assert.equal(empty.props.title, '차단한 사용자가 없어요')
  const wrap = all(tree).find(n => n.type === 'view' && [n.props.children].flat().includes(empty))
  assert.deepEqual(wrap.props.style, { flex: 1, justifyContent: 'center' })
})

test('537: 차단 해제는 위험색이 아닌 확인창을 거쳐 store.unblock 을 부르고 알약으로 알린다', async () => {
  const unblocked = []
  const member = { id: '6', nickname: '모아', blockedAt: '2026-11-09T10:00:00Z' }
  const store = { mode: 'server', refresh() {}, unblock: async m => { unblocked.push(m.id) } }
  const ui = mount(store, { status: 'ready', blocks: [member], busy: false })
  let tree = ui.render()
  assert.match(text(tree), /전체 1명/)
  all(tree).find(n => n.props?.accessibilityLabel === '모아 차단 해제').props.onPress()
  tree = ui.render()
  const dialog = all(tree).find(n => n.type === 'confirm')
  assert.equal(dialog.props.open, true)
  assert.equal(dialog.props.danger, false)
  assert.equal(dialog.props.title, '모아님의 차단을 해제할까요?')
  await dialog.props.onConfirm()
  assert.deepEqual(unblocked, ['6'])
  assert.match(text(ui.render()), /차단을 해제했어요/)
})

test('537: 서버 미연결이면 목록을 부르지 않고 해제 버튼을 막는다', () => {
  let refreshed = 0
  const store = { mode: 'unavailable', refresh() { refreshed++ } }
  const tree = mount(store, { status: 'idle', blocks: [{ id: '1', nickname: '하루', blockedAt: '2026-11-09T10:00:00Z' }], busy: false }).render()
  assert.equal(refreshed, 0)
  assert.match(text(tree), /서버 미연결/)
  assert.equal(all(tree).find(n => n.props?.accessibilityLabel === '하루 차단 해제').props.disabled, true)
})
