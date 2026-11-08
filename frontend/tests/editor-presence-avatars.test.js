import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const code = babel.transformSync(read('../src/sharing/SharingEntry.js'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const nodes = n => (!n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)])

function load() {
  const react = { useRef: initial => ({ current: initial }), useState: initial => [initial, () => {}], useEffect: () => {} }
  const native = { useWindowDimensions: () => ({ width: 1200, height: 800 }), Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' }
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => id === 'react' ? react : id === 'react-native' ? native
    : id === 'react-native-safe-area-context' ? { useSafeAreaInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) }
    : id === '../notifications/notificationCount.js' ? { notificationCountLabel: () => null }
    : id === 'react/jsx-runtime' ? require(id) : id === './styles' ? { sharingStyles: {} } : { __esModule: true, default: id }, mod, mod.exports)
  return mod.exports
}
const SharingEntry = load()
// 얼굴: [이름, 접속 여부]. 접속 안 한 얼굴은 안쪽 View 에 OFFLINE_OPACITY 가 걸린다
const faceNodes = tree => nodes(tree).filter(n => / 접속 (중|안 함)$/.test(n.props?.accessibilityLabel ?? ''))
const faces = tree => faceNodes(tree).map(n => n.props.accessibilityLabel.replace(/ 접속 (중|안 함)$/, ''))
const states = tree => faceNodes(tree).map(n => n.props.accessibilityLabel.endsWith('접속 중') ? 'on' : 'off')
const total = tree => nodes(tree).filter(n => n.type === 'Text' && /^\d+명$/.test([n.props.children].flat().join(''))).map(n => [n.props.children].flat().join(''))[0] ?? null
const counter = tree => nodes(tree).filter(n => n.type === 'Text' && /^\+/.test([n.props.children].flat().join(''))).map(n => [n.props.children].flat().join(''))[0] ?? null
const me = { id: '1', self: true, nickname: '나' }
const people = (n, online = []) => Array.from({ length: n }, (_, i) => ({ id: String(i + 2), nickname: `친구${i + 1}`, online: online.includes(i + 1) }))
const all = n => Array.from({ length: n }, (_, i) => i + 1)

test('680: 공유하지 않은 다이어리(참여자가 나뿐)는 얼굴 없이 공유 버튼만', () => {
  for (const members of [[], [me], [{ id: 'self', nickname: '나' }]]) {
    const tree = SharingEntry.default({ variant: 'bar', members, memberLimit: 3, onPress() {} })
    assert.deepEqual(faces(tree), [])
    assert.ok(nodes(tree).some(n => n.props?.accessibilityLabel === '다이어리 공유'))
  }
})

test('680: 공유한 사람 수만큼 늘 얼굴을 두고, 접속한 사람은 또렷하게 앞으로 · 안 한 사람은 흐리게', () => {
  // 아무도 접속하지 않아도 얼굴은 있다(전부 흐리게, 참여 순서)
  let tree = SharingEntry.default({ variant: 'bar', members: [me, ...people(3)], memberLimit: 3, onPress() {} })
  assert.deepEqual(faces(tree), ['친구1', '친구2', '친구3'])
  assert.deepEqual(states(tree), ['off', 'off', 'off'])
  assert.equal(total(tree), null)
  // 친구3 이 접속하면 맨 앞(위)으로, 또렷하게
  tree = SharingEntry.default({ variant: 'bar', members: [me, ...people(3, [3])], memberLimit: 3, onPress() {} })
  assert.deepEqual(faces(tree), ['친구3', '친구1', '친구2'])
  assert.deepEqual(states(tree), ['on', 'off', 'off'])
  const inner = faceNodes(tree).map(n => [n.props.children].flat().find(c => c?.type === 'View'))
  assert.equal(SharingEntry.OFFLINE_OPACITY, 0.5)
  assert.deepEqual(inner.map(v => [v.props.style].flat().some(st => st?.opacity === 0.5)), [false, true, true])
  // 앞 얼굴이 위에 겹친다(zIndex 큰 순)
  const z = faceNodes(tree).map(n => [n.props.style].flat().find(st => st && 'zIndex' in st).zIndex)
  assert.deepEqual(z, [3, 2, 1])
  // 둘 다 접속이면 참여 순서(접속한 순서가 아니라)
  tree = SharingEntry.default({ variant: 'bar', members: [me, ...people(3, [2, 1])], memberLimit: 3, onPress() {} })
  assert.deepEqual(faces(tree), ['친구1', '친구2', '친구3'])
  // 얼굴 묶음은 누르지 않는다
  assert.ok(!nodes(tree).some(n => /^함께하는 사람/.test(n.props?.accessibilityLabel ?? '') && n.props.onPress))
  // 넘치면 +N(최대 인원 4명이라 실제로는 생기지 않지만 규칙은 남긴다)
  tree = SharingEntry.default({ variant: 'bar', members: [me, ...people(5)], memberLimit: 3, onPress() {} })
  assert.equal(counter(tree), '+2')
  // 폰 도구 막대(compact)도 3명, 세로 막대(vertical)는 1명, 상단 바 한도가 커도 3명
  assert.equal(faces(SharingEntry.default({ compact: true, members: [me, ...people(4)], onPress() {} })).length, 3)
  assert.equal(faces(SharingEntry.default({ compact: true, vertical: true, members: [me, ...people(4)], onPress() {} })).length, 1)
  assert.equal(faces(SharingEntry.default({ variant: 'bar', members: [me, ...people(6)], memberLimit: 5, onPress() {} })).length, 3)
})

