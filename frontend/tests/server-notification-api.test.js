import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createNotificationHttpTransport, createServerNotificationSession, toServerNotification } from '../src/notifications/serverNotificationApi.js';
import { createNotificationStore } from '../src/notifications/notificationStore.js';

test('실제 HTTP 알림은 목록·카운트·개별 읽음·삭제와 전체 읽음을 제공한다', async t => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ url: req.url, method: req.method, token: req.headers.authorization, body: raw && JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/api/v1/notifications?')) return res.end(JSON.stringify({ items: [{ notification: {
      notificationId: '9007199254740993', notificationType: 'DIARY_INVITED', createdAt: '2026-10-27T00:00:00Z', readAt: null,
    }, invitation: null }], hasNext: false, nextCursor: null }));
    if (req.url.endsWith('/unread-count')) return res.end(JSON.stringify({ unreadCount: 2 }));
    if (req.url.endsWith('/read-watermarks')) return res.end(JSON.stringify({ readWatermark: 'opaque-token', expiresAt: '2026-10-28T01:00:00Z' }));
    if (req.method === 'PATCH') return res.end('{}');
    res.statusCode = 204; res.end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(process.env.DIO_NOTIFICATION_TEST_PORT || 0), '127.0.0.1', resolve); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  let token = 'first';
  const session = createServerNotificationSession({ baseUrl: `http://127.0.0.1:${server.address().port}/api/v1/`, getAccessToken: async () => token });
  const store = createNotificationStore(session.api, session.invitations); t.after(() => store.dispose());
  await store.refresh();
  assert.equal(store.getSnapshot().list.status, 'success', store.getSnapshot().list.error?.stack);
  assert.equal(store.getSnapshot().items[0].id, '9007199254740993');
  assert.deepEqual(store.getSnapshot().count.data, { unreadCount: 2 });
  assert.equal(store.getSnapshot().canReadAll, true);
  await store.readAll();
  assert.equal(store.getSnapshot().mutation.status, 'success');
  assert.deepEqual(requests.find(row => row.url.endsWith('/read-all')).body, { readWatermark: 'opaque-token' });
  token = 'refreshed';
  await store.open(store.getSnapshot().items[0]);
  await store.remove('9007199254740993');
  assert.ok(requests.some(row => row.method === 'PATCH' && row.url.endsWith('/9007199254740993') && !row.body));
  assert.equal(requests.find(row => row.method === 'PATCH').token, 'Bearer refreshed');
  assert.equal(requests.filter(row => row.url.endsWith('/read-watermarks')).length, 1);
  assert.ok(requests.some(row => row.method === 'DELETE' && row.url.endsWith('/9007199254740993')));
});

test('전체 읽음 실패 후 재시도는 같은 watermark를 사용한다', async () => {
  const calls = []; let attempts = 0;
  const api = {
    list: async () => ({ items: [{ id: '1' }], nextCursor: null }),
    count: async () => ({ unreadCount: 1 }),
    prepareReadAll: async () => { calls.push('prepare'); return { readWatermark: 'fixed' }; },
    readAll: async token => { calls.push(token); if (++attempts === 1) throw new Error('network'); },
  };
  const store = createNotificationStore(api, { get: async () => null });
  try {
    await store.refresh(); await store.readAll();
    assert.equal(store.getSnapshot().mutation.canRetry, true);
    await store.retryMutation();
    assert.deepEqual(calls, ['prepare', 'fixed', 'fixed']);
    assert.equal(store.getSnapshot().mutation.status, 'success');
  } finally { store.dispose(); }
});

