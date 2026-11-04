import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationApi, createInvitationGateway, toNotification } from '../src/notifications/notificationApi.js';
import { createMockNotificationTransport } from '../src/notifications/mockNotificationTransport.js';
import { createNotificationStore, startNotificationRefresh } from '../src/notifications/notificationStore.js';

test('목 어댑터도 PDF 개별 읽음 경로를 body 없이 사용한다', async () => {
  let request;
  await createNotificationApi(async value => { request = value; }).read('9007199254740993');
  assert.equal(request.method, 'PATCH');
  assert.equal(request.path, '/notifications/9007199254740993');
  assert.equal(request.body, undefined);
});

function setup(options = {}) {
  const mock = createMockNotificationTransport({ delay: 0, ...options });
  const api = createNotificationApi(mock.transport), gateway = createInvitationGateway(mock.transport);
  return { mock, api, gateway, store: createNotificationStore(api, gateway) };
}
test('상세를 연 뒤 취소되면 복귀 재조회가 목록과 상세를 함께 갱신한다', async () => {
  const { store, mock } = setup(); await store.refresh(); await store.open(store.getSnapshot().items[0]);
  mock.setInvitationStatus('A-invite-4', 'REVOKED'); await store.refresh();
  assert.equal(store.getSnapshot().items[0].status, 'REVOKED');
  assert.equal(store.getSnapshot().invitation.data.status, 'REVOKED');
});
test('이동 직전 만료·취소·권한 오류면 공유 화면 콜백을 호출하지 않는다', async () => {
  for (const mode of ['expired', 'revoked', 'forbidden', 'fail-once', 'cannot-open']) {
    const { store, mock } = setup(); await store.refresh(); await store.open(store.getSnapshot().items[0]);
    mock.setScenario('invitation', mode); let calls = 0;
    await store.proceedToInvitation(() => calls++); assert.equal(calls, 0, mode);
    assert.notEqual(store.getSnapshot().invitation.data?.status === 'PENDING' && store.getSnapshot().invitation.data?.canOpen === true && store.getSnapshot().invitation.status === 'success', true);
  }
});
test('이동 직전 재확인이 성공한 현재 상세만 전달하며 연타를 막는다', async () => {
  const { store } = setup({ delay: 5 }); await store.refresh(); await store.open(store.getSnapshot().items[0]);
  const results = []; const first = store.proceedToInvitation(value => results.push(value));
  await store.proceedToInvitation(value => results.push(value)); await first;
  assert.equal(results.length, 1); assert.equal(results[0].inviteId, 'A-invite-4');
  assert.equal(results[0].canOpen, true);
});

test('PENDING의 canOpen이 이동 직전 취소되면 차단하고 재확인 후 회복한다', async () => {
  const { store, mock } = setup(); await store.refresh(); const row = store.getSnapshot().items[0]; await store.open(row);
  assert.equal(store.getSnapshot().invitation.data.canOpen, true);
  mock.setInvitationCanOpen(row.inviteId, false); let calls = 0;
  await store.proceedToInvitation(() => calls++); assert.equal(calls, 0);
  assert.equal(store.getSnapshot().invitation.data.status, 'PENDING'); assert.equal(store.getSnapshot().invitation.data.canOpen, false);
  mock.setInvitationCanOpen(row.inviteId, true); await store.retryInvitation();
  await store.proceedToInvitation(() => calls++); assert.equal(calls, 1);
});

test('주입 상세 gateway도 PENDING+엄격한 true+같은 inviteId만 이동 허용한다', async () => {
  for (const detail of [
    { status: 'PENDING', canOpen: false }, { status: 'PENDING' }, { status: 'PENDING', canOpen: null },
    { status: 'PENDING', canOpen: 'true' }, { status: 'PENDING', canOpen: 1 },
    { status: 'ACCEPTED', canOpen: true }, { status: 'EXPIRED', canOpen: true },
    { status: 'PENDING', canOpen: true, inviteId: 'other' },
  ]) {
    const row = { id: '1', notificationType: 'DIARY_INVITE', inviteId: 'mine', readAt: 'already-read' };
    const store = createNotificationStore({ list: async () => ({ items: [row], nextCursor: null }), count: async () => ({ unreadCount: 0 }) },
      { get: async () => ({ inviteId: 'mine', ...detail }) });
    await store.refresh(); await store.open(row); let calls = 0;
    await store.proceedToInvitation(() => calls++); assert.equal(calls, 0, JSON.stringify(detail)); store.dispose();
  }
});

