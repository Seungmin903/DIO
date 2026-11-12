import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiaryApi } from '../src/diary/services/diaryApi.js';
import { createMockDiaryTransport } from '../src/diary/services/mockDiaryTransport.js';
import { createDiaryCommand, createDiaryMutation } from '../src/diary/services/diaryMutation.js';

const setup = () => {
  const mock = createMockDiaryTransport({ delay: 0 });
  const calls = [];
  const api = createDiaryApi(options => { calls.push(options); return mock.transport(options); });
  return { mock, calls, api, mutation: createDiaryMutation(createDiaryCommand(api)) };
};
const trashRows = api => api.list({ query: { status: 'trashed' } }).then(result => result.items);

test('휴지통 이동·재조회·복원에서 페이지 구성과 다른 다이어리를 보존하고 영구 삭제하지 않는다', async () => {
  const { api, calls, mutation } = setup();
  const original = await api.get('mock-travel');
  await mutation.run({ kind: 'trash', ids: [original.id] });
  const [trashed] = await trashRows(api);
  assert.equal(trashed.canRestore, true);
  assert.equal(trashed.retentionStatus, 'RETAINED');
  assert.equal(Date.parse(trashed.expiresAt) - Date.parse(trashed.trashedAt), 30 * 86400000);
  assert.equal((await api.list()).items.length, 1);
  await mutation.run({ kind: 'restore', ids: [original.id] });
  const restored = await api.get(original.id);
  assert.equal(restored.pageCount, original.pageCount);
  assert.equal(restored.color, original.color);
  assert.equal(restored.trashedAt, null);
  assert.equal((await trashRows(api)).length, 0);
  assert.equal((await api.list()).items.length, 2);
  assert.equal(calls.some(call => call.query?.permanent), false);
});

test('이동 응답 유실 재시도는 같은 요청 키로 확인하며 보관 기간을 연장하지 않는다', async () => {
  const { mock, api, mutation, calls } = setup();
  mock.setWriteScenario('response-lost');
  await mutation.run({ kind: 'trash', ids: ['mock-travel'] });
  const before = (await trashRows(api))[0];
  mock.advanceServerTime(86400000);
  mock.setWriteScenario('success'); await mutation.retry();
  const after = (await trashRows(api))[0];
  assert.equal(mutation.getSnapshot().status, 'success');
  assert.equal(after.expiresAt, before.expiresAt);
  assert.equal(after.trashedAt, before.trashedAt);
  const deletes = calls.filter(call => call.method === 'DELETE');
  assert.equal(deletes[0].requestId, deletes[1].requestId);
});

test('복원 권한 거부는 휴지통을 보존하고 자동 재시도하지 않는다', async () => {
  const { mock, api, mutation } = setup();
  await mutation.run({ kind: 'trash', ids: ['mock-travel'] });
  mock.setWriteScenario('forbidden');
  await mutation.run({ kind: 'restore', ids: ['mock-travel'] });
  assert.equal(mutation.getSnapshot().canRetry, false);
  assert.equal(mutation.getSnapshot().result.failed[0].error.status, 403);
  assert.equal((await trashRows(api)).length, 1);
});

test('조회 후 복원 기한이 지나면 서버가 거절하고 재조회에서 복원 불가로 바뀐다', async () => {
  const { mock, api, mutation } = setup();
  await mutation.run({ kind: 'trash', ids: ['mock-travel'] });
  assert.equal((await trashRows(api))[0].canRestore, true);
  mock.advanceServerTime(30 * 86400000);
  await mutation.run({ kind: 'restore', ids: ['mock-travel'] });
  assert.equal(mutation.getSnapshot().canRetry, false);
  assert.equal(mutation.getSnapshot().result.failed[0].error.status, 410);
  const [row] = await trashRows(api);
  assert.equal(row.canRestore, false);
  assert.equal(row.retentionStatus, 'EXPIRED');
});

test('영구 삭제는 휴지통 항목만 처리하며 실패하면 보존하고 같은 키 재시도 후 사라진다', async () => {
  const { mock, api, mutation, calls } = setup();
  await assert.rejects(api.permanentlyDelete('mock-travel'), error => error.status === 409);
  assert.equal((await api.list()).items.length, 2);
  await mutation.run({ kind: 'trash', ids: ['mock-travel'] });
  mock.setWriteScenario('forbidden');
  await mutation.run({ kind: 'permanentlyDelete', ids: ['mock-travel'] });
  assert.equal(mutation.getSnapshot().canRetry, false);
  assert.equal((await trashRows(api)).length, 1);
  mock.setWriteScenario('fail-once');
  await mutation.run({ kind: 'permanentlyDelete', ids: ['mock-travel'] });
  assert.equal(mutation.getSnapshot().canRetry, true);
  assert.equal((await trashRows(api)).length, 1);
  await mutation.retry();
  assert.equal((await trashRows(api)).length, 0);
  await assert.rejects(api.get('mock-travel'), error => error.status === 404);
  assert.equal((await api.get('mock-shared')).title, '함께 쓰는 일기');
  const deletes = calls.filter(call => call.query?.permanent);
  assert.equal(deletes.at(-1).requestId, deletes.at(-2).requestId);
});

test('영구 삭제 응답 유실은 사라진 행에 같은 요청으로 재시도해도 성공 결과를 확인한다', async () => {
  const { mock, api, mutation } = setup();
  await mutation.run({ kind: 'trash', ids: ['mock-travel'] });
  mock.setWriteScenario('response-lost');
  await mutation.run({ kind: 'permanentlyDelete', ids: ['mock-travel'] });
  assert.equal(mutation.getSnapshot().canRetry, true);
  assert.equal((await trashRows(api)).length, 0);
  await mutation.retry();
  assert.equal(mutation.getSnapshot().status, 'success');
  assert.deepEqual(mutation.getSnapshot().result.succeeded, ['mock-travel']);
});

test('서버 시간 경과는 만료 상태만 바꾸고 서버 정리는 만료 항목만 삭제한다', async () => {
  const { mock, api, mutation } = setup();
  await mutation.run({ kind: 'trash', ids: ['mock-travel'] });
  mock.advanceServerTime(29 * 86400000);
  mock.purgeExpired();
  assert.equal((await trashRows(api))[0].canRestore, true);
  mock.advanceServerTime(86400000);
  assert.equal((await trashRows(api))[0].retentionStatus, 'EXPIRED');
  assert.equal((await trashRows(api)).length, 1);
  mock.purgeExpired(); mock.purgeExpired();
  assert.equal((await trashRows(api)).length, 0);
  assert.equal((await api.list()).items.length, 1);
  assert.equal((await api.get('mock-shared')).pageCount, 5);
});