test('공유 초대 gateway와 전체 읽음은 같은 인증 세션에서 공존한다', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const body = url.endsWith('/read-watermarks') ? { readWatermark: 'snapshot', expiresAt: '2026-10-29T01:00:00Z' } : { inviteId: 'invite-1' };
    return { ok: true, status: url.endsWith('/read-all') ? 204 : 200, json: async () => body };
  };
  const session = createServerNotificationSession({ baseUrl: 'https://example.test/api/v1', getAccessToken: async () => 'session-token', fetchImpl,
    createInvitations: ({ transport }) => ({ get: (inviteId, options) => transport({ ...options, path: `/invites/${inviteId}` }) }) });
  const invitation = await session.invitations.get('invite-1', {});
  const boundary = await session.api.prepareReadAll();
  await session.api.readAll(boundary.readWatermark);
  assert.equal(invitation.inviteId, 'invite-1');
  assert.deepEqual(calls.map(call => call.options.headers.Authorization), ['Bearer session-token', 'Bearer session-token', 'Bearer session-token']);
  assert.deepEqual(JSON.parse(calls[2].options.body), { readWatermark: 'snapshot' });
});

test('watermark 발급 응답을 잃으면 새 스냅샷을 자동 재발급하지 않는다', async () => {
  let preparations = 0;
  const api = { list: async () => ({ items: [{ id: '1' }], nextCursor: null }), count: async () => ({ unreadCount: 1 }),
    prepareReadAll: async () => { preparations++; throw new Error('lost'); }, readAll: async () => { throw new Error('unexpected'); } };
  const store = createNotificationStore(api, { get: async () => null });
  try {
    await store.refresh(); await store.readAll();
    assert.equal(store.getSnapshot().mutation.canRetry, false);
    await store.retryMutation(); assert.equal(preparations, 1);
    await store.readAll(); assert.equal(preparations, 2);
  } finally { store.dispose(); }
});

test('만료되거나 잘못된 경계는 재시도하지 않고 새 요청에서 새 경계를 발급한다', async () => {
  for (const [status, code] of [[410, 'READ_WATERMARK_EXPIRED'], [400, 'INVALID_READ_WATERMARK']]) {
    const calls = []; let preparations = 0;
    const api = { list: async () => ({ items: [{ id: '1' }], nextCursor: null }), count: async () => ({ unreadCount: 1 }),
      prepareReadAll: async () => ({ readWatermark: `token-${++preparations}` }),
      readAll: async token => { calls.push(token); if (calls.length === 1) throw Object.assign(new Error(code), { status, code }); } };
    const store = createNotificationStore(api, { get: async () => null });
    try {
      await store.refresh(); await store.readAll();
      assert.equal(store.getSnapshot().mutation.canRetry, false);
      await store.retryMutation(); assert.deepEqual(calls, ['token-1']);
      await store.readAll(); assert.deepEqual(calls, ['token-1', 'token-2']);
      assert.equal(store.getSnapshot().mutation.status, 'success');
    } finally { store.dispose(); }
  }
});

test('인증 미연결은 fetch 전 401, 취소는 AbortError', async () => {
  let calls = 0;
  const { api } = createServerNotificationSession({ baseUrl: 'https://example.test/api/v1', fetchImpl: async () => { calls++; } });
  await assert.rejects(api.list(), error => error.status === 401); assert.equal(calls, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.list({ signal: controller.signal }), { name: 'AbortError' });

});

test('서버 DTO는 초대 미연결을 허용하며 잘못된 식별자를 거부한다', () => {
  assert.throws(() => toServerNotification({ notification: { notificationId: 123 } }), error => error.code === 'INVALID_RESPONSE');
});


