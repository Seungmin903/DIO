import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSharingInvitations, MAX_INVITATION_DESCRIPTION_PAGES } from '../src/notifications/describeSharingInvitations.js';

test('공유 수신 목록을 페이지별로 찾아 표시 정보만 홈 알림에 전달한다', async () => {
  const calls = [];
  const api = { list: async ({ cursor }) => {
    calls.push(cursor);
    return cursor ? { items: [{ inviteId: '2', title: '함께 쓴 기록', actor: '하루', diary: { title: '함께 쓴 기록' }, id: 'invite-row', readAt: 'old', status: 'ACCEPTED' }], nextCursor: 'unused' }
      : { items: [{ inviteId: '1', title: '다른 기록' }], nextCursor: 'next' };
  } };
  const values = await describeSharingInvitations(api, ['2']);
  assert.deepEqual(calls, [undefined, 'next']);
  assert.deepEqual(values.get('2'), { title: '함께 쓴 기록', actor: '하루', diary: { title: '함께 쓴 기록' } });
});

test('취소된 조회는 전송하지 않고 반복 커서는 중단한다', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const api = { list: async () => { calls++; return { items: [], nextCursor: 'same' }; } };
  await assert.rejects(describeSharingInvitations(api, ['missing'], { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
  assert.equal((await describeSharingInvitations(api, ['missing'])).size, 0);
  assert.equal(calls, 2);
});

test('서로 다른 커서가 계속 와도 3페이지에서 멈추고 이미 찾은 정보는 유지한다', async () => {
  let calls = 0;
  const api = { list: async () => ({ items: ++calls === 1 ? [{ inviteId: 'found', title: '찾은 기록', actor: '하루' }] : [], nextCursor: String(calls) }) };
  const values = await describeSharingInvitations(api, ['found', 'missing']);
  assert.equal(calls, MAX_INVITATION_DESCRIPTION_PAGES);
  assert.equal(values.get('found').title, '찾은 기록');
  assert.equal(values.has('missing'), false);
});
