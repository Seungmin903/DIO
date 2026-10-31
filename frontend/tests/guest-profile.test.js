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
  assert.deepEqual(await setup(null).service.start(guest), guest);
  assert.deepEqual(await setup({ nickname: '!', bio: 7 }).service.start(guest), guest);
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