test('URLSearchParams 없이 cursor·limit와 특수 문자를 전달하고 빈 쿼리는 생략한다', async () => {
  const previous = globalThis.URLSearchParams;
  const requests = [];
  globalThis.URLSearchParams = class { constructor() { throw new Error('unsupported native URLSearchParams'); } };
  try {
    const transport = createNotificationHttpTransport({ baseUrl: 'https://example.test/api/v1/',
      getAccessToken: async () => 'test-token', fetchImpl: async url => {
        requests.push(url); return { ok: true, status: 200, json: async () => ({}) };
      } });
    await transport({ path: '/notifications', query: { cursor: '한글+/= &?#', limit: 20, omitted: null, missing: undefined } });
    await transport({ path: '/notifications/unread-count' });
    await transport({ path: '/notifications', query: { cursor: '', limit: 0 } });
    assert.equal(requests[0], 'https://example.test/api/v1/notifications?cursor=%ED%95%9C%EA%B8%80%2B%2F%3D%20%26%3F%23&limit=20');
    assert.equal(requests[1], 'https://example.test/api/v1/notifications/unread-count');
    assert.equal(requests[2], 'https://example.test/api/v1/notifications?cursor=&limit=0');
  } finally { globalThis.URLSearchParams = previous; }
});


test('서버 설정 오류는 세션 생성을 중단하지 않고 재시도 불가한 모델 오류로 전달한다', async () => {
  const { notificationErrorNotice } = await import('../src/notifications/notificationErrorNotice.js');
  for (const baseUrl of [undefined, '', 'not-a-url', 'http://', 'https://example.test/api?x=1']) {
    let fetched = false;
    const session = createServerNotificationSession({ baseUrl, fetchImpl: async () => { fetched = true; } });
    const store = createNotificationStore(session.api, session.invitations);
    try {
      await store.refresh();
      assert.equal(store.getSnapshot().list.status, 'error');
      const error = store.getSnapshot().list.error;
      assert.equal(error.code, 'API_NOT_CONFIGURED');
      assert.equal(notificationErrorNotice(error).canRetry, false);
      await store.remove('1');
      assert.equal(store.getSnapshot().mutation.canRetry, false);
      await store.retryMutation(); assert.equal(fetched, false);
    } finally { store.dispose(); }
  }
});

test('미연결 초대 gateway는 안내만 표시하고 직접 재시도하지 않는다', async () => {
  const { notificationErrorNotice } = await import('../src/notifications/notificationErrorNotice.js');
  const session = createServerNotificationSession({ baseUrl: 'https://example.test/api/v1' });
  let calls = 0;
  const store = createNotificationStore({ list: async () => ({ items: [], nextCursor: null }), count: async () => ({ unreadCount: 0 }) },
    { get: (...args) => { calls++; return session.invitations.get(...args); } });
  try {
    await store.open({ id: '1', notificationType: 'DIARY_INVITE', inviteId: 'invite', readAt: 'date' });
    const error = store.getSnapshot().invitation.error;
    assert.equal(error.code, 'INVITATION_NOT_CONNECTED');
    assert.equal(notificationErrorNotice(error, '초대').canRetry, false);
    await store.retryInvitation(); assert.equal(calls, 1);
  } finally { store.dispose(); }
});


test('운영 원격 HTTP는 토큰 조회 전에 거부하고 HTTPS·개발 loopback만 기본 허용한다', async () => {
  for (const baseUrl of ['http://remote.example/api/v1','http://127.0.0.1.example/api/v1','http://10.0.2.2.example/api']) {
    let calls = 0;
    const transport = createNotificationHttpTransport({ baseUrl, allowDevelopmentHttp: false, getAccessToken: async()=>{calls++;return 'token';},fetchImpl: async()=>{calls++;} });
    await assert.rejects(transport({path:'/notifications'}), e=>e.code==='API_NOT_CONFIGURED');assert.equal(calls,0);
  }
  for (const [baseUrl,allowDevelopmentHttp] of [['https://remote.example/api/v1',false],['http://127.0.0.1:18565/api/v1',false],['http://10.0.2.2:8080/api/v1',false],['http://192.168.0.3:8080/api/v1',true]]) {
    let calls=0;
    const transport=createNotificationHttpTransport({baseUrl,allowDevelopmentHttp,getAccessToken:async()=>'token',fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({})};}});
    await transport({path:'/notifications'});assert.equal(calls,1);
  }
});
