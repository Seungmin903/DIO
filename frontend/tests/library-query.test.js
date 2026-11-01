import test from 'node:test';
import assert from 'node:assert/strict';
import { queryDiaries } from '../src/diary/utils/libraryQuery.js';
const diaries = [
 { id: 'a', title: '여행 10', createdAt: '2026-10-20', favorite: true },
 { id: 'b', title: '여행 2', createdAt: '2026-10-21' },
 { id: 'c', title: 'DIO 기록', createdAt: '2026-10-19', updatedAt: '2026-10-24', favorite: true },
 { id: 'd', title: '삭제한 여행', trashedAt: '2026-10-24' },
];
const ids = value => value.map(d => d.id);
test('제목 검색은 공백·대소문자·한글 정규화를 처리하고 즐겨찾기·휴지통 조건을 유지한다', () => {
 assert.deepEqual(ids(queryDiaries(diaries, { query: ' 여행 ', sort: 'created' })), ['b','a']);
 assert.deepEqual(ids(queryDiaries(diaries, { query: ' dio ' })), ['c']);
 assert.deepEqual(ids(queryDiaries(diaries, { query: '여행', filter: 'favorite' })), ['a']);
 assert.deepEqual(queryDiaries(diaries, { query: '없음' }), []);
 assert.equal(queryDiaries(diaries, { query: '  ' }).length, 3);
 assert.equal(queryDiaries([{id:'x',title:'가'.normalize('NFD')}],{query:'가'}).length,1);
});
test('정렬 4종은 원본 순서·데이터를 바꾸지 않고 같은 값은 기존 순서를 유지한다', () => {
 const before = JSON.stringify(diaries);
 assert.deepEqual(ids(queryDiaries(diaries,{sort:'updated'})),['c','b','a']);
 assert.deepEqual(ids(queryDiaries(diaries,{sort:'created'})),['b','a','c']);
 assert.deepEqual(ids(queryDiaries(diaries,{sort:'title'})),['b','a','c']);
 assert.deepEqual(ids(queryDiaries(diaries,{sort:'pages',metadata:{a:{pageCount:5},b:{pageCount:8},c:{pageCount:5}}})),['b','a','c']);
 assert.equal(JSON.stringify(diaries),before);
});
test('실제 편집 수정 시각과 문서 페이지 수를 반영하고 구형·손상 시각에도 안정적으로 정렬한다', () => {
 assert.deepEqual(ids(queryDiaries(diaries,{metadata:{a:{updatedAt:'2026-10-25'}}})),['a','c','b']);
 const old=[{id:'diary-1000',title:'A',createdAt:'invalid'},{id:'diary-2000',title:'B'}];
 assert.deepEqual(ids(queryDiaries(old,{sort:'created'})),['diary-2000','diary-1000']);
 assert.deepEqual(ids(queryDiaries(old,{sort:'pages'})),['diary-1000','diary-2000']);
});

test('공유 필터는 내가 공유한 다이어리와 수락한 다이어리를 모으고 검색·정렬·즐겨찾기를 유지한다', () => {
 const rows = [
  { id: 'private', title: '개인', favorite: true },
  { id: 'owner', title: '여행 2', isShared: true, favorite: true },
  { id: 'joined', title: '여행 1', sharedDiaryId: 'remote' },
  { id: 'removed', title: '삭제', isShared: true, trashedAt: '2026-10-26' },
 ];
 assert.deepEqual(ids(queryDiaries(rows, { filter: 'shared', sort: 'title' })), ['joined', 'owner']);
 assert.deepEqual(ids(queryDiaries(rows, { filter: 'shared', query: '2' })), ['owner']);
 assert.equal(queryDiaries(rows).length, 3);
 assert.deepEqual(ids(queryDiaries(rows, { filter: 'favorite', sort: 'title' })), ['private', 'owner']);
 assert.deepEqual(queryDiaries([rows[0]], { filter: 'shared' }), []);
});

