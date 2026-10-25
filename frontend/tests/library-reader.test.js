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

function pagedFixture() {
  const mock = createMockDiaryTransport({ delay: 0 }); mock.setPagination(true);
  const calls = [];
  const api = createDiaryApi(request => { calls.push(request); return mock.transport(request); });
  return { mock, calls, api, reader: createLibraryReader(api) };
}

test('목 보관함은 두 개씩 세 페이지를 합치고 끝에서는 요청하지 않는다', async () => {
  const { reader, calls } = pagedFixture();
  await reader.load({ sort: 'title' });
  assert.equal(reader.getSnapshot().list.data.items.length, 2);
  await reader.open(reader.getSnapshot().list.data.items[0].id);
  const selected = reader.getSnapshot().selectedId;
  await reader.loadMore(); assert.equal(reader.getSnapshot().list.data.items.length, 4);
  assert.equal(reader.getSnapshot().selectedId, selected);
  await reader.loadMore(); assert.equal(reader.getSnapshot().list.data.items.length, 6);
  assert.equal(reader.getSnapshot().list.data.hasNext, false);
  assert.equal(reader.getSnapshot().list.data.nextCursor, null);
  const count = calls.length; await reader.loadMore(); assert.equal(calls.length, count);
  assert.equal(new Set(reader.getSnapshot().list.data.items.map(row => row.id)).size, 6);
  reader.dispose();
});

test('더 보기 중 연타는 한 요청이며 실패 후 같은 커서·검색·정렬로 재시도한다', async () => {
  const { reader, mock, calls } = pagedFixture();
  await reader.load({ query: '페이지', sort: 'title' });
  const before = reader.getSnapshot().list.data;
  mock.setMoreScenario('fail-once');
  const a = reader.loadMore(); const b = reader.loadMore();
  assert.equal(reader.getSnapshot().more.status, 'loading');
  assert.equal(reader.getSnapshot().list.data, before);
  await Promise.all([a, b]);
  assert.equal(calls.filter(row => row.query.cursor).length, 1);
  assert.equal(reader.getSnapshot().more.status, 'error');
  assert.equal(reader.getSnapshot().list.data, before);
  await reader.loadMore();
  assert.deepEqual(calls.at(-1).query, calls.at(-2).query);
  assert.equal(reader.getSnapshot().list.data.items.length, 4);
  reader.dispose();
});

test('더 보기 후 첫 페이지 재조회 실패는 전체 결과·커서를 보존하고 성공 후 첫 페이지로 돌아간다', async () => {
  const { reader, mock } = pagedFixture(); await reader.load({}); await reader.loadMore();
  const before = reader.getSnapshot().list.data;
  mock.setScenario('fail-once'); const refreshing = reader.refresh();
  assert.equal(reader.getSnapshot().list.data, before); await refreshing;
  assert.equal(reader.getSnapshot().list.status, 'error'); assert.equal(reader.getSnapshot().list.data, before);
  await reader.loadMore(); assert.equal(reader.getSnapshot().list.data, before);
  await reader.refresh(); assert.equal(reader.getSnapshot().list.data.items.length, 2);
  await reader.loadMore(); assert.equal(reader.getSnapshot().list.data.items.length, 4);
  reader.dispose();
});

test('검색·정렬·필터를 바꾸면 상세·전체 결과·커서를 초기화한다', async () => {
  const { reader } = pagedFixture();
  for (const input of [{ query: '페이지' }, { sort: 'pages' }, { filter: 'favorite' }]) {
    await reader.load({}); await reader.loadMore(); await reader.open('mock-travel');
    const request = reader.load(input);
    assert.equal(reader.getSnapshot().list.data, null);
    assert.equal(reader.getSnapshot().selectedId, null);
    assert.equal(reader.getSnapshot().more.status, 'idle');
    await request;
    assert.equal(reader.getSnapshot().list.data.items.length, 2);
  }
  reader.dispose();
});

for (const transition of ['refresh', 'query', 'dispose']) {
  test(`더 보기 중 ${transition}이면 취소를 무시한 늦은 응답도 섞이지 않는다`, async () => {
    let resolveMore, oldSignal;
    const reader = createLibraryReader({
      list: async request => {
        if (request.query.cursor) { oldSignal = request.signal; return new Promise(resolve => { resolveMore = resolve; }); }
        return { items: [{ id: request.query.q || 'first' }], hasNext: true, nextCursor: 'opaque-next' };
      }, get: async id => ({ id }),
    });
    await reader.load({}); const more = reader.loadMore();
    if (transition === 'refresh') await reader.refresh();
    if (transition === 'query') await reader.load({ query: 'new' });
    if (transition === 'dispose') { reader.dispose(); reader.activate(); }
    assert.equal(oldSignal.aborted, true);
    resolveMore({ items: [{ id: 'old-account-or-query' }], hasNext: false, nextCursor: null }); await more;
    assert.deepEqual(reader.getSnapshot().list.data?.items.map(row => row.id) || [], transition === 'dispose' ? [] : [transition === 'query' ? 'new' : 'first']);
    assert.equal(reader.getSnapshot().more.status, 'idle'); reader.dispose();
  });
}

