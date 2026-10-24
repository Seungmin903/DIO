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
