import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServerNotificationSession } from '../src/notifications/serverNotificationApi.js';
import { createNotificationStore, startNotificationRefresh } from '../src/notifications/notificationStore.js';
import { createNotificationActivity } from '../src/notifications/notificationActivity.js';

async function fixture(t) {
  let serial = 0;
  const state = { rows: [], requests: [], lose: null, listError: false, countError: false, malformed: false, held: null, hold: false };
  state.add = () => { const row = { notificationId: String(++serial), notificationType: 'DIARY_INVITED', createdAt: '2026-10-27T00:00:00Z', readAt: null }; state.rows.unshift(row); return row; };
  state.add(); state.add(); state.add();
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, 'http://localhost'), body = raw ? JSON.parse(raw) : null;
    state.requests.push({ path: url.pathname, query: url.search, method: req.method, body });
    const send = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' }); res.end(status === 204 ? undefined : JSON.stringify(value)); };
    const loseOrSend = kind => { if (state.lose === kind) { state.lose = null; req.socket.destroy(); } else send(null, 204); };
    if (url.pathname.endsWith('/read-watermarks')) { state.snapshot = state.rows.filter(row => !row.deleted && !row.readAt).map(row => row.notificationId); return send({ readWatermark: 'snapshot', expiresAt: '2030-01-01T00:00:00Z' }, 201); }
    if (url.pathname.endsWith('/read-all')) { assert.equal(body.readWatermark, 'snapshot'); state.rows.filter(row => state.snapshot.includes(row.notificationId)).forEach(row => { row.readAt ||= '2026-10-27T00:01:00Z'; }); return loseOrSend('readAll'); }
    if (url.pathname.endsWith('/unread-count')) return send({ unreadCount: state.rows.filter(row => !row.readAt && !row.deleted).length }, state.countError ? 503 : 200);
    if (url.pathname === '/api/v1/notifications') {
      const rows = state.rows.filter(row => !row.deleted), start = Number(url.searchParams.get('cursor') || 0);
      const response = { items: rows.slice(start, start + 2).map(notification => ({ notification: { ...notification }, invitation: null })), hasNext: start + 2 < rows.length, nextCursor: start + 2 < rows.length ? String(start + 2) : null };
      const reply = () => state.malformed ? send({ items: 'invalid' }) : send(response, state.listError ? 503 : 200);
      if (state.hold) { state.held = reply; return; } return reply();
    }
    // 정확한 PDF 경로만 허용한다. /{id}/read가 되돌아오면 회귀 실패다.
    const match = /^\/api\/v1\/notifications\/(\d+)$/.exec(url.pathname);
    const row = state.rows.find(row => row.notificationId === match?.[1]);
    if (!row) return send({}, 404);
    if (req.method === 'DELETE') { row.deleted = true; return loseOrSend('delete'); }
    row.readAt ||= '2026-10-27T00:01:00Z'; return send(row);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(process.env.DIO_NOTIFICATION_INTEGRATION_PORT || 0), '127.0.0.1', resolve); });
  const session = createServerNotificationSession({ baseUrl: `http://127.0.0.1:${server.address().port}/api/v1`, getAccessToken: async () => 'fixture-token' });
  const store = createNotificationStore(session.api, session.invitations);
  t.after(async () => { store.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { state, store, session };
}
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('통합 검증 대기 시간 초과'); await new Promise(resolve => setTimeout(resolve, 5)); }
}

test('서버 전체 읽음 응답 유실 후 재시도는 새 도착 알림을 보존한다', async t => {
  const { state, store } = await fixture(t); await store.refresh();
  assert.equal(store.getSnapshot().canReadAll, true);
  state.lose = 'readAll'; await store.readAll(); state.add(); await store.retryMutation();
  assert.equal(store.getSnapshot().mutation.status, 'success');
  await store.refresh();
  assert.equal(store.getSnapshot().count.data.unreadCount, 1);
  assert.equal(state.requests.filter(row => row.path.endsWith('/read-watermarks')).length, 1);
  assert.equal(state.requests.filter(row => row.path.endsWith('/read-all')).length, 2);
});

