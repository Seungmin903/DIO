import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServerNotificationSession, toServerNotification } from '../src/notifications/serverNotificationApi.js';
import { createNotificationStore } from '../src/notifications/notificationStore.js';

test('실제 HTTP 기본 알림은 전체 읽음 호출 없이 목록·카운트·개별 읽음·삭제를 제공한다', async t => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ url: req.url, method: req.method, token: req.headers.authorization, body: raw && JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/api/v1/notifications?')) return res.end(JSON.stringify({ items: [{ notification: {
      notificationId: '9007199254740993', notificationType: 'DIARY_INVITED', createdAt: '2026-10-27T00:00:00Z', readAt: null,
    }, invitation: null }], hasNext: false, nextCursor: null }));
    if (req.url.endsWith('/unread-count')) return res.end(JSON.stringify({ unreadCount: 2 }));
    if (req.method === 'PATCH') return res.end('{}');
    res.statusCode = 204; res.end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(process.env.DIO_NOTIFICATION_TEST_PORT || 18149), '127.0.0.1', resolve); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  let token = 'first';
  const session = createServerNotificationSession({ baseUrl: `http://127.0.0.1:${server.address().port}/api/v1/`, getAccessToken: async () => token });
  const store = createNotificationStore(session.api, session.invitations); t.after(() => store.dispose());
  await store.refresh();
  assert.equal(store.getSnapshot().list.status, 'success', store.getSnapshot().list.error?.stack);
  assert.equal(store.getSnapshot().items[0].id, '9007199254740993');
  assert.deepEqual(store.getSnapshot().count.data, { unreadCount: 2 });
  assert.equal(session.api.prepareReadAll, undefined);
  assert.equal(session.api.readAll, undefined);
  assert.equal(store.getSnapshot().canReadAll, false);
  const before = requests.length;
  await store.readAll(); await store.retryMutation();
  assert.equal(requests.length, before);
  assert.equal(store.getSnapshot().mutation.status, 'idle');
  token = 'refreshed';
  await store.open(store.getSnapshot().items[0]);
  await store.remove('9007199254740993');
  assert.ok(requests.some(row => row.method === 'PATCH' && row.url.endsWith('/9007199254740993') && !row.body));
  assert.equal(requests.find(row => row.method === 'PATCH').token, 'Bearer refreshed');
  assert.ok(requests.every(row => !/read-watermarks|read-all/.test(row.url)));
  assert.ok(requests.some(row => row.method === 'DELETE' && row.url.endsWith('/9007199254740993')));
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
