import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharingPreview, inviteEmailError } from '../src/sharing/sharingPreview.js';

test('이메일 형식·정규화·중복 대기 초대·취소 후 재초대를 확인하고 원본을 보존한다', async () => {
  const runtime = createSharingPreview({ delay: 0 });
  const source = { id: 'local', title: '나의 기록' };
  runtime.registerDiary(source);
  for (const email of ['', 'abc', 'a b@example.com', 'a@@example.com']) {
    assert.ok(inviteEmailError(email));
    await assert.rejects(runtime.sendEmailInvite('local', email), { code: 'INVALID_EMAIL' });
  }
  let diary = await runtime.sendEmailInvite('local', ' Friend@Example.com ');
  const id = diary.emailInvites[0].id;
  assert.equal(diary.emailInvites[0].email, 'friend@example.com');
  diary = await runtime.sendEmailInvite('local', 'friend@example.com');
  assert.equal(diary.emailInvites.length, 1);
  assert.equal(diary.members.length, 1);
  diary = await runtime.cancelEmailInvite('local', id);
  assert.equal(diary.emailInvites[0].status, 'CANCELLED');
  diary = await runtime.sendEmailInvite('local', 'friend@example.com');
  assert.equal(diary.emailInvites.length, 2);
  assert.equal(diary.emailInvites[0].status, 'PENDING');
  assert.deepEqual(source, { id: 'local', title: '나의 기록' });
  runtime.dispose();
});

test('링크는 1시간 유효하고 재생성 제한은 다이어리별 5분 창으로 계산한다', async () => {
  let time = 1000000;
  const runtime = createSharingPreview({ delay: 0, now: () => time });
  runtime.registerDiary({ id: 'one' });
  runtime.registerDiary({ id: 'two' });
  const first = await runtime.createLink('one');
  assert.equal(Date.parse(first.linkExpiresAt), time + 3600000);
  const second = await runtime.createLink('one');
  assert.notEqual(second.link, first.link);
  await runtime.createLink('one');
  await assert.rejects(runtime.createLink('one'), { code: 'INVITE_RATE_LIMITED' });
  assert.ok((await runtime.createLink('two')).link);
  time += 300000;
  assert.ok((await runtime.createLink('one')).link);
  runtime.dispose();
});

test('이메일 초대 관리는 소유자 전용이며 세션 종료 후 반영하지 않는다', async () => {
  const runtime = createSharingPreview({ delay: 0 });
  const invite = runtime.preview.inspect().invitations.find(row => row.status === 'PENDING');
  const diary = await runtime.accept(invite.inviteId, '여행가');
  await assert.rejects(runtime.sendEmailInvite(diary.id, 'friend@example.com'), { code: 'FORBIDDEN' });
  await assert.rejects(runtime.cancelEmailInvite(diary.id, 'other'), { code: 'FORBIDDEN' });
  runtime.registerDiary({ id: 'local' });
  const pending = runtime.sendEmailInvite('local', 'friend@example.com');
  runtime.dispose();
  await assert.rejects(pending, { code: 'DISPOSED' });
});
