import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthApi } from '../src/auth/authApi.js'
import { createAuthenticatedNotificationSession } from '../src/notifications/authenticatedNotifications.js'
import { createAuthenticatedMemberTransport } from '../src/diary/services/memberTransport.js'

const reply = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status })
const tokens = (id, token) => ({ accessToken: token, refreshToken: `refresh-${id}`, expiresIn: 1800,
  user: { userId: id, email: `u${id}@example.test`, nickname: `user${id}` } })
const login = (auth, id = '101') => auth.login({ email: `u${id}@example.test`, password: 'Password123!' })
function fixture({ refresh, fetchData } = {}) {
  let time = 0, refreshes = 0
  const calls = []
  const auth = createAuthApi({ baseUrl: 'https://integration.example.test', now: () => time, fetchImpl: async (url, options) => {
    if (url.endsWith('/login')) return reply(tokens(JSON.parse(options.body).email.match(/u(\d+)/)[1], 'initial'))
    if (url.endsWith('/logout')) return reply(null, 204)
    if (url.endsWith('/refresh')) { refreshes++; return refresh ? refresh() : reply(tokens('101', 'renewed')) }
    throw new Error('Unexpected auth path')
  } })
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options })
    if (fetchData) return fetchData(url, options, auth)
    return reply(url.includes('/notifications') ? { unreadCount: 0 } : {})
  }
  const channels = () => ({
    member: createAuthenticatedMemberTransport({ auth, accountId: '101', ...auth.getConnectionOptions(), fetchImpl }),
    notifications: createAuthenticatedNotificationSession({ auth, userId: '101', fetchImpl }).api,
  })
  return { auth, calls, channels, expire: () => { time = 1780000 }, get refreshes() { return refreshes } }
}

test('회원·알림 동시 만료 요청은 실제 인증 API의 갱신 한 번과 같은 새 토큰을 공유한다', async () => {
  const f = fixture(); await login(f.auth); const c = f.channels(); f.expire()
  await Promise.all([c.member({ path: '/member/diaries' }), c.notifications.count()])
  assert.equal(f.refreshes, 1); assert.equal(f.calls.length, 2)
  assert.ok(f.calls.every(call => call.headers.Authorization === 'Bearer renewed'))
})

test('회원 401 재시도는 실제 인증 API와 같은 생성 키·본문을 유지한다', async () => {
  const f = fixture({ fetchData: (url, options) => options.headers.Authorization === 'Bearer initial' ? reply({ code: 'INVALID_TOKEN' }, 401) : reply({}) })
  await login(f.auth); const c = f.channels()
  await c.member({ method: 'POST', path: '/member/diaries', requestId: 'same-key', body: { title: 'kept' } })
  assert.equal(f.refreshes, 1); assert.equal(f.calls.length, 2)
  assert.equal(f.calls[0].headers['Idempotency-Key'], f.calls[1].headers['Idempotency-Key'])
  assert.equal(f.calls[0].body, f.calls[1].body)
})

test('같은 계정 재로그인도 옛 회원·알림 호출자를 폐기하고 새 호출자는 사용할 수 있다', async () => {
  const f = fixture(); await login(f.auth); const old = f.channels()
  await f.auth.logout(); await login(f.auth)
  await assert.rejects(old.member({ path: '/member/diaries' }), { status: 401 })
  await assert.rejects(old.notifications.count(), { status: 401 })
  assert.equal(f.calls.length, 0); assert.equal(f.refreshes, 0)
  const current = f.channels(); await Promise.all([current.member({ path: '/member/diaries' }), current.notifications.count()])
  assert.equal(f.calls.length, 2)
})

test('회원·알림 공동 갱신 중 계정이 바뀌면 새 계정 토큰으로 데이터 요청을 보내지 않는다', async () => {
  let release, started
  const gate = new Promise(resolve => { started = resolve })
  const f = fixture({ refresh: () => { started(); return new Promise(resolve => { release = resolve }) } })
  await login(f.auth); const c = f.channels(); f.expire()
  const results = Promise.allSettled([c.member({ path: '/member/diaries' }), c.notifications.count()])
  await gate; await login(f.auth, '202'); release(reply(tokens('101', 'too-late')))
  for (const result of await results) { assert.equal(result.status, 'rejected'); assert.equal(result.reason.status, 401) }
  assert.equal(f.calls.length, 0); assert.equal(f.refreshes, 1)
})
