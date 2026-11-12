import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationErrorNotice } from '../src/notifications/notificationErrorNotice.js';
import { SESSION_EXPIRED_MESSAGE, AUTHENTICATION_FAILED_MESSAGE } from '../src/auth/sessionExpiry.js';
import { createMockNotificationTransport } from '../src/notifications/mockNotificationTransport.js';
import { createNotificationApi, createInvitationGateway } from '../src/notifications/notificationApi.js';
import { createNotificationStore } from '../src/notifications/notificationStore.js';

test('401은 확인된 만료만 재로그인 안내,403·404는 권한/목록 안내,5xx·네트워크는 수동 재시도', () => {
  for (const status of [401, 403, 404]) assert.equal(notificationErrorNotice({ status }).canRetry, false);
  assert.equal(notificationErrorNotice({ status: 401 }).message, AUTHENTICATION_FAILED_MESSAGE);
  assert.equal(notificationErrorNotice({ status: 401, code: 'INVALID_TOKEN' }).message, AUTHENTICATION_FAILED_MESSAGE);
  assert.equal(notificationErrorNotice({ status: 401, sessionExpired: true }).message, SESSION_EXPIRED_MESSAGE);
  assert.match(notificationErrorNotice({ status: 403 }).message, /권한/);
  assert.equal(notificationErrorNotice({ status: 404 }).refreshList, true);
  for (const status of [500, 502, 503]) { const notice = notificationErrorNotice({ status, message: 'internal secret' }); assert.equal(notice.canRetry, true); assert.match(notice.message, /서버 오류/); assert.ok(!notice.message.includes('secret')); }
  assert.match(notificationErrorNotice({ code: 'NETWORK_ERROR' }).message, /네트워크/);
});

test('전체 읽음 경계 오류는 새 요청 또는 대기 방법을 안내한다', () => {
  const invalid = notificationErrorNotice({ status: 400, code: 'INVALID_READ_WATERMARK' });
  assert.match(invalid.message, /다시 눌러/);
  assert.equal(invalid.canRetry, false);
  const limit = notificationErrorNotice({ status: 429, code: 'READ_WATERMARK_LIMIT' });
  assert.match(limit.message, /잠시 후 다시 시도/);
});

test('카운트401·403·404 뒤 주기 재요청은 막고 명시적 전체 새로고침으로 회복한다', async () => {
  for (const mode of ['unauthorized', 'forbidden', 'not-found']) {
    const mock = createMockNotificationTransport({ delay: 0 }); const api = createNotificationApi(mock.transport);
    let calls = 0; const original = api.count; api.count = options => { calls++; return original(options); };
    const store = createNotificationStore(api, createInvitationGateway(mock.getInvitation)); await store.refresh();
    mock.setScenario('count', mode); await store.refreshCount(); const previous = calls;
    assert.equal(store.getSnapshot().count.data.unreadCount, 4); await store.refreshCount(); assert.equal(calls, previous);
    mock.setScenario('count', 'success'); await store.refresh(); assert.equal(store.getSnapshot().count.status, 'success'); store.dispose();
  }
});

test('쓰는 중401·403·404는 같은 명령 재시도 없음,503·네트워크는 동일 명령만 재시도', async () => {
  for (const mode of ['unauthorized', 'forbidden', 'not-found', 'fail-once', 'network-error']) {
    const mock = createMockNotificationTransport({ delay: 0 }), api = createNotificationApi(mock.transport);
    const ids = []; const original = api.remove; api.remove = (id, options) => { ids.push(id); return original(id, options); };
    const store = createNotificationStore(api, createInvitationGateway(mock.getInvitation)); await store.refresh();
    mock.setScenario('write', mode); await store.remove('4');
    const retry = ['fail-once', 'network-error'].includes(mode); assert.equal(store.getSnapshot().mutation.canRetry, retry);
    assert.ok(store.getSnapshot().items.some(row => row.id === '4')); mock.setScenario('write', 'success'); await store.retryMutation();
    assert.deepEqual(ids, retry ? ['4', '4'] : ['4']); store.dispose();
  }
});

test('초대403·404의 직접 재시도는 차단, 목록 확인과 새 조회 후에만 이동 가능', async () => {
  for (const mode of ['forbidden', 'not-found']) {
    const mock = createMockNotificationTransport({ delay: 0 }); const gateway = createInvitationGateway(mock.getInvitation); let calls = 0;
    const store = createNotificationStore(createNotificationApi(mock.transport), { get: (...args) => { calls++; return gateway.get(...args); } });
    await store.refresh(); mock.setScenario('invitation', mode); await store.open(store.getSnapshot().items[0]); const before = calls;
    await store.retryInvitation(); let moves = 0; await store.proceedToInvitation(() => moves++); assert.equal(calls, before); assert.equal(moves, 0);
    await store.refreshNotifications(); assert.equal(calls, before); // 목록/카운트 확인이 실패한 초대를 재호출하지 않는다.
    mock.setScenario('invitation', 'success'); await store.refresh(); await store.proceedToInvitation(() => moves++); assert.equal(moves, 1); store.dispose();
  }
});
