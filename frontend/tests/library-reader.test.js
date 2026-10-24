import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryReader, libraryRequest } from '../src/diary/services/libraryReader.js';
import { createDiaryApi } from '../src/diary/services/diaryApi.js';
import { createMockDiaryTransport } from '../src/diary/services/mockDiaryTransport.js';

const fixture = () => {
  const mock = createMockDiaryTransport({ delay: 0 });
  const calls = [];
  const api = createDiaryApi(options => { calls.push(options); return mock.transport(options); });
  return { mock, calls, reader: createLibraryReader(api) };
};

test('보관함 조건을 API 검색·정렬·즐겨찾기 query로 전달하고 목 서버 결과를 받는다', async () => {
  assert.deepEqual(libraryRequest({ query: ' 여행 ', filter: 'favorite', sort: 'pages' }), {
    status: 'active', q: '여행', sort: 'pageCountDesc', favorite: true,
  });
  const { reader, calls } = fixture();
  await reader.load({ query: '여행', sort: 'title' });
  assert.deepEqual(reader.getSnapshot().list.data.items.map(row => row.title), ['여행 기록']);
  assert.equal(calls[0].query.q, '여행');
  assert.equal(calls[0].query.sort, 'titleAsc');
  await reader.load({ filter: 'favorite' });
  assert.deepEqual(reader.getSnapshot().list.data.items, []);
  reader.dispose();
});

test('검색 조건이 바뀌면 이전 결과·상세를 즉시 비우고 실패를 빈 성공으로 표시하지 않는다', async () => {
  const { reader, mock } = fixture();
  await reader.load({}); await reader.open('mock-travel');
  mock.setScenario('error');
  const pending = reader.load({ query: '다른 검색' });
  assert.equal(reader.getSnapshot().list.data, null);
  assert.equal(reader.getSnapshot().selectedId, null);
  assert.equal(reader.getSnapshot().detail.data, null);
  await pending;
  assert.equal(reader.getSnapshot().list.status, 'error');
  mock.setScenario('success'); await reader.refresh();
  assert.equal(reader.getSnapshot().list.status, 'success');
  assert.deepEqual(reader.getSnapshot().list.data.items, []);
  reader.dispose();
});

test('같은 조건 새로고침 실패는 기존 결과를 유지하고 재시도도 같은 조건을 사용한다', async () => {
  const { reader, mock, calls } = fixture();
  await reader.load({ query: '여행', sort: 'created' });
  mock.setScenario('error'); await reader.refresh();
  assert.equal(reader.getSnapshot().list.status, 'error');
  assert.equal(reader.getSnapshot().list.data.items[0].id, 'mock-travel');
  mock.setScenario('success'); await reader.refresh();
  assert.equal(calls.at(-1).query.q, '여행');
  assert.equal(calls.at(-1).query.sort, 'createdAtDesc');
  reader.dispose();
});

test('새 상세는 이전 제목을 노출하지 않고 오류·닫기·빠른 전환에 늦은 응답을 반영하지 않는다', async () => {
  const pending = [];
  const reader = createLibraryReader({ list: async () => ({ items: [] }), get: id => new Promise(resolve => pending.push({ id, resolve })) });
  const a = reader.open('a'), b = reader.open('b');
  assert.equal(reader.getSnapshot().detail.data, null);
  pending[0].resolve({ id: 'a', title: '이전' }); await a;
  assert.equal(reader.getSnapshot().detail.data, null);
  reader.close(); pending[1].resolve({ id: 'b', title: '닫힌 상세' }); await b;
  assert.equal(reader.getSnapshot().detail.data, null);
  assert.equal(reader.getSnapshot().selectedId, null);
  reader.dispose();
});

test('계정 경계에서 이전 요청을 취소하고 새 인스턴스에는 이전 계정 결과가 없다', async () => {
  let finish, signal;
  const a = createLibraryReader({ list: options => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); }, get() {} });
  const pending = a.load({}); a.dispose();
  assert.equal(signal.aborted, true);
  const b = fixture().reader;
  assert.equal(b.getSnapshot().list.data, null);
  finish({ items: [{ id: 'other-account' }] }); await pending;
  assert.equal(a.getSnapshot().list.data, null);
  assert.equal(b.getSnapshot().list.data, null);
  b.dispose();
});

test('StrictMode 효과 재설정 뒤에도 구독·조회가 다시 동작한다', async () => {
  const { reader } = fixture();
  reader.dispose(); reader.activate();
  await reader.load({});
  assert.equal(reader.getSnapshot().list.status, 'success');
  reader.dispose();
});

for (const action of ['close', 'open', 'filter', 'dispose']) {
  test(`저장 후 재조회 중 ${action}이면 늦은 자동 상세 진입을 취소한다`, async () => {
    let finish;
    const reader = createLibraryReader({ list: () => new Promise(resolve => { finish = resolve; }), get: async id => ({ id }) });
    const pending = reader.refreshAndOpen('saved');
    const completeSaved = finish;
    if (action === 'close') reader.close();
    if (action === 'open') await reader.open('other');
    if (action === 'filter') { const changed = reader.load({ query: 'new' }); finish({ items: [] }); await changed; }
    if (action === 'dispose') { reader.dispose(); reader.activate(); }
    completeSaved({ items: [] }); await pending;
    assert.equal(reader.getSnapshot().selectedId, action === 'open' ? 'other' : null);
    reader.dispose();
  });
}
test('화면 이동이 없으면 저장 후 재조회와 상세 진입을 완료한다', async () => {
  const { reader } = fixture(); await reader.load({});
  await reader.refreshAndOpen('mock-travel');
  assert.equal(reader.getSnapshot().selectedId, 'mock-travel');
  assert.equal(reader.getSnapshot().detail.data.title, '여행 기록'); reader.dispose();
});
