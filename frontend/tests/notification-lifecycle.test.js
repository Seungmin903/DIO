import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationActivity } from '../src/notifications/notificationActivity.js';
import { startNotificationRefresh, createNotificationStore } from '../src/notifications/notificationStore.js';
import { notificationCountLabel } from '../src/notifications/notificationCount.js';

test('native 알 수 없는 초기 상태에서는 대기, active 복귀만 갱신하고 중복 이벤트를 무시한다', () => {
  let listener, removed = false, tick, refreshes = 0, counts = 0, clears = 0;
  const activity = createNotificationActivity({ appState: { currentState: null, addEventListener: (_, fn) => { listener = fn; return { remove() { removed = true; } }; } } });
  const stop = startNotificationRefresh({ refresh: () => refreshes++, refreshCount: () => counts++ }, {
    ...activity, setIntervalFn: fn => { tick = fn; return 1; }, clearIntervalFn: () => clears++,
  });
  assert.equal(refreshes, 0); listener('active'); listener('active'); assert.equal(refreshes, 1);
  tick(); assert.equal(counts, 1); listener('inactive'); tick(); assert.equal(counts, 1);
  listener('background'); listener('active'); assert.equal(refreshes, 2);
  stop(); tick(); listener('active'); assert.equal(counts, 1); assert.equal(refreshes, 2); assert.equal(removed, true); assert.equal(clears, 2);
});

test('web 숨김 동안 polling 중단, 복귀 조회와 리스너 해제', () => {
  let listener, removed, refreshes = 0;
  const doc = { visibilityState: 'hidden', addEventListener: (_, fn) => { listener = fn; }, removeEventListener: (_, fn) => { removed = fn; } };
  const activity = createNotificationActivity({ appState: {}, document: doc });
  const stop = startNotificationRefresh({ refresh: () => refreshes++, refreshCount() {} }, { ...activity, setIntervalFn: () => 1, clearIntervalFn() {} });
  assert.equal(refreshes, 0); doc.visibilityState = 'visible'; listener(); listener(); assert.equal(refreshes, 1);
  stop(); assert.equal(removed, listener);
});

test('두 구독자는 같은 카운트·오류 보존을 보고 dispose 후 늦은 응답을 받지 않는다', async () => {
  let calls = 0, resolve, fail = false;
  const store = createNotificationStore({ list: async () => ({ items: [], nextCursor: null }), count: async () => {
    calls++; if (fail) throw new Error('offline'); if (calls === 1) return { unreadCount: 3 };
    return new Promise(done => { resolve = done; });
  } }, {});
  const a = [], b = []; const offA = store.subscribe(() => a.push(store.getSnapshot().count)); const offB = store.subscribe(() => b.push(store.getSnapshot().count));
  await store.refresh(); assert.equal(a.at(-1), b.at(-1)); assert.equal(a.at(-1).data.unreadCount, 3);
  fail = true; await store.refreshCount(); assert.equal(a.at(-1).status, 'error'); assert.equal(a.at(-1).data.unreadCount, 3);
  fail = false; const work = store.refreshCount(); await store.refreshCount(); assert.equal(calls, 3);
  store.dispose(); resolve({ unreadCount: 99 }); await work; assert.equal(store.getSnapshot().count.data, null);
  offA(); offB();
});

test('전체 미읽음 수는 새 초대·빨간 점으로 가장하지 않는다', () => {
  assert.deepEqual(notificationCountLabel({ unreadCount: 4 }), { value: 4, label: '안 읽은 알림', showDot: false });
  assert.equal(notificationCountLabel({ actionableUnreadCount: 2 }).showDot, true);
  assert.equal(notificationCountLabel(null).value, null);
});
