import test from 'node:test';
import assert from 'node:assert/strict';
import { isTrashExpired, trashDeadline, trashStatus, TRASH_RETENTION_MS, purgeTrashedDiary } from '../src/diary/utils/trashRetention.js';
import { normalizeDiaries, recoverOrphanDiaries } from '../src/diary/utils/diaryLibrary.js';
import { collectMediaIds } from '../src/editor/utils/mediaReferences.js';

const deleted = Date.parse('2026-09-01T03:00:00Z');
const keys = { diaries: 'diaries', doc: 'doc', customDecor: 'decor' };
const diary = { id: 'a', title: '일기', trashedAt: new Date(deleted).toISOString() };
const doc = (...ids) => JSON.stringify({ pages: [{ objects: ids.map(mediaFileId => ({ mediaFileId })) }] });

test('30일은 정확히 720시간이며 기한 1ms 전과 경계, 잘못된 날짜를 구분한다', () => {
  const end = deleted + TRASH_RETENTION_MS;
  assert.equal(TRASH_RETENTION_MS, 2592000000);
  assert.equal(trashDeadline(diary), end);
  assert.equal(isTrashExpired(diary, end - 1), false);
  assert.equal(isTrashExpired(diary, end), true);
  assert.equal(isTrashExpired({ trashedAt: null }, end), false);
  assert.equal(isTrashExpired({ trashedAt: '손상' }, end), false);
  assert.match(trashStatus(diary, deleted), /30일 후/);
  assert.match(trashStatus(diary, end - 1), /1일 후/);
  assert.match(trashStatus(diary, end), /기한 만료/);
  assert.match(trashStatus({ trashedAt: '손상' }), /자동 삭제 보류/);
});

function fixture(fail) {
  let diaries = [diary, { id: 'b', title: '다른 문서', trashedAt: null }];
  const data = new Map([[keys.diaries, JSON.stringify(diaries)], ['doc:a', doc('shared', 'unique')], ['doc:b', doc('shared')], ['decor', doc('decor')]]);
  const removed = [], forgotten = [], events = [];
  let listWrites = 0;
  const storage = {
    async getItem(key) { if (fail === 'read') throw Error('read'); return data.get(key) ?? null; },
    async getAllKeys() { return [...data.keys()]; },
    async multiGet(list) { return list.map(key => [key, data.get(key)]); },
    async setItem(key, value) {
      listWrites += 1;
      if (fail === 'marker' || (fail === 'final' && listWrites === 2)) throw Error('quota');
      events.push(['list', JSON.parse(value)]); data.set(key, value);
    },
    async removeItem(key) { if (fail === 'remove') throw Error('remove'); events.push(['remove', key]); data.delete(key); },
  };
  const args = { id: 'a', storage, keys, getDiaries: () => diaries, updateDiaries: fn => { diaries = fn(diaries); }, forgetDoc: key => forgotten.push(key), collectMediaIds, removeMedia: async id => removed.push(id) };
  return { args, data, removed, forgotten, events, get diaries() { return diaries; } };
}

test('삭제 표식 → 문서 제거 → 목록 제거 순서이며 공유 미디어와 다른 다이어리는 보존한다', async () => {
  const f = fixture();
  assert.equal(await purgeTrashedDiary(f.args), true);
  assert.equal(f.events[0][1][0].purgePending, true);
  assert.deepEqual(f.events[1], ['remove', 'doc:a']);
  assert.deepEqual(f.diaries.map(d => d.id), ['b']);
  assert.deepEqual(f.removed, ['unique']);
  assert.deepEqual(f.forgotten, ['doc:a']);
  assert.ok(f.data.has('doc:b'));
});

for (const failure of ['marker', 'read', 'remove', 'final']) test(`${failure} 실패 시 복구 가능한 삭제 표식·목록을 유지하고 미디어를 지우지 않는다`, async () => {
  const f = fixture(failure);
  assert.equal(await purgeTrashedDiary(f.args), false);
  assert.equal(f.diaries.length, 2);
  assert.deepEqual(f.removed, []);
  if (failure === 'marker') assert.ok(f.data.has('doc:a'));
  else {
    const restarted = normalizeDiaries(JSON.parse(f.data.get(keys.diaries)));
    assert.equal(restarted[0].purgePending, true);
    assert.equal(isTrashExpired(restarted[0], deleted), true, '삭제 중 표식은 시계가 되돌아가도 복원하지 않는다');
    assert.equal(recoverOrphanDiaries(restarted, [['doc:a', f.data.get('doc:a')]], 'doc').length, 2);
  }
});

test('재시작 후 삭제 중 표식 항목을 재시도하며 활성 다이어리는 영구 삭제하지 않는다', async () => {
  const f = fixture();
  f.args.updateDiaries(ds => ds.map(d => d.id === 'a' ? { ...d, purgePending: true } : d));
  assert.equal(await purgeTrashedDiary(f.args), true);
  assert.equal(await purgeTrashedDiary({ ...f.args, id: 'b' }), false);
  assert.ok(f.data.has('doc:b'));
});

test('다른 문서가 손상돼 참조를 알 수 없으면 모든 미디어를 보존한다', async () => {
  const f = fixture(); f.data.set('doc:b', '{broken');
  assert.equal(await purgeTrashedDiary(f.args), true);
  assert.deepEqual(f.removed, []);
});