test('페이지 경계 중복 ID는 하나로 합치고 최신 값으로 갱신한다', async () => {
  let n = 0;
  const reader = createLibraryReader({ list: async () => ++n === 1
    ? { items: [{ id: 'a', title: 'old' }, { id: 'b' }], hasNext: true, nextCursor: 'token' }
    : { items: [{ id: 'a', title: 'new' }, { id: 'c' }], hasNext: false, nextCursor: null } });
  await reader.load({}); await reader.loadMore();
  assert.deepEqual(reader.getSnapshot().list.data.items.map(row => row.id), ['a', 'b', 'c']);
  assert.equal(reader.getSnapshot().list.data.items[0].title, 'new'); reader.dispose();
});

test('빈 마지막 페이지도 종료 커서를 반영하고 기존 결과를 유지한다', async () => {
  let n = 0;
  const reader = createLibraryReader({ list: async () => ++n === 1
    ? { items: [{ id: 'a' }], hasNext: true, nextCursor: 'token' }
    : { items: [], hasNext: false, nextCursor: null } });
  await reader.load({}); await reader.loadMore(); await reader.loadMore();
  assert.equal(n, 2); assert.equal(reader.getSnapshot().list.data.items.length, 1);
  assert.equal(reader.getSnapshot().list.data.nextCursor, null); reader.dispose();
});

test('반복 커서는 오류로 표시하며 새로고침으로 회복할 수 있다', async () => {
  const reader = createLibraryReader({ list: async () => ({ items: [{ id: 'a' }], hasNext: true, nextCursor: 'same' }) });
  await reader.load({}); await reader.loadMore();
  assert.equal(reader.getSnapshot().more.error.code, 'INVALID_RESPONSE');
  assert.equal(reader.getSnapshot().list.data.items.length, 1);
  await reader.refresh(); assert.equal(reader.getSnapshot().more.status, 'idle'); reader.dispose();
});

test('목 커서는 다른 검색 조건에서 사용할 수 없고 휴지통은 기존 단일 페이지를 유지한다', async () => {
  const { api, reader } = pagedFixture(); await reader.load({});
  await assert.rejects(api.list({ query: { status: 'active', q: '다른 검색', cursor: reader.getSnapshot().list.data.nextCursor } }), { code: 'INVALID_CURSOR' });
  for (const row of reader.getSnapshot().list.data.items) await api.trash(row.id);
  const trash = await api.list({ query: { status: 'trashed' } });
  assert.equal(trash.items.length, 2); assert.equal(trash.hasNext, false); reader.dispose();
});

test('무효 커서는 같은 값으로 재요청하지 않고 첫 페이지 복구 후 정상 이어받는다', async () => {
  const { reader, mock, calls } = pagedFixture(); await reader.load({ query: '페이지', sort: 'title' });
  const before = reader.getSnapshot().list.data;
  mock.invalidateCursors(); await reader.loadMore();
  assert.equal(reader.getSnapshot().moreRequiresRefresh, true);
  assert.equal(reader.getSnapshot().list.data, before);
  const count = calls.length; await reader.loadMore(); assert.equal(calls.length, count);
  await reader.retryMore();
  assert.equal(calls.at(-1).query.cursor, undefined);
  assert.equal(calls.at(-1).query.q, '페이지'); assert.equal(calls.at(-1).query.sort, 'titleAsc');
  assert.equal(reader.getSnapshot().moreRequiresRefresh, false);
  assert.notEqual(reader.getSnapshot().list.data.nextCursor, before.nextCursor);
  await reader.loadMore(); assert.equal(reader.getSnapshot().list.data.items.length, 4); reader.dispose();
});

test('무효 커서의 첫 페이지 복구 실패는 기존 결과를 유지하며 다시 복구할 수 있다', async () => {
  const { reader, mock } = pagedFixture(); await reader.load({}); await reader.loadMore();
  const before = reader.getSnapshot().list.data;
  mock.invalidateCursors(); await reader.loadMore(); mock.setScenario('fail-once');
  await reader.retryMore();
  assert.equal(reader.getSnapshot().list.status, 'error');
  assert.equal(reader.getSnapshot().list.data, before);
  await reader.refresh(); assert.equal(reader.getSnapshot().list.data.items.length, 2); reader.dispose();
});

test('일시적인 더 보기 실패는 복구 대신 동일 커서로 재시도한다', async () => {
  const { reader, mock, calls } = pagedFixture(); await reader.load({});
  mock.setMoreScenario('fail-once'); await reader.loadMore();
  assert.equal(reader.getSnapshot().moreRequiresRefresh, false);
  const cursor = calls.at(-1).query.cursor; await reader.retryMore();
  assert.equal(calls.at(-1).query.cursor, cursor);
  assert.equal(reader.getSnapshot().list.data.items.length, 4); reader.dispose();
});
