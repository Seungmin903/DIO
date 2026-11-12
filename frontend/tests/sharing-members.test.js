import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharingPreview } from '../src/sharing/sharingPreview.js';

async function fixture() {
  const runtime = createSharingPreview({ delay: 0, user: { nickname: '소연' } });
  const inviteId = runtime.preview.receiveInvitation();
  const diary = await runtime.accept(inviteId, '소연');
  const self = runtime.self.id;
  runtime.self.id = 'host';
  try { await runtime.transferOwner(diary.id, self); }
  finally { runtime.self.id = self; }
  return { runtime, id: diary.id };
}

test('소유권 양도는 한 명의 소유자와 기존 소유자의 편집 권한·프로필·문서를 유지한다', async () => {
  const { runtime, id } = await fixture();
  const before = await runtime.getSharing(id);
  const library = runtime.getSnapshot().library[0];
  const after = await runtime.transferOwner(id, 'host');
  assert.equal(after.members.filter(m => m.role === 'OWNER').length, 1);
  assert.equal(after.members.find(m => m.id === 'self').role, 'EDITOR');
  assert.equal(after.members.find(m => m.id === 'host').role, 'OWNER');
  assert.deepEqual(after.members.map(({ role, ...m }) => m), before.members.map(({ role, ...m }) => m));
  assert.equal(runtime.getSnapshot().library[0].sessionStorageKey, library.sessionStorageKey);
  await assert.rejects(runtime.transferOwner(id, 'self'), { code: 'FORBIDDEN' });
  await assert.rejects(runtime.removeMember(id, 'host'), { code: 'FORBIDDEN' });
  await runtime.leave(id);
  assert.equal(runtime.getSnapshot().library.length, 0);
  await assert.rejects(runtime.getSharing(id), { code: 'FORBIDDEN' });
});

test('잘못된 양도 대상은 상태를 유지하고 강퇴는 기존 링크를 무효화한다', async () => {
  const { runtime, id } = await fixture();
  const before = await runtime.getSharing(id);
  for (const target of ['self', 'missing']) {
    await assert.rejects(runtime.transferOwner(id, target), { code: 'INVALID_MEMBER' });
    assert.deepEqual(await runtime.getSharing(id), before);
  }
  await runtime.createLink(id);
  const after = await runtime.removeMember(id, 'host');
  assert.equal(after.members.length, 1);
  assert.equal(after.link, null);
  assert.equal(after.linkExpiresAt, undefined);
  await assert.rejects(runtime.leave(id), { code: 'FORBIDDEN' });
});

test('동시에 양도하면 기존 소유자의 뒤늦은 요청과 폐기된 세션 변경을 거절한다', async () => {
  const { runtime, id } = await fixture();
  const results = await Promise.allSettled([runtime.transferOwner(id, 'host'), runtime.transferOwner(id, 'host')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await runtime.getSharing(id)).members.filter(m => m.role === 'OWNER').length, 1);
  runtime.dispose();
  await assert.rejects(runtime.transferOwner(id, 'self'), { code: 'DISPOSED' });
});