test('680: 웹소켓 PRESENCE 로 접속한 회원 id 를 받고, 연결이 끊기면 비운다', async () => {
  const { connectCollaboration } = await import('../src/collaboration/collaborationSocket.js')
  const diaryId = '10000000-0000-4000-8000-000000000001'
  const sockets = [], seen = []
  class Socket { constructor() { this.readyState = 1; sockets.push(this) } send() {} close() {} }
  const client = connectCollaboration({ baseUrl: 'https://dio.test/api/v1', diaryId, getAccessToken: async () => 't', onChange() {}, WebSocketImpl: Socket,
    onPresence: ids => seen.push(ids), schedule: () => 1, cancel() {} })
  const socket = sockets[0]
  socket.onmessage({ data: JSON.stringify({ type: 'PRESENCE', diaryId, userIds: ['7'] }) })
  assert.deepEqual(seen, [], 'READY 전에는 받지 않는다')
  socket.onmessage({ data: JSON.stringify({ type: 'READY', diaryId }) })
  socket.onmessage({ data: JSON.stringify({ type: 'PRESENCE', diaryId, userIds: ['7', 12, { bad: 1 }, null] }) })
  socket.onmessage({ data: JSON.stringify({ type: 'PRESENCE', diaryId: 'other', userIds: ['9'] }) })
  assert.deepEqual(seen, [['7', '12']])
  socket.onclose({ code: 1006 })
  assert.equal(seen.at(-1), null, '끊기면 접속 상태를 모른다')
  client.close()
  const screen = read('../src/editor/screens/EditorScreen.js')
  assert.match(screen, /online: online\.has\(String\(member\.id\)\)/)
  assert.match(screen, /if \(!Array\.isArray\(onlineUserIds\)\) return sharingMembers;/)
  assert.equal((screen.match(/sharingMembers=\{liveMembers\}/g) || []).length, 3)
})

test('680: 상단 바는 폰 세로 · 720 이상 태블릿 3명, 그 사이 좁은 창은 1명', () => {
  const bar = read('../src/editor/components/chrome/TopBar.js')
  assert.match(bar, /memberLimit=\{semi \? 3 : 1\}/)
  // 폰 세로 상단 바도 3명(제목 칸이 줄어 말줄임)
  assert.match(bar, /showLabel=\{false\} memberLimit=\{3\} hideCounter plain/)
})

test('638: 기본 프로필 색은 서버 참여자 색과 상관없이 회원 id 로만 정해져 참여자 시트 · 차단 목록 · 마이페이지가 같다', async () => {
  const avatar = read('../src/shared/DefaultAvatar.js')
  assert.match(avatar, /const tone = avatarTone\(seed\);/)
  assert.doesNotMatch(avatar, /memberAvatarTone|user\?\.color/)
  // 공유 참여자 { id } 와 마이페이지 계정 { userId } 가 같은 씨앗을 쓴다
  assert.match(read('../src/shared/avatarTone.js'), /export const avatarSeed = user => String\(user\?\.userId \?\? user\?\.accountId \?\? user\?\.id \?\? ''\);/)
  const screen = read('../src/safety/SafetyScreen.js')
  assert.match(screen, /width: 40, height: 40, borderRadius: 20,/)
})