test('251: HTTP 페이지 조회 후 오류·잘못된 DTO에서 이전 목록과 카운트 보존·복구', async t => {
  const { state, store } = await fixture(t); await store.refresh(); await store.loadMore();
  assert.equal(store.getSnapshot().items.length, 3); assert.equal(store.getSnapshot().nextCursor, null);
  state.listError = state.countError = true; await store.refresh();
  assert.equal(store.getSnapshot().items.length, 3); assert.equal(store.getSnapshot().count.data.unreadCount, 3);
  assert.equal(store.getSnapshot().list.status, 'error'); assert.equal(store.getSnapshot().count.status, 'error');
  state.listError = state.countError = false; state.malformed = true; await store.refreshList();
  assert.equal(store.getSnapshot().list.error.code, 'INVALID_RESPONSE'); assert.equal(store.getSnapshot().items.length, 3);
  state.malformed = false; await store.refresh(); assert.equal(store.getSnapshot().list.status, 'success');
  assert.equal(store.getSnapshot().items.length, 2); await store.loadMore(); assert.equal(store.getSnapshot().items.length, 3);
});

test('251: HTTP 읽음·삭제 유실 재시도 결과가 공통 구독자에 동일 반영', async t => {
  const { state, store } = await fixture(t); const a = [], b = [];
  const offA = store.subscribe(() => a.push(store.getSnapshot())), offB = store.subscribe(() => b.push(store.getSnapshot()));
  t.after(() => { offA(); offB(); }); await store.refresh(); const row = store.getSnapshot().items[0];
  await store.open(row); assert.equal(store.getSnapshot().count.data.unreadCount, 2);
  const read = state.requests.find(req => req.method === 'PATCH');
  assert.equal(read.path, `/api/v1/notifications/${row.id}`); assert.equal(read.body, null);
  state.lose = 'delete'; await store.remove(row.id); assert.equal(store.getSnapshot().mutation.canRetry, true);
  await store.retryMutation(); assert.equal(store.getSnapshot().mutation.status, 'success');
  assert.ok(!store.getSnapshot().items.some(item => item.id === row.id)); assert.equal(a.at(-1), b.at(-1));
  assert.equal(state.requests.filter(req => req.method === 'DELETE').length, 2);
});

test('251: native 복귀→HTTP 재조회, 비활성 polling 차단, 새 알림 카운트 반영', async t => {
  const { state, store } = await fixture(t); let listener, tick;
  const activity = createNotificationActivity({ appState: { currentState: 'background', addEventListener: (_, fn) => { listener = fn; return { remove() {} }; } } });
  const stop = startNotificationRefresh(store, { ...activity, setIntervalFn: fn => { tick = fn; return 1; }, clearIntervalFn() {} }); t.after(stop);
  assert.equal(state.requests.length, 0); listener('active'); await until(() => store.getSnapshot().count.status === 'success');
  state.add(); listener('background'); const before = state.requests.length; tick(); assert.equal(state.requests.length, before);
  listener('active'); await until(() => store.getSnapshot().count.data?.unreadCount === 4);
  assert.equal(store.getSnapshot().items[0].id, '4'); stop(); const after = state.requests.length; tick(); assert.equal(state.requests.length, after);
});

test('251: 세션 종료 중 HTTP 지연 응답은 새 세션에 섞이지 않는다', async t => {
  const { state, store, session } = await fixture(t); state.hold = true;
  const work = store.refresh(); await until(() => state.held); store.dispose(); state.hold = false; state.held(); await work;
  assert.deepEqual(store.getSnapshot().items, []); assert.equal(store.getSnapshot().count.data, null);
  const next = createNotificationStore(session.api, session.invitations); t.after(() => next.dispose()); await next.refresh();
  assert.equal(next.getSnapshot().items.length, 2); assert.deepEqual(store.getSnapshot().items, []);
});
