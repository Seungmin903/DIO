import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharingPreview, sharingNicknameError } from '../src/sharing/sharingPreview.js';
const create = () => createSharingPreview({ user: { nickname: '회원이름' }, delay: 0 });
const pending = (runtime) =>
  runtime.preview.inspect().invitations.find((value) => value.status === 'PENDING');
test('가입 닉네임과 다이어리별 이름을 분리하며 확인만으로 참여하지 않는다', async () => {
  const runtime = create(),
    invite = pending(runtime),
    before = await runtime.notificationApi.count();
  assert.equal(await runtime.checkNickname(invite.inviteId, '여행가'), '여행가');
  assert.equal(runtime.getSnapshot().joined.length, 0);
  const joined = await runtime.accept(invite.inviteId, '여행가');
  assert.equal(joined.members.find((x) => x.id === 'self').nickname, '여행가');
  assert.equal(runtime.self.nickname, '회원이름');
  assert.equal(
    (await runtime.notificationApi.count()).actionableUnreadCount,
    before.actionableUnreadCount - 1,
  );
  assert.equal((await runtime.invitationGateway.get(invite.inviteId)).status, 'ACCEPTED');
  await assert.rejects(runtime.accept(invite.inviteId, '다른이름'), /사용할 수 없는/);
  const other = runtime.preview.inspect().invitations.find((value) => value.status === 'PENDING');
  await runtime.accept(other.inviteId, '다른이름');
  assert.equal(
    (await runtime.getSharing(joined.id)).members.find((x) => x.id === 'self').nickname,
    '여행가',
  );
});
test('닉네임 중복·만료·취소를 최종 수락 직전에 검사한다', async () => {
  const runtime = create(),
    invite = pending(runtime);
  assert.ok(sharingNicknameError('a'));
  assert.ok(sharingNicknameError('이름!'));
  await assert.rejects(runtime.checkNickname(invite.inviteId, '하루'), /이미 사용/);
  await runtime.checkNickname(invite.inviteId, '여행가');
  runtime.preview.setInvitationStatus(invite.inviteId, 'REVOKED');
  await assert.rejects(runtime.accept(invite.inviteId, '여행가'), /사용할 수 없는/);
  assert.equal(runtime.getSnapshot().joined.length, 0);
  for (const status of ['EXPIRED', 'REVOKED']) {
    const id = runtime.preview.inspect().invitations.find((x) => x.status === status)?.inviteId;
    if (id) await assert.rejects(runtime.checkNickname(id, '여행가'), /사용할 수 없는/);
  }
});
test('거절은 참여시키지 않고 알림 삭제는 초대 원본을 삭제하지 않는다', async () => {
  const runtime = create(),
    invite = pending(runtime),
    rows = await runtime.notificationApi.list();
  const row = rows.items.find((x) => x.inviteId === invite.inviteId);
  await runtime.notificationApi.remove(row.id);
  assert.equal((await runtime.invitationGateway.get(invite.inviteId)).status, 'PENDING');
  await runtime.decline(invite.inviteId);
  assert.equal((await runtime.invitationGateway.get(invite.inviteId)).status, 'DECLINED');
  assert.equal(runtime.getSnapshot().joined.length, 0);
});
test('소유자 설정·권한 변경·참여 해제는 원본 로컬 다이어리를 바꾸지 않는다', async () => {
  const runtime = create(),
    source = { id: 'local-1', title: '내 기록', color: '#A9BFA6' },
    original = structuredClone(source);
  const diary = runtime.registerDiary(source);
  assert.equal(diary.members.length, 1);
  assert.equal(diary.members[0].role, 'OWNER');
  const linked = await runtime.createLink(diary.id);
  assert.ok(linked.link.startsWith('https://dio.example/invite/'));
  assert.equal((await runtime.setExportAllowed(diary.id, false)).allowExport, false);
  assert.ok(diary.members.every((member) => ['OWNER', 'EDITOR'].includes(member.role)));
  assert.equal(runtime.setRole, undefined);
  assert.equal((await runtime.getSharing(diary.id)).members.length, 1);
  assert.equal(runtime.getSnapshot().library.length, 0);
  assert.equal(runtime.registerDiary(source).members.length, 1);
  await assert.rejects(runtime.removeMember(diary.id, 'self'), /소유자/);
  await assert.rejects(runtime.leave(diary.id), /소유자/);
  assert.deepEqual(source, original);
});
test('편집자는 링크를 만들지만 소유자 설정은 바꿀 수 없고 참여 해제 후 조회할 수 없다', async () => {
  const runtime = create(),
    invite = pending(runtime),
    diary = await runtime.accept(invite.inviteId, '여행가');
  assert.ok((await runtime.createLink(diary.id)).link);
  await assert.rejects(runtime.setExportAllowed(diary.id, false), /소유자/);
  await runtime.leave(diary.id);
  await assert.rejects(runtime.getSharing(diary.id), /참여하고 있지/);
});
test('초대 링크는 허용된 임시 형식만 처리하고 외부 URL을 열지 않는다', async () => {
  const runtime = create(),
    invite = pending(runtime);
  assert.equal(
    (await runtime.resolveLink(`https://dio.example/invite/${invite.inviteId}`)).inviteId,
    invite.inviteId,
  );
  for (const link of [
    'javascript:alert(1)',
    'https://evil.test/invite/id',
    'https://dio.example.evil.test/invite/id',
    'https://dio.example/invite/%ZZ',
  ])
    await assert.rejects(runtime.resolveLink(link), /사용할 수 없는/);
});
test('폐기된 세션의 요청은 값을 변경하지 않는다', async () => {
  const runtime = create();
  runtime.registerDiary({ id: 'local-1', title: '내 기록' });
  runtime.dispose();
  await assert.rejects(runtime.createLink('local-1'), /다시 열어/);
  await assert.rejects(runtime.invitationGateway.get(pending(runtime).inviteId), /다시 열어/);
});