// 보관함 필터 = 범위(왼쪽 메뉴: 내 · 공유된 다이어리) + 즐겨찾기 칩. 예전 값 'all' · 'favorite' 도 그대로 읽는다.
import { filterFavorite, filterScope, withFavorite } from '../src/diary/utils/libraryQuery.js';
import { memberLibraryQuery, normalizeMemberLibraryQuery } from '../src/diary/services/memberLibraryQuery.js';
import { libraryRequest } from '../src/diary/services/libraryReader.js';
const scoped = [
 { id: 'mine', title: '내 기록', createdAt: '2026-10-20' },
 { id: 'mine-star', title: '내 별', createdAt: '2026-10-21', favorite: true },
 { id: 'shared', title: '같이 쓰기', createdAt: '2026-10-22', sharedDiaryId: 's1' },
 { id: 'shared-star', title: '같이 별', createdAt: '2026-10-23', isShared: true, favorite: true },
];
test('필터 값은 범위와 즐겨찾기로 나뉘고 예전 값(all · favorite)은 범위 없는 전체로 읽는다', () => {
 const cases = [
  ['personal', 'personal', false], ['personal:favorite', 'personal', true], ['shared', 'shared', false], ['shared:favorite', 'shared', true],
  ['all', 'all', false], ['favorite', 'all', true], [undefined, 'all', false],
 ];
 for (const [filter, scope, favorite] of cases) {
  assert.equal(filterScope(filter), scope, String(filter));
  assert.equal(filterFavorite(filter), favorite, String(filter));
 }
});
test('즐겨찾기 칩을 켜고 꺼도 범위는 그대로이고, 예전 값은 예전 값끼리 오간다', () => {
 assert.equal(withFavorite('personal', true), 'personal:favorite');
 assert.equal(withFavorite('personal:favorite', false), 'personal');
 assert.equal(withFavorite('shared', true), 'shared:favorite');
 assert.equal(withFavorite('shared:favorite', false), 'shared');
 assert.equal(withFavorite('all', true), 'favorite');
 assert.equal(withFavorite('favorite', false), 'all');
});
test('범위 · 즐겨찾기 조합마다 해당 다이어리만 남는다(예전 값 포함)', () => {
 const pick = filter => ids(queryDiaries(scoped, { filter, sort: 'created' }));
 assert.deepEqual(pick('personal'), ['mine-star', 'mine']);
 assert.deepEqual(pick('personal:favorite'), ['mine-star']);
 assert.deepEqual(pick('shared'), ['shared-star', 'shared']);
 assert.deepEqual(pick('shared:favorite'), ['shared-star']);
 assert.deepEqual(pick('all'), ['shared-star', 'shared', 'mine-star', 'mine']);
 assert.deepEqual(pick('favorite'), ['shared-star', 'mine-star']);
});
test('회원 목록 조회는 범위를 filter, 즐겨찾기를 favorite 으로 나눠 보내고 서버 검증을 통과한다', () => {
 const cases = [
  ['personal', 'personal', false], ['personal:favorite', 'personal', true], ['shared:favorite', 'shared', true],
  ['all', 'all', false], ['favorite', 'all', true],
 ];
 for (const [filter, scope, favorite] of cases) {
  const query = memberLibraryQuery({ filter });
  assert.equal(query.filter, scope, filter);
  assert.equal(query.favorite, favorite, filter);
  assert.deepEqual(normalizeMemberLibraryQuery(query), query);
 }
});
test('보관함 목록 요청은 즐겨찾기 조합에서만 favorite 을 붙인다', () => {
 for (const filter of ['personal:favorite', 'shared:favorite', 'favorite']) assert.equal(libraryRequest({ filter }).favorite, true, filter);
 for (const filter of ['personal', 'shared', 'all']) assert.equal('favorite' in libraryRequest({ filter }), false, filter);
});
