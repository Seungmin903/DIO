import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewAuth } from '../src/auth/previewAuth.js';
import { createSharingPreview } from '../src/sharing/sharingPreview.js';
const credentials = {
  email: 'profile@example.com',
  password: 'Password123',
  confirmation: 'Password123',
};
async function setup() {
  const service = createPreviewAuth({ wait: async () => {} });
  const enrollment = await service.signup(credentials);
  const user = await service.completeProfile({
    ...enrollment,
    nickname: '처음이름',
    photoUri: 'file:///original.jpg',
  });
  return { service, user };
}
test('본인 닉네임 허용·계정 수정·사진 삭제를 재로그인에 반영하고 비밀번호를 노출하지 않는다', async () => {
  const { service, user } = await setup();
  assert.equal(await service.checkProfileNickname(user, user.nickname), user.nickname);
  const updated = await service.updateProfile(user, { nickname: '바뀐이름', photoUri: null });
  assert.equal(updated.accountId, user.accountId);
  assert.equal(updated.photoUri, undefined);
  assert.equal('password' in updated, false);
  assert.deepEqual(await service.login(credentials), updated);
  assert.equal(user.nickname, '처음이름');
  assert.equal(await service.checkNickname(user.nickname), true);
  assert.equal(await service.checkNickname(updated.nickname), false);
});
test('중복 이름·손상 사진 저장은 원본을 유지하고 확인 후 선점된 이름을 저장 단계에서 재검사한다', async () => {
  const { service, user } = await setup();
  await service.checkProfileNickname(user, '다른이름');
  await service.completeProfile({ provider: 'google', nickname: '다른이름' });
  await assert.rejects(service.updateProfile(user, { nickname: '다른이름' }), /이미 사용/);
  await assert.rejects(service.updateProfile(user, { nickname: '새이름', photoUri: '' }), /사진/);
  await assert.rejects(service.checkProfileNickname(user, '관리자'), /이미 사용/);
  assert.deepEqual(await service.login(credentials), user);
});
test('비밀번호 변경은 현재 값·새 형식·확인·동일값을 검사하고 이전 비밀번호 로그인을 차단한다', async () => {
  const { service, user } = await setup();
  const values = {
    currentPassword: credentials.password,
    password: 'Changed123',
    confirmation: 'Changed123',
  };
  for (const input of [
    { ...values, currentPassword: 'Wrong1234' },
    { ...values, password: 'bad' },
    { ...values, confirmation: 'Other1234' },
    { ...values, password: credentials.password, confirmation: credentials.password },
  ])
    await assert.rejects(service.changePassword(user, input));
  assert.deepEqual(await service.login(credentials), user);
  await service.changePassword(user, values);
  await assert.rejects(service.login(credentials), /맞지 않아요/);
  assert.deepEqual(await service.login({ ...credentials, password: values.password }), user);
});
test('탈퇴는 본인만 제거하고 같은 이메일 재가입은 다른 계정이며 이전 세션 변경은 거부한다', async () => {
  const { service, user } = await setup();
  const other = await service.completeProfile({ provider: 'apple', nickname: '다른회원' });
  await service.withdraw(user);
  await assert.rejects(service.login(credentials), /맞지 않아요/);
  assert.equal(await service.checkProfileNickname(other, other.nickname), other.nickname);
  const enrollment = await service.signup(credentials);
  const next = await service.completeProfile({ ...enrollment, nickname: user.nickname });
  assert.notEqual(user.accountId, next.accountId);
  await assert.rejects(service.updateProfile(user, { nickname: '새이름' }), /로그인/);
  await assert.rejects(service.withdraw({ provider: 'guest' }), /로그인/);
});
test('소셜 회원 수정·탈퇴를 지원하고 이메일 비밀번호 변경은 노출하지 않는다', async () => {
  const { service } = await setup();
  const user = await service.completeProfile({ provider: 'google', nickname: '구글회원' });
  assert.equal((await service.updateProfile(user, { nickname: '수정회원' })).nickname, '수정회원');
  await assert.rejects(service.changePassword(user, {}), /소셜/);
  await service.withdraw(user);
  await assert.rejects(service.checkProfileNickname(user, '새이름'), /로그인/);
});
test('계정 사진·닉네임 변경은 기존 공유 프로필과 문서를 유지하고 이후 생성 기본값만 변경한다', async () => {
  const runtime = createSharingPreview({
    user: { nickname: '기존계정', photoUri: 'file:///account.jpg' },
    delay: 0,
  });
  const own = runtime.registerDiary({ id: 'local', title: '내 기록' });
  const invite = runtime.preview.inspect().invitations.find((x) => x.status === 'PENDING');
  const joined = await runtime.accept(invite.inviteId, '다이어리이름', {
    photoUri: 'file:///diary.jpg',
  });
  const key = runtime.getSnapshot().library[0].sessionStorageKey;
  runtime.setAccountProfile({ nickname: '수정계정', photoUri: 'file:///changed.jpg' });
  assert.deepEqual(await runtime.getSharing(own.id), own);
  assert.deepEqual(await runtime.getSharing(joined.id), joined);
  assert.equal(runtime.getSnapshot().library[0].sessionStorageKey, key);
  const newer = runtime
    .registerDiary({ id: 'new', title: '새 기록' })
    .members.find((x) => x.id === 'self');
  assert.equal(newer.nickname, '수정계정');
  assert.equal(newer.photoUri, 'file:///changed.jpg');
  runtime.dispose();
});
