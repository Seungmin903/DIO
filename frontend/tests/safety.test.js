import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedParticipants, createSafetyStore, normalizeParticipants, validateReport, warningIsDismissed, warningKey } from '../src/safety/safetyModel.js';
import { createSafetyPreviewAdapter, sampleParticipants } from '../src/safety/safetyPreviewAdapter.js';
const report = { reason: 'OTHER', description: '상세 설명', photos: [] };
const photo = { mimeType: 'image/png', size: 100, uri: 'file://sample.png' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };

test('필수 사유/설명과 증빙 파일 종류·크기·수 제한', () => {
  assert.equal(validateReport(report), '');
  assert.match(validateReport({ ...report, reason: 'unknown' }), /사유/);
  assert.match(validateReport({ ...report, description: '  \n' }), /설명/);
  assert.equal(validateReport({ ...report, reason: 'HARASSMENT', description: '' }), '');
  assert.equal(validateReport({ ...report, reason: 'COLLABORATION_ABUSE', description: undefined }), '');
  assert.match(validateReport({ ...report, description: '가'.repeat(1001) }), /1,000/);
  assert.equal(validateReport({ ...report, photos: [photo] }), '');
  assert.equal(validateReport({ ...report, photos: Array(3).fill({ ...photo, size: 5 * 1024 * 1024 }) }), '');
  for (const invalid of [{ ...photo, mimeType: 'image/gif' }, { ...photo, size: undefined }, { ...photo, size: 5 * 1024 * 1024 + 1 }]) {
    assert.ok(validateReport({ ...report, photos: [invalid] }));
  }
  assert.match(validateReport({ ...report, photos: Array(4).fill(photo) }), /3장/);
});
test('재참여 계정은 현재 행 하나로 합치고 탈퇴 이름은 노출하지 않는다', () => {
  const rows = normalizeParticipants([{ id: 'x', nickname: '과거', leftAt: '2026-01-01' }, { userId: 'x', nickname: '현재' }, { id: 'gone', nickname: '실명', activeAccount: false }]);
  assert.equal(rows.length, 2); assert.equal(rows[0].nickname, '현재');
  assert.equal(rows[1].nickname, '탈퇴한 사용자');
});
test('차단해도 참여자·권한은 보존하며 경고는 현재 참여자에게만 해당한다', async () => {
  const adapter = createSafetyPreviewAdapter(), store = createSafetyStore(adapter);
  await store.refresh();
  await store.block({ id: 'friend' }); await store.block({ id: 'past' });
  const members = await store.participants('diary');
  assert.deepEqual(blockedParticipants(members, store.getSnapshot().blocks).map(row => row.id), ['friend']);
  assert.equal(members.find(row => row.id === 'friend').role, 'EDITOR');
  assert.equal(sampleParticipants.length, 5);
  await store.unblock({ id: 'friend' });
  assert.deepEqual(store.getSnapshot().blocks.map(row => row.id), ['past']);
});
test('다시 보지 않기는 계정·다이어리별이며 새로운 차단 참여자는 재안내한다', () => {
  assert.notEqual(warningKey('A', 'diary'), warningKey('B', 'diary'));
  assert.notEqual(warningKey('A', 'diary'), warningKey('A', 'other'));
  assert.equal(warningIsDismissed(['friend'], [{ id: 'friend' }]), true);
  assert.equal(warningIsDismissed(['friend'], [{ id: 'friend' }, { id: 'host' }]), false);
});
test('미연결 상태는 빈 목록·접수·차단 성공으로 위장하지 않는다', async () => {
  const store = createSafetyStore(); await store.refresh();
  assert.equal(store.getSnapshot().status, 'error');
  await assert.rejects(store.block({ id: 'friend' }), /연결/);
  await assert.rejects(store.report(report), /연결/);
  assert.deepEqual(store.getSnapshot().blocks, []);
});
test('실패한 차단은 상태를 바꾸지 않으며 다시 시도할 수 있다', async () => {
  const adapter = createSafetyPreviewAdapter(), store = createSafetyStore(adapter);
  adapter.failNext('block');
  await assert.rejects(store.block({ id: 'friend' }), /실패/);
  assert.deepEqual(store.getSnapshot().blocks, []);
  await store.block({ id: 'friend' }); assert.equal(store.getSnapshot().blocks.length, 1);
});
test('계정 전환 후 늦게 끝난 변경은 새 세션의 목록에 반영하지 않는다', async () => {
  const job = deferred(), store = createSafetyStore({ mode: 'server', block: () => job.promise });
  const mutation = store.block({ id: 'friend' }); store.dispose(); store.activate();
  job.resolve({ userId: 'friend', blockedAt: '2026-11-04' });
  await assert.rejects(mutation, /계정/);
  assert.deepEqual(store.getSnapshot().blocks, []);
});
test('중복 제출을 막고 늦은 목록 조회가 차단 결과를 덮어쓰지 않는다', async () => {
  const load = deferred(), mutation = deferred();
  const store = createSafetyStore({ mode: 'server', listBlocks: () => load.promise, block: () => mutation.promise });
  const refresh = store.refresh(), first = store.block({ id: 'friend' });
  await assert.rejects(store.block({ id: 'friend' }), /처리 중/);
  mutation.resolve({ userId: 'friend', nickname: '모아', blockedAt: '2026-11-04' }); await first;
  load.resolve([]); await refresh;
  assert.deepEqual(store.getSnapshot().blocks.map(row => row.id), ['friend']);
});
