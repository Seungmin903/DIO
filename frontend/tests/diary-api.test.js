import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiaryApi, createHttpTransport, toDiary } from '../src/diary/services/diaryApi.js';
import { createDiaryQuery } from '../src/diary/services/diaryQuery.js';
import { createMockDiaryTransport } from '../src/diary/services/mockDiaryTransport.js';

test('문자열 ID와 개인 상태를 화면 모델로 변환하며 원본 DTO를 변경하지 않는다', () => {
  const dto = { diaryId: '9007199254740993', diaryTitle: '기록', coverPattern: 'LINEN', myMembership: { isFavorite: true }, deletedAt: null };
  assert.equal(toDiary(dto).id, '9007199254740993');
  assert.equal(toDiary(dto).favorite, true);
  assert.equal(toDiary(dto).pattern, 'linen');
  assert.equal(dto.coverPattern, 'LINEN');
  assert.throws(() => toDiary({ diaryId: 1 }), { code: 'INVALID_RESPONSE' });
});
test('목 목록·상세·빈 목록과 응답 복사', async () => {
  const mock = createMockDiaryTransport({ delay: 0 });
  const api = createDiaryApi(mock.transport);
  const first = await api.list();
  first.items[0].title = '변경';
  assert.equal((await api.get(first.items[0].id)).title, '여행 기록');
  mock.setScenario('empty');
  assert.deepEqual((await api.list()).items, []);
  mock.setScenario('not-found');
  await assert.rejects(api.get('mock-travel'), { status: 404 });
});
test('첫 조회 실패는 빈 성공으로 바뀌지 않고 재시도로 복구된다', async () => {
  const mock = createMockDiaryTransport({ delay: 0, scenario: 'fail-once' });
  const api = createDiaryApi(mock.transport);
  const query = createDiaryQuery(api.list);
  const request = query.run();
  assert.equal(query.getSnapshot().status, 'loading');
  await request;
  assert.equal(query.getSnapshot().status, 'error');
  assert.equal(query.getSnapshot().data, null);
  await query.retry();
  assert.equal(query.getSnapshot().status, 'success');
  assert.equal(query.getSnapshot().data.items.length, 2);
});
test('재조회 실패에도 기존 목록을 유지하며 다시 성공하면 오류를 제거한다', async () => {
  const mock = createMockDiaryTransport({ delay: 0 });
  const query = createDiaryQuery(createDiaryApi(mock.transport).list);
  await query.run();
  const previous = query.getSnapshot().data;
  mock.setScenario('error');
  await query.run();
  assert.equal(query.getSnapshot().data, previous);
  assert.equal(query.getSnapshot().status, 'error');
  mock.setScenario('success');
  await query.retry();
  assert.equal(query.getSnapshot().error, null);
});
test('상세 재시도는 같은 ID를 사용한다', async () => {
  const mock = createMockDiaryTransport({ delay: 0, scenario: 'fail-once' });
  const query = createDiaryQuery(createDiaryApi(mock.transport).get);
  await query.run('mock-shared');
  await query.retry();
  assert.equal(query.getSnapshot().data.id, 'mock-shared');
});
test('늦게 도착한 이전 응답과 초기화 이전 응답을 버린다', async () => {
  const pending = [];
  const query = createDiaryQuery(value => new Promise(resolve => pending.push(() => resolve(value))));
  const old = query.run('old');
  const fresh = query.run('fresh');
  pending[1](); await fresh;
  pending[0](); await old;
  assert.equal(query.getSnapshot().data, 'fresh');
  const afterReset = query.run('account-A');
  query.reset(); pending[2](); await afterReset;
  assert.deepEqual(query.getSnapshot(), { status: 'idle', data: null, error: null });
});
test('요청 교체 시 이전 signal 취소와 구독 해제가 동작한다', async () => {
  const signals = [];
  const query = createDiaryQuery(async (options) => { signals.push(options.signal); return []; });
  let notices = 0;
  const unsubscribe = query.subscribe(() => notices++);
  await query.run(); unsubscribe();
  await query.run();
  assert.equal(signals[0].aborted, true);
  assert.equal(notices, 2);
});
test('취소한 목 요청은 성공이나 오류로 화면 상태를 덮어쓰지 않는다', async () => {
  const mock = createMockDiaryTransport({ delay: 30 });
  const query = createDiaryQuery(createDiaryApi(mock.transport).list);
  const request = query.run();
  query.reset();
  await request;
  assert.equal(query.getSnapshot().status, 'idle');
  assert.equal(query.getSnapshot().error, null);
});
test('아직 이어받지 못하는 다음 페이지 응답을 전체 목록으로 오인하지 않는다', async () => {
  await assert.rejects(createDiaryApi(async () => ({ items: [], hasNext: true, nextCursor: 'next' })).list(), { code: 'PAGINATION_NOT_READY' });
});
test('HTTP 경계는 매 요청 최신 토큰을 읽고 쿼리를 인코딩한다', async () => {
  let token = 'one'; const calls = [];
  const transport = createHttpTransport({ baseUrl: 'https://example.test/api/v1/', getAccessToken: async () => token,
    fetchImpl: async (url, options) => { calls.push([url, options]); return { ok: true, json: async () => ({ items: [] }) }; } });
  await transport({ path: '/diaries', query: { q: '여행 & 기록' } });
  token = 'two'; await transport({ path: '/diaries' });
  assert.equal(new URL(calls[0][0]).searchParams.get('q'), '여행 & 기록');
  assert.equal(calls[1][1].headers.Authorization, 'Bearer two');
});
test('401·권한·네트워크·잘못된 응답을 정상 빈 목록과 구분한다', async () => {
  let called = false;
  await assert.rejects(createHttpTransport({ baseUrl: '', getAccessToken: async () => null, fetchImpl: () => { called = true; } })({ path: '/diaries' }), { status: 401 });
  assert.equal(called, false);
  const denied = createHttpTransport({ baseUrl: '', getAccessToken: async () => 'token', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ code: 'DENIED', detail: 'private stack' }) }) });
  await assert.rejects(denied({ path: '/diaries' }), error => error.code === 'DENIED' && !error.message.includes('private stack'));
  const offline = createHttpTransport({ baseUrl: '', getAccessToken: async () => 'token', fetchImpl: async () => { throw new TypeError('offline'); } });
  await assert.rejects(offline({ path: '/diaries' }), { code: 'NETWORK_ERROR' });
  await assert.rejects(createDiaryApi(async () => null).list(), { code: 'INVALID_RESPONSE' });
  await assert.rejects(createDiaryApi(async () => ({ diary: { diaryId: 'other', diaryTitle: '다른 문서' } })).get('requested'), { code: 'INVALID_RESPONSE' });
});

test('조회 조건과 signal을 같은 옵션으로 전달하고 조건 유지 재시도도 취소한다', async () => {
  const calls = [];
  const api = createDiaryApi(async options => { calls.push(options); return { items: [] }; });
  const query = createDiaryQuery(api.list);
  const input = { query: { status: 'trashed', q: '여행' } };
  await query.run(input); assert.ok(calls[0].signal); assert.equal(input.signal, undefined);
  await query.retry(); assert.equal(calls[0].signal.aborted, true);
  assert.deepEqual(calls[1].query, input.query); assert.notEqual(calls[0].signal, calls[1].signal);
  query.reset(); assert.equal(calls[1].signal.aborted, true);
});
test('상세 ID와 별도 옵션을 전달해도 취소 신호를 합친다', async () => {
  let received;
  const query = createDiaryQuery(async (id, options) => { received = { id, options }; return id; });
  await query.run('diary-id', { query: { preview: true } });
  assert.equal(received.id, 'diary-id'); assert.ok(received.options.signal);
  query.cancel(); assert.equal(received.options.signal.aborted, true);
});