test('다이어리 사진을 각각 바꾸고 기본 프로필로 복구해도 다른 다이어리·계정은 유지한다', async () => {
  const account = { nickname: '계정이름', photoUri: 'file:///account.png' };
  const runtime = createSharingPreview({ user: account, delay: 0 });
  const first = runtime.registerDiary({ id: 'one', title: '하나' });
  runtime.registerDiary({ id: 'two', title: '둘' });
  await runtime.setProfilePhoto(first.id, 'file:///one.png');
  const mine = (diary) => diary.members.find((value) => value.id === 'self');
  assert.equal(mine(await runtime.getSharing('one')).photoUri, 'file:///one.png');
  assert.equal(mine(await runtime.getSharing('two')).photoUri, 'file:///account.png');
  assert.equal(runtime.self.photoUri, 'file:///account.png');
  assert.equal(account.photoUri, 'file:///account.png');
  await runtime.setProfilePhoto('one', null);
  assert.equal(mine(await runtime.getSharing('one')).photoUri, null);
  assert.equal(mine(await runtime.getSharing('two')).photoUri, 'file:///account.png');
  await assert.rejects(runtime.setProfilePhoto('one', ''), /사진을 다시/);
});

test('초대 수락 사진은 해당 참여자에게만 저장하며 탈퇴 후 사진 변경은 거부한다', async () => {
  const runtime = create(),
    invite = pending(runtime);
  const diary = await runtime.accept(invite.inviteId, '여행가', { photoUri: 'file:///trip.png' });
  assert.equal(diary.members.find((value) => value.id === 'self').photoUri, 'file:///trip.png');
  assert.equal(runtime.self.photoUri, null);
  assert.ok(diary.members.filter((value) => value.id !== 'self').every((value) => !value.photoUri));
  await runtime.leave(diary.id);
  await assert.rejects(runtime.setProfilePhoto(diary.id, 'file:///new.png'), /참여하고 있지/);
});

test('참여 후 닉네임과 사진을 함께 변경해도 다른 다이어리·계정은 유지한다', async () => {
  const runtime = createSharingPreview({
    user: { nickname: '계정이름', photoUri: 'file:///account.png' },
    delay: 0,
  });
  runtime.registerDiary({ id: 'one', title: '하나' });
  runtime.registerDiary({ id: 'two', title: '둘' });
  assert.equal(await runtime.checkProfileNickname('one', '계정이름'), '계정이름');
  const joined = await runtime.accept(pending(runtime).inviteId, '참여자');
  await assert.rejects(runtime.checkProfileNickname(joined.id, '하루'), /이미 사용/);
  const before = await runtime.getSharing(joined.id);
  await assert.rejects(
    runtime.updateProfile(joined.id, { nickname: '하루', photoUri: 'file:///invalid.png' }),
    /이미 사용/,
  );
  assert.deepEqual(await runtime.getSharing(joined.id), before);
  const updated = await runtime.updateProfile('one', {
    nickname: '다이어리이름',
    photoUri: 'file:///one.png',
  });
  const mine = (diary) => diary.members.find((member) => member.id === 'self');
  assert.equal(mine(updated).nickname, '다이어리이름');
  assert.equal(mine(updated).photoUri, 'file:///one.png');
  assert.equal(mine(await runtime.getSharing('two')).nickname, '계정이름');
  assert.equal(runtime.self.nickname, '계정이름');
  assert.equal(runtime.self.photoUri, 'file:///account.png');
});

test('대기 중 세션이 종료되면 이미 시작한 설정 변경도 반영하지 않는다', async () => {
  const runtime = create();
  runtime.registerDiary({ id: 'a', title: '기록' });
  const before = runtime.getSnapshot();
  const update = runtime.setExportAllowed('a', false);
  runtime.dispose();
  await assert.rejects(update, /다시 열어/);
  assert.equal(runtime.getSnapshot(), before);
});

test('표지 정보 재등록은 색·무늬·만년형 표시를 갱신하고 개별 프로필은 보존한다', async () => {
  const runtime = create(),
    source = {
      id: 'a',
      title: '기록',
      color: '#F0B0AA',
      pattern: 'linen',
      templateConfig: { dateMode: 'undated' },
    };
  runtime.registerDiary(source);
  source.templateConfig.dateMode = 'dated';
  assert.equal((await runtime.getSharing('a')).templateConfig?.dateMode, 'undated');
  await runtime.updateProfile('a', { nickname: '내이름', photoUri: null });
  const updated = runtime.registerDiary({
    ...source,
    title: '새 기록',
    color: '#A9BFA6',
    pattern: 'dots',
  });
  assert.equal(updated.color, '#A9BFA6');
  assert.equal(updated.pattern, 'dots');
  assert.equal(updated.title, '새 기록');
  assert.equal(updated.members.find((member) => member.id === 'self').nickname, '내이름');
});
