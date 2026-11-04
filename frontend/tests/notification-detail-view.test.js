import test from 'node:test';
import assert from 'node:assert/strict';
import { showNotificationDetail } from '../src/notifications/notificationDetailView.js';

test('응답 대기 초대의 최초·재확인 조회와 이동 직전에는 홈 상세를 표시하지 않는다', () => {
  for (const invitation of [{ status: 'idle' }, { status: 'loading' }, { status: 'success', data: { status: 'PENDING', canOpen: true } }, { status: 'loading', data: { status: 'PENDING', canOpen: true } }]) {
    assert.equal(showNotificationDetail(invitation, true), false);
  }
});
test('끝난 초대·권한 거절·오류는 홈 상세에 남기고 직접 상세 소비자는 로딩을 표시한다', () => {
  for (const status of ['ACCEPTED', 'EXPIRED', 'REVOKED']) assert.equal(showNotificationDetail({ status: 'success', data: { status, canOpen: false } }, true), true);
  assert.equal(showNotificationDetail({ status: 'success', data: { status: 'PENDING', canOpen: false } }, true), true);
  assert.equal(showNotificationDetail({ status: 'error' }, true), true);
  assert.equal(showNotificationDetail({ status: 'loading' }, false), true);
});
