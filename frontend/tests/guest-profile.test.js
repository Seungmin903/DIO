import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuestProfile } from '../src/auth/guestProfile.js';

const guest = { mode: 'preview', provider: 'guest', nickname: '방문자' };
function setup(initial = null) {
  const disk = { value: initial, kept: [] };
  const service = createGuestProfile({
    load: async () => disk.value,
    save: async (value) => ((disk.value = value), true),
    keepPhoto: async (uri) => (disk.kept.push(uri), `kept:${uri}`),
  });
  return { disk, service };
}

test('게스트도 닉네임 · 한 줄 소개 · 사진을 고치고 기기에 남긴다', async () => {
  const { disk, service } = setup();
  const updated = await service.updateProfile(guest, { nickname: ' 하루 ', photoUri: 'file:///a.jpg', bio: '  오늘도   한 장  ' });
  assert.deepEqual(updated, { ...guest, nickname: '하루', bio: '오늘도 한 장', photoUri: 'kept:file:///a.jpg' });
  assert.deepEqual(disk.value, { nickname: '하루', bio: '오늘도 한 장', photoUri: 'kept:file:///a.jpg' });
});

test('게스트로 다시 시작하면 지난번에 고친 프로필이 이어진다', async () => {
  const { service } = setup({ nickname: '하루', bio: '소개', photoUri: 'file:///a.jpg' });
  assert.deepEqual(await service.start(guest), { ...guest, nickname: '하루', bio: '소개', photoUri: 'file:///a.jpg' });
  assert.deepEqual(await setup({ nickname: '!', bio: 7 }).service.start(guest), guest);
  // 예전에 남긴 기본 프로필 색 값은 버린다(게스트는 늘 예전 기본 파랑)
  assert.deepEqual(await setup({ avatarSeed: 'seed01' }).service.start(guest), guest);
});

test('소개와 사진을 비우면 키째 빠지고, 바꾸지 않은 사진은 다시 옮기지 않는다', async () => {
  const { disk, service } = setup();
  const first = await service.updateProfile(guest, { nickname: '하루', photoUri: 'file:///a.jpg', bio: '소개' });
  const same = await service.updateProfile(first, { nickname: '하루', photoUri: first.photoUri, bio: '' });
  assert.equal(disk.kept.length, 1);
  assert.equal('bio' in same, false);
  const cleared = await service.updateProfile(same, { nickname: '하루', photoUri: null, bio: '' });
  assert.equal('photoUri' in cleared, false);
});

test('닉네임 · 소개 형식 오류와 저장 실패는 거절한다', async () => {
  const { service } = setup();
  await assert.rejects(service.updateProfile(guest, { nickname: '!' }), /2~12/);
  await assert.rejects(service.updateProfile(guest, { nickname: '하루', bio: 'a'.repeat(31) }), /30자/);
  await assert.rejects(service.updateProfile(guest, { nickname: '하루', photoUri: '' }), /사진/);
  const failing = createGuestProfile({ load: async () => null, save: async () => false });
  await assert.rejects(failing.updateProfile(guest, { nickname: '하루' }), /저장하지 못했어요/);
});

test('저장이 실패하면 방금 옮긴 새 사진을 지우고 이전 사진은 그대로 둔다', async () => {
  const released = [];
  const user = { ...guest, photoUri: 'doc://old.jpg' };
  const failing = createGuestProfile({
    load: async () => null,
    save: async () => false,
    keepPhoto: async () => 'doc://new.jpg',
    releasePhoto: async (uri) => released.push(uri),
  });
  await assert.rejects(failing.updateProfile(user, { nickname: '하루', photoUri: 'file:///cache/new.jpg' }), /저장하지 못했어요/);
  assert.deepEqual(released, ['doc://new.jpg']);
  const throwing = createGuestProfile({
    load: async () => null,
    save: async () => { throw new Error('quota'); },
    keepPhoto: async () => 'doc://new2.jpg',
    releasePhoto: async (uri) => released.push(uri),
  });
  await assert.rejects(throwing.updateProfile(user, { nickname: '하루', photoUri: 'file:///cache/new.jpg' }), /저장하지 못했어요/);
  assert.deepEqual(released, ['doc://new.jpg', 'doc://new2.jpg']);
});

test('저장이 성공한 뒤에만 이전 사진을 지우고, 사진을 지워도 이전 파일을 정리한다', async () => {
  const released = [];
  const service = createGuestProfile({
    load: async () => null,
    save: async () => true,
    keepPhoto: async () => 'doc://new.jpg',
    releasePhoto: async (uri) => released.push(uri),
  });
  const user = { ...guest, photoUri: 'doc://old.jpg' };
  const changed = await service.updateProfile(user, { nickname: '하루', photoUri: 'file:///cache/new.jpg' });
  assert.equal(changed.photoUri, 'doc://new.jpg');
  assert.deepEqual(released, ['doc://old.jpg']);
  await service.updateProfile(changed, { nickname: '하루', photoUri: null });
  assert.deepEqual(released, ['doc://old.jpg', 'doc://new.jpg']);
  await service.updateProfile({ ...guest, photoUri: 'doc://same.jpg' }, { nickname: '하루', photoUri: 'doc://same.jpg' });
  assert.equal(released.length, 2);
});

test('한 줄 소개는 30자까지, 이모지는 한 글자로 센다', async () => {
  const { bioError, normalizeBio } = await import('../src/auth/validation.js');
  assert.equal(bioError('가'.repeat(30)), '');
  assert.match(bioError('가'.repeat(31)), /30자/);
  assert.equal(bioError('😀'.repeat(30)), '');
  assert.match(bioError('😀'.repeat(31)), /30자/);
  assert.equal(normalizeBio('  여러   칸\n줄바꿈  '), '여러 칸 줄바꿈');
  assert.equal(normalizeBio(null), '');
});
