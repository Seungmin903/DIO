import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationStore } from '../src/notifications/notificationStore.js';
import { createServerNotificationApi } from '../src/notifications/serverNotificationApi.js';

const row = id => ({ id, notificationType: 'MOCK_NOTICE', readAt: null });
const page = (ids, nextCursor = null) => ({ items: ids.map(row), nextCursor, hasNext: nextCursor !== null });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function controlled(t, counts = false) {
  const requests = { list: [], count: [], read: [], remove: [] };
  const enqueue = (kind, args) => { const request = { ...deferred(), args }; requests[kind].push(request); return request.promise; };
  // 취소 신호를 의도적으로 무시해 늦게 도착하는 응답의 세대 검증까지 확인한다.
  const api = { list: options => enqueue('list', options), count: options => counts ? enqueue('count', options) : Promise.resolve({ unreadCount: 0 }),
    read: (id, options) => enqueue('read', { id, ...options }), remove: (id, options) => enqueue('remove', { id, ...options }) };
  const store = createNotificationStore(api, { get() { throw new Error('일반 알림은 초대 상세를 조회하지 않는다.'); } });
  t.after(() => store.dispose()); return { store, requests };
}

test('역순 새로고침의 오래된 성공/오류·카운트는 최신 snapshot을 덮어쓰지 않는다', async t => {
  for (const oldFails of [false, true]) {
    const { store, requests } = controlled(t, true);
    const old = store.refresh(), latest = store.refresh();
    assert.equal(requests.list[0].args.signal.aborted, true); assert.equal(requests.count[0].args.signal.aborted, true);
    requests.list[1].resolve(page(['new'], 'new-cursor')); requests.count[1].resolve({ unreadCount: 2 }); await latest;
    if (oldFails) { requests.list[0].reject(new Error('late failure')); requests.count[0].reject(new Error('late failure')); }
    else { requests.list[0].resolve(page(['old'], 'old-cursor')); requests.count[0].resolve({ unreadCount: 99 }); }
    await old;
    assert.deepEqual(store.getSnapshot().items.map(value => value.id), ['new']); assert.equal(store.getSnapshot().nextCursor, 'new-cursor');
    assert.equal(store.getSnapshot().count.data.unreadCount, 2); assert.equal(store.getSnapshot().list.status, 'success');
  }
});

test('취소를 무시한 더 보기 응답은 이후 새로고침 성공/실패 모두에서 무효다', async t => {
  for (const refreshFails of [false, true]) {
    const { store, requests } = controlled(t);
    const initial = store.refreshList(); requests.list[0].resolve(page(['3', '2'], 'cursor-2')); await initial;
    const more = store.loadMore(), refresh = store.refreshList();
    assert.equal(requests.list[1].args.signal.aborted, true);
    if (refreshFails) requests.list[2].reject(Object.assign(new Error('offline'), { status: 503 }));
    else requests.list[2].resolve(page(['4', '3'], 'cursor-3'));
    await refresh; requests.list[1].resolve(page(['1'])); await more;
    assert.deepEqual(store.getSnapshot().items.map(value => value.id), refreshFails ? ['3', '2'] : ['4', '3']);
    assert.equal(store.getSnapshot().nextCursor, refreshFails ? 'cursor-2' : 'cursor-3');
  }
});

test('더 보기 연타는 한 요청이며 겹치는 항목은 한 번만 표시하고 빈 끝 페이지에서 멈춘다', async t => {
  const { store, requests } = controlled(t);
  const initial = store.refreshList(); requests.list[0].resolve(page(['3', '2'], 'opaque-2')); await initial;
  const first = store.loadMore(); await store.loadMore(); await store.loadMore(); assert.equal(requests.list.length, 2);
  requests.list[1].resolve(page(['2', '1'], 'opaque-1')); await first;
  assert.deepEqual(store.getSnapshot().items.map(value => value.id), ['3', '2', '1']);
  const last = store.loadMore(); requests.list[2].resolve(page([])); await last;
  assert.equal(store.getSnapshot().nextCursor, null); await store.loadMore(); assert.equal(requests.list.length, 3);
});

