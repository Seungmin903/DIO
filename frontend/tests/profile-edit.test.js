import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharingPreview } from '../src/sharing/sharingPreview.js';
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