test('680: 얼굴을 누르면 그 사람 닉네임만 얼굴 아래 알약으로 1.5초 보이고, 다른 얼굴을 누르면 바로 바뀐다', () => {
  const state = [], timers = []
  let si = 0
  const react = {
    useRef: initial => ({ current: initial }),
    useState: initial => { const i = si++; if (!(i in state)) state[i] = initial; return [state[i], v => { state[i] = v }] },
    useEffect: () => {},
  }
  const native = { Pressable: 'Pressable', Text: 'Text', View: 'View' }
  const mod = { exports: {} }
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout
  globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
  globalThis.clearTimeout = () => {}
  try {
    new Function('require', 'module', 'exports', code)(id => id === 'react' ? react : id === 'react-native' ? native
      : id === '../notifications/notificationCount.js' ? { notificationCountLabel: () => null }
      : id === 'react/jsx-runtime' ? require(id) : id === './styles' ? { sharingStyles: {} } : { __esModule: true, default: id }, mod, mod.exports)
    const props = { variant: 'bar', members: [me, ...people(3, [2])], memberLimit: 3, onPress() {} }
    const render = () => { si = 0; return mod.exports.default(props) }
    const pill = tree => nodes(tree).filter(n => n.type === 'Text' && n.props.numberOfLines === 1).map(n => [n.props.children].flat().join(''))[0] ?? null
    let tree = render()
    assert.equal(pill(tree), null)
    const face = name => faceNodes(render()).find(n => n.props.accessibilityLabel.startsWith(name))
    face('친구1').props.onPress()
    tree = render()
    assert.equal(pill(tree), '친구1')
    assert.equal(timers.at(-1).ms, mod.exports.NAME_PEEK_MS)
    assert.equal(mod.exports.NAME_PEEK_MS, 1500)
    face('친구2').props.onPress()
    assert.equal(pill(render()), '친구2')
    timers.at(-1).fn()
    assert.equal(pill(render()), null)
  } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear }
})

test('680: 서버가 접속 상태를 보내기 전(online 없음)에는 얼굴을 모두 또렷하게, 참여 순서대로', () => {
  const unknown = Array.from({ length: 3 }, (_, i) => ({ id: String(i + 2), nickname: `친구${i + 1}` }))
  const tree = SharingEntry.default({ variant: 'bar', members: [me, ...unknown], memberLimit: 3, onPress() {} })
  const circles = nodes(tree).filter(n => ['친구1', '친구2', '친구3'].includes(n.props?.accessibilityLabel))
  assert.deepEqual(circles.map(n => n.props.accessibilityLabel), ['친구1', '친구2', '친구3'])
  const inner = circles.map(n => [n.props.children].flat().find(c => c?.type === 'View'))
  assert.ok(inner.every(v => ![v.props.style].flat().some(st => st?.opacity === 0.5)))
  assert.ok(nodes(tree).some(n => n.props?.accessibilityLabel === '함께하는 사람 3명'))
})

test('680: 흐린 얼굴은 그림을 한 장으로 합친 뒤 흐리게(안드로이드에서 눈 · 입 뒤로 바탕색이 비치지 않게)', () => {
  const src = read('../src/sharing/SharingEntry.js')
  assert.match(src, /<View needsOffscreenAlphaCompositing renderToHardwareTextureAndroid=\{member\.online === false\}/)
})

test('AI 리뷰: 얼굴 묶음은 accessible 이 아니어서 안쪽 얼굴(닉네임 보기)을 화면 읽기로 따로 누를 수 있다', () => {
  const tree = SharingEntry.default({ variant: 'bar', members: [me, { id: '2', nickname: '친구1' }, { id: '3', nickname: '친구2' }], memberLimit: 3, onPress() {} })
  const group = nodes(tree).find(n => /^함께하는 사람/.test(n.props?.accessibilityLabel ?? ''))
  assert.notEqual(group.props.accessible, true)
  assert.ok(nodes(tree).some(n => n.props?.accessibilityLabel === '친구1' && typeof n.props.onPress === 'function'))
})

test('AI 리뷰: 기본 프로필 색은 같은 id 면 어디서나 같고, 참여자 id · 회원 userId 가 같은 색을 고르며, id 가 없으면 게스트 색', async () => {
  const { avatarTone, avatarSeed, AVATAR_TONES, GUEST_AVATAR_TONE } = await import('../src/shared/avatarTone.js')
  assert.equal(avatarTone('7'), avatarTone('7'))
  assert.ok(AVATAR_TONES.includes(avatarTone('7')))
  assert.equal(avatarTone(''), GUEST_AVATAR_TONE)
  assert.equal(avatarTone(null), GUEST_AVATAR_TONE)
  assert.equal(avatarSeed({ id: '2' }), avatarSeed({ userId: '2' }))
  assert.equal(avatarTone(avatarSeed({ id: '2' })), avatarTone(avatarSeed({ userId: 2 })))
  // 여러 id 가 한 색에 몰리지 않는다(6색 중 적어도 4색이 쓰인다)
  assert.ok(new Set(Array.from({ length: 24 }, (_, i) => avatarTone(String(i + 1)).fill)).size >= 4)
})