test('읽음/삭제와 복귀 조회가 겹쳐도 늦은 미읽음·삭제 전 응답이 상태를 되돌리지 않는다', async t => {
  for (const kind of ['read', 'remove']) {
    const { store, requests } = controlled(t, true);
    const initial = store.refresh(); requests.list[0].resolve(page(['1'])); requests.count[0].resolve({ unreadCount: 1 }); await initial;
    const mutation = kind === 'read' ? store.open(store.getSnapshot().items[0]) : store.remove('1');
    const foreground = store.refresh(); // 아직 쓰기 반영 전 결과를 가진 조회
    requests[kind][0].resolve({ notificationId: '1', readAt: '2026-10-27T00:00:00Z' }); await flush();
    assert.equal(requests.list.length, 3); assert.equal(requests.count.length, 3);
    const current = kind === 'read' ? { ...page(['1']), items: [{ ...row('1'), readAt: '2026-10-27T00:00:00Z' }] } : page([]);
    requests.list[2].resolve(current); requests.count[2].resolve({ unreadCount: 0 }); await mutation;
    requests.list[1].resolve(page(['1'])); requests.count[1].resolve({ unreadCount: 1 }); await foreground;
    assert.equal(store.getSnapshot().count.data.unreadCount, 0); assert.equal(store.getSnapshot().mutation.status, 'success');
    if (kind === 'read') assert.ok(store.getSnapshot().items[0].readAt); else assert.deepEqual(store.getSnapshot().items, []);
  }
});

test('마지막 항목 삭제 후 빈 목록이 확정되면 취소된 더 보기의 항목·커서가 살아나지 않는다', async t => {
  const { store, requests } = controlled(t);
  const initial = store.refreshList(); requests.list[0].resolve(page(['1'], 'old-boundary')); await initial;
  const more = store.loadMore(), deletion = store.remove('1'); requests.remove[0].resolve(null); await flush();
  requests.list[2].resolve(page([])); await deletion;
  requests.list[1].resolve(page(['ghost'], 'ghost-cursor')); await more;
  assert.deepEqual(store.getSnapshot().items, []); assert.equal(store.getSnapshot().nextCursor, null);
  await store.loadMore(); assert.equal(requests.list.length, 3);
});

test('불투명 키셋 커서의 연속 조회는 새 도착·경계 삭제 후에도 기존 범위를 중복/누락 없이 이어간다', async t => {
  let ids = ['6', '5', '4', '3', '2', '1']; const cursors = [];
  const api = createServerNotificationApi(async ({ query }) => {
    const cursor = query?.cursor; cursors.push(cursor);
    const boundary = cursor ? cursor.slice('opaque:'.length) : null;
    const remaining = ids.filter(id => !boundary || Number(id) < Number(boundary)); const current = remaining.slice(0, 2);
    return { items: current.map(id => ({ notification: { notificationId: id, notificationType: 'FUTURE_TYPE', createdAt: '2026-10-27T00:00:00Z', readAt: null }, invitation: null })),
      hasNext: remaining.length > 2, nextCursor: remaining.length > 2 ? `opaque:${current.at(-1)}` : null };
  });
  const store = createNotificationStore(api, {}); t.after(() => store.dispose()); await store.refreshList();
  ids = ['7', ...ids.filter(id => id !== '5')]; await store.loadMore(); await store.loadMore();
  assert.deepEqual(store.getSnapshot().items.map(value => value.id), ['6', '5', '4', '3', '2', '1']);
  assert.deepEqual(cursors, [undefined, 'opaque:5', 'opaque:3']); assert.equal(store.getSnapshot().nextCursor, null);
  await store.refreshList(); assert.deepEqual(store.getSnapshot().items.map(value => value.id), ['7', '6']);
});