test('transport 상세 응답의 canOpen 누락·잘못된 타입은 INVALID_RESPONSE다', async () => {
  for (const canOpen of [undefined, null, 'true', 1]) {
    await assert.rejects(createInvitationGateway(async () => ({ inviteId: 'mine', status: 'PENDING', canOpen })).get('mine'), error => error.code === 'INVALID_RESPONSE');
  }
  assert.equal((await createInvitationGateway(async () => ({ inviteId: 'mine', status: 'PENDING', canOpen: false })).get('mine')).canOpen, false);
});
test('이동 재확인 도중 닫기·다른 초대 선택·계정 종료 시 늦은 이동을 막는다', async () => {
  for (const action of ['close', 'open', 'dispose']) {
    const { store } = setup({ delay: 5 }); await store.refresh(); await store.open(store.getSnapshot().items[0]);
    let calls = 0; const work = store.proceedToInvitation(() => calls++);
    if (action === 'close') store.closeInvitation();
    if (action === 'dispose') store.dispose();
    if (action === 'open') await store.open(store.getSnapshot().items[1]);
    await work; assert.equal(calls, 0, action);
  }
});
test('더 보기 후 재조회 로딩·실패 모두 전체 목록과 마지막 커서를 유지한다', async () => {
  const { store, mock } = setup({ delay: 5 }); await store.refresh(); await store.loadMore();
  const before = store.getSnapshot().items; mock.setScenario('list', 'fail-once');
  const work = store.refreshList(); assert.deepEqual(store.getSnapshot().items, before);
  await work; assert.deepEqual(store.getSnapshot().items, before); assert.equal(store.getSnapshot().nextCursor, null);
  await store.refreshList(); assert.equal(store.getSnapshot().items.length, 2); assert.equal(store.getSnapshot().nextCursor, '2');
});
test('빈 마지막 페이지의 null 커서를 반영하고 같은 페이지를 반복 요청하지 않는다', async () => {
  const { store, mock } = setup(); await store.refresh();
  await mock.transport({ method: 'DELETE', path: '/notifications/1' });
  await mock.transport({ method: 'DELETE', path: '/notifications/2' });
  await store.loadMore(); assert.equal(store.getSnapshot().nextCursor, null); assert.equal(store.getSnapshot().items.length, 2);
  const last = store.getSnapshot().more; await store.loadMore(); assert.equal(store.getSnapshot().more, last);
});
test('목록 열기는 읽음 처리하지 않고 유효한 미읽음만 빨간 점 개수에 포함', async () => {
  const { store } = setup(); await store.refresh();
  assert.equal(store.getSnapshot().items.length, 2);
  assert.deepEqual(store.getSnapshot().count.data, { unreadCount: 4, actionableUnreadCount: 2 });
});
test('더 보기로 전체 목록을 중복 없이 가져온다', async () => {
  const { store } = setup(); await store.refresh(); await store.loadMore();
  assert.equal(store.getSnapshot().items.length, 4); assert.equal(store.getSnapshot().nextCursor, null);
});
test('목록 실패·빈 목록·재시도는 구별된다', async () => {
  const { store, mock } = setup(); mock.setScenario('list', 'fail-once'); await store.refresh();
  assert.equal(store.getSnapshot().list.status, 'error');
  await store.refreshList(); assert.equal(store.getSnapshot().list.status, 'success');
  mock.setScenario('list', 'empty'); await store.refreshList(); assert.deepEqual(store.getSnapshot().items, []);
});
test('카운트 실패 시 이전 빨간 점 값을 유지한다', async () => {
  const { store, mock } = setup(); await store.refresh(); mock.setScenario('count', 'fail-once'); await store.refreshCount();
  assert.equal(store.getSnapshot().count.status, 'error'); assert.equal(store.getSnapshot().count.data.actionableUnreadCount, 2);
  await store.refreshCount(); assert.equal(store.getSnapshot().count.status, 'success');
});
test('읽음 실패와 독립적으로 초대 상세를 연다; 읽음 재시도 후 카운트 갱신', async () => {
  const { store, mock } = setup(); await store.refresh(); mock.setScenario('write', 'fail-once');
  await store.open(store.getSnapshot().items[0]);
  assert.equal(store.getSnapshot().invitation.status, 'success'); assert.equal(store.getSnapshot().mutation.canRetry, true);
  await store.retryMutation(); assert.equal(store.getSnapshot().count.data.actionableUnreadCount, 1);
  assert.equal(mock.inspect().invitations[3].status, 'PENDING');
});
test('알림 삭제는 원본 초대를 삭제/거절하지 않는다; 반복 요청 안전', async () => {
  const { store, mock } = setup(); await store.refresh(); mock.setScenario('write', 'response-lost');
  await store.remove('4'); assert.equal(store.getSnapshot().mutation.canRetry, true);
  await store.retryMutation(); assert.equal(store.getSnapshot().items.some(row => row.id === '4'), false);
  assert.equal(mock.inspect().invitations.length, 4); assert.equal(mock.inspect().invitations[3].status, 'PENDING');
});
test('전체 읽음 응답 유실 후 재시도는 새 도착 알림을 읽지 않는다', async () => {
  const { store, mock } = setup(); await store.refresh(); mock.setScenario('write', 'response-lost');
  assert.equal(store.getSnapshot().canReadAll, true);
  await store.readAll(); assert.equal(store.getSnapshot().mutation.canRetry, true);
  const id = mock.add(); await store.retryMutation();
  assert.equal(store.getSnapshot().mutation.status, 'success');
  assert.equal(mock.inspect().rows.find(row => row.notificationId === id).readAt, null);
  assert.equal(store.getSnapshot().count.data.unreadCount, 1);
});
test('저장 성공 후 목록 조회 실패는 저장 재시도를 유도하지 않는다', async () => {
  const { store, mock } = setup(); await store.refresh(); mock.setScenario('list', 'fail-once'); await store.remove('4');
  assert.equal(store.getSnapshot().mutation.status, 'success'); assert.equal(store.getSnapshot().list.status, 'error');
  await store.refreshList(); assert.equal(store.getSnapshot().items.some(row => row.id === '4'), false);
});
test('권한 오류는 자동 재시도하지 않는다', async () => {
  const { store, mock } = setup(); await store.refresh(); mock.setScenario('write', 'forbidden'); await store.remove('4');
  assert.equal(store.getSnapshot().mutation.canRetry, false); assert.equal(store.getSnapshot().mutation.error.status, 403);
});
test('목록 snapshot 이후 취소된 초대는 현재 상태로 조회한다', async () => {
  const { store, mock } = setup(); await store.refresh(); const row = store.getSnapshot().items[0];
  mock.setInvitationStatus(row.inviteId, 'REVOKED'); await store.open(row);
  assert.equal(store.getSnapshot().invitation.data.status, 'REVOKED');
});
test('초대 상세 실패 재시도와 닫기 이후 늦은 응답 격리', async () => {
  const { store, mock } = setup({ delay: 10 }); await store.refresh(); mock.setScenario('invitation', 'fail-once');
  await store.open(store.getSnapshot().items[0]); assert.equal(store.getSnapshot().invitation.status, 'error');
  const work = store.retryInvitation(); store.closeInvitation(); await work;
  assert.equal(store.getSnapshot().invitation.status, 'idle');
});
test('중복 쓰기와 미확정 요청 중 다른 쓰기를 막는다', async () => {
  const { store, mock } = setup({ delay: 10 }); await store.refresh(); mock.setScenario('write', 'fail-once');
  const first = store.remove('4'); await store.remove('3'); await first; await store.remove('2');
  assert.equal(mock.inspect().rows.some(row => row.deletedAt), false);
  await store.retryMutation(); assert.equal(mock.inspect().rows.filter(row => row.deletedAt).length, 1);
});
test('계정 전환 dispose 후 지연 응답이 이전 상태를 복구하지 않는다', async () => {
  const { store } = setup({ delay: 15 }); const work = store.refresh(); store.dispose(); await work;
  assert.deepEqual(store.getSnapshot().items, []); assert.equal(store.getSnapshot().count.data, null);
  const b = setup({ account: 'B' }); await b.store.refresh(); assert.ok(b.store.getSnapshot().items.every(row => row.title.startsWith('B')));
});
test('StrictMode 재활성화 후 정상 조회', async () => {
  const { store } = setup(); store.dispose(); store.activate(); await store.refresh(); assert.equal(store.getSnapshot().list.status, 'success');
});
test('더 보기 중 새로고침해도 오래된 페이지가 섞이지 않는다', async () => {
  const { store } = setup({ delay: 10 }); await store.refresh(); const more = store.loadMore(); await store.refresh(); await more;
  assert.equal(store.getSnapshot().items.length, 2);
});
test('포그라운드 즉시 갱신, 활성 중 주기 조회, 백그라운드·해제 타이머 정리', () => {
  let active = true, listener, tick, clears = 0, refreshes = 0, counts = 0, unsubscribed = false;
  const stop = startNotificationRefresh({ refresh: () => refreshes++, refreshCount: () => counts++ }, {
    isActive: () => active, subscribe: fn => { listener = fn; return () => { unsubscribed = true; }; },
    setIntervalFn: (fn, ms) => { tick = fn; assert.equal(ms, 30000); return 1; }, clearIntervalFn: () => clears++,
  });
  assert.equal(refreshes, 1); tick(); assert.equal(counts, 1);
  active = false; listener(); assert.equal(clears, 1);
  active = true; listener(); assert.equal(refreshes, 2); stop(); assert.equal(clears, 2); assert.equal(unsubscribed, true);
});
test('알 수 없는 상태는 actionable하지 않고 잘못된 DTO/카운트/상세 ID는 거부', async () => {
  const row = { notificationId: '1', type: 'DIARY_INVITED', invitation: { inviteId: 'i', status: 'FUTURE' }, action: { enabled: true } };
  assert.equal(toNotification(row).actionable, false);
  assert.throws(() => toNotification({}));
  await assert.rejects(createNotificationApi(async () => ({ unreadCount: 1, actionableUnreadCount: 2 })).count());
  await assert.rejects(createInvitationGateway(async () => ({ inviteId: 'other', status: 'PENDING' })).get('mine'));
});

test('초대 이동의 비동기 실패를 호출자에게 전달하고 이후 재확인이 가능하다', async () => {
  const { store } = setup();
  try {
    await store.refresh(); await store.open(store.getSnapshot().items[0]);
    await assert.rejects(store.proceedToInvitation(async () => { await Promise.resolve(); throw new Error('navigation failed'); }), /navigation failed/);
    let moved = 0;
    await store.proceedToInvitation(async () => { moved++; });
    assert.equal(moved, 1);
  } finally { store.dispose(); }
});
