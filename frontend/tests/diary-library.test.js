import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUpdatedAt, normalizeDiaries, recoverOrphanDiaries, sortByCreated } from '../src/diary/utils/diaryLibrary.js';

const PREFIX = 'dio:editor:doc:v4';

test('저장된 목록은 잘못된 항목과 중복 ID를 버리고 기본값을 채운다', () => {
  const list = normalizeDiaries([
    { id: 'a', title: '여행', color: '#111111', type: '공유', favorite: true, updatedAt: '2026-10-20T01:00:00.000Z' },
    { id: 'a', title: '중복' },
    { id: '', title: '빈 ID' },
    { id: 'b', title: '  ' },
    null,
    { id: 'c', title: '일기', type: '이상한 값', favorite: 'yes' },
  ]);
  assert.deepEqual(list.map((d) => d.id), ['a', 'c']);
  assert.equal(list[0].type, '공유');
  assert.deepEqual(list[1], { id: 'c', title: '일기', color: '#CED9EE', type: '개인', favorite: false, updatedAt: null, trashedAt: null, firstPageDate: null, pattern: null, pageSize: 'landscape', firstPage: 'blank' });
  assert.deepEqual(normalizeDiaries({ not: 'array' }), []);
  assert.deepEqual(normalizeDiaries(undefined), []);
});

test('편집 문서만 남은 다이어리를 목록 뒤에 되살린다', () => {
  const doc = (title, coverColor) => JSON.stringify({ id: 'x', title, coverColor, pages: [{ id: 'p', objects: [] }] });
  const list = [{ id: 'kept', title: '기존', color: '#000000', type: '개인', favorite: false, updatedAt: null, pattern: null, pageSize: 'landscape', firstPage: 'blank' }];
  const result = recoverOrphanDiaries(list, [
    [`${PREFIX}:kept`, doc('기존 문서', '#000000')],
    [`${PREFIX}:orphan`, doc('남은 문서', '#ABCDEF')],
    [`${PREFIX}:broken`, '{not json'],
    [`${PREFIX}:empty`, JSON.stringify({ title: '페이지 없음', pages: [] })],
    [PREFIX, doc('예전 단일 문서', '#123456')],
    ['dio:editor:custom-decor:v2', '[]'],
  ], PREFIX);
  assert.deepEqual(result.map((d) => d.id), ['kept', 'orphan']);
  assert.deepEqual(result[1], { id: 'orphan', title: '남은 문서', color: '#ABCDEF', type: '개인', favorite: false, updatedAt: null, trashedAt: null, firstPageDate: null, pattern: null, pageSize: 'landscape', firstPage: 'blank' });
  // 되살릴 것이 없으면 같은 배열을 그대로 돌려준다.
  assert.equal(recoverOrphanDiaries(list, [], PREFIX), list);
});

test('수정 시각은 상대 시간으로 보여주고 알 수 없으면 기록 없음으로 표시한다', () => {
  const now = new Date('2026-10-20T12:00:00.000Z');
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  assert.equal(formatUpdatedAt(ago(10 * 1000), now), '방금 전');
  assert.equal(formatUpdatedAt(ago(5 * 60 * 1000), now), '5분 전');
  assert.equal(formatUpdatedAt(ago(3 * 60 * 60 * 1000), now), '3시간 전');
  assert.equal(formatUpdatedAt(ago(2 * 24 * 60 * 60 * 1000), now), '2일 전');
  assert.match(formatUpdatedAt(ago(30 * 24 * 60 * 60 * 1000), now), /^\d{4}\.\d{2}\.\d{2}$/);
  // 이전 버전이 저장한 표시용 문자열이나 빈 값
  assert.equal(formatUpdatedAt('방금 전', now), '기록 없음');
  assert.equal(formatUpdatedAt(null, now), '기록 없음');
});

test('다이어리는 먼저 만든 순서대로 정렬하고 ID 형식이 다르면 기존 순서를 유지한다', () => {
  const sorted = sortByCreated([
    { id: 'diary-300' },
    { id: 'legacy-a' },
    { id: 'diary-100' },
    { id: 'legacy-b' },
    { id: 'diary-200' },
  ]);
  assert.deepEqual(sorted.map((d) => d.id), ['legacy-a', 'legacy-b', 'diary-100', 'diary-200', 'diary-300']);
});

test('표지 무늬·가로/세로 방향·첫 페이지 서식과 2026 날짜를 보존한다', () => {
  const [valid, invalid] = normalizeDiaries([
    { id: 'a', title: '봄', pattern: 'gingham', pageSize: 'landscape', firstPage: 'monthly', firstPageDate: '2026-10-21', trashedAt: '2026-10-22T00:00:00.000Z' },
    { id: 'b', title: '여름', pattern: 'plaid', pageSize: 'portrait', firstPage: 'calendar', firstPageDate: '2027-01-01' },
  ]);
  assert.deepEqual([valid.pattern, valid.pageSize, valid.firstPage, valid.firstPageDate], ['gingham', 'landscape', 'monthly', '2026-10-21']);
  assert.equal(valid.trashedAt, '2026-10-22T00:00:00.000Z');
  assert.deepEqual([invalid.pattern, invalid.pageSize, invalid.firstPage, invalid.firstPageDate], [null, 'portrait', 'blank', null]);
});
