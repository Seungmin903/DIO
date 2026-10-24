import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiaryApi, createHttpTransport } from '../src/diary/services/diaryApi.js';
import { createMockDiaryTransport } from '../src/diary/services/mockDiaryTransport.js';
import { createDiaryMutation, createDiaryCommand } from '../src/diary/services/diaryMutation.js';
const setup = () => {
  const mock = createMockDiaryTransport({ delay: 0 });
  const api = createDiaryApi(mock.transport);
  return { mock, api, mutation: createDiaryMutation(createDiaryCommand(api)) };
};
const creation = () => ({ kind: 'create', values: { title: '새 기록', color: '#CED9EE', initialPages: [{ templateId: 'mock-template' }] } });
test('같은 프레임 중복 저장을 차단하고 실패 후 원래 입력과 요청 키로 재시도한다', async () => {
  const calls = []; let reject;
  const mutation = createDiaryMutation((input, options) => {
    calls.push({ input, options });
    if (calls.length === 1) return new Promise((_, no) => { reject = no; });
    return input;
  });
  const input = creation();
  const first = mutation.run(input), duplicate = mutation.run(creation());
  assert.equal(first, duplicate);
  input.values.title = '나중에 바꾼 제목';
  await Promise.resolve();
  reject(Object.assign(new Error('offline'), { status: 503 }));
  await first;
  assert.equal(mutation.getSnapshot().status, 'error');
  await mutation.retry();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[1].input.values.title, '새 기록');
});
test('목 생성→수정→휴지통→복원과 정상 목록/휴지통 분리', async () => {
  const { api, mutation } = setup();
  await mutation.run(creation());
  const created = mutation.getSnapshot().result;
  assert.equal(created.pageCount, 1);
  await mutation.run({ kind: 'update', id: created.id, values: { ...created, title: '수정 제목' } });
  assert.equal((await api.get(created.id)).title, '수정 제목');
  await mutation.run({ kind: 'trash', ids: [created.id, created.id] });
  assert.deepEqual(mutation.getSnapshot().result.succeeded, [created.id]);
  assert.equal((await api.list()).items.some(row => row.id === created.id), false);
  assert.equal((await api.list({ query: { status: 'trashed' } })).items.length, 1);
  await mutation.run({ kind: 'restore', ids: [created.id] });
  assert.equal((await api.list()).items.length, 3);
  assert.equal((await api.list({ query: { status: 'trashed' } })).items.length, 0);
});
test('서버 처리 후 응답 유실을 재시도해도 중복 생성하지 않는다', async () => {
  const { mock, api, mutation } = setup(); mock.setWriteScenario('response-lost');
  await mutation.run(creation());
  assert.equal(mutation.getSnapshot().status, 'error');
  assert.equal((await api.list()).items.length, 3);
  await mutation.retry();
  assert.equal(mutation.getSnapshot().status, 'success');
  assert.equal((await api.list()).items.length, 3);
});
test('부분 실패 재시도는 실패 ID만 보내고 성공 결과를 누적한다', async () => {
  const { mock, api } = setup(); const calls = [];
  const mutation = createDiaryMutation(createDiaryCommand({ ...api, trash: (id, options) => { calls.push(id); return api.trash(id, options); } }));
  mock.setWriteScenario('partial');
  await mutation.run({ kind: 'trash', ids: ['mock-travel', 'mock-shared'] });
  assert.equal(mutation.getSnapshot().status, 'partial');
  assert.deepEqual(mutation.getSnapshot().result.succeeded, ['mock-travel']);
  mock.setWriteScenario('success'); await mutation.retry();
  assert.deepEqual(calls, ['mock-travel', 'mock-shared', 'mock-shared']);
  assert.equal(mutation.getSnapshot().status, 'success');
  assert.equal(mutation.getSnapshot().result.succeeded.length, 2);
});
test('재시도 불가능한 부분 실패는 다른 항목 재시도 후에도 사라지지 않는다', async () => {
  let attempt = 0;
  const mutation = createDiaryMutation(createDiaryCommand({ trash: async id => {
    if (id === 'denied') throw Object.assign(new Error('권한'), { status: 403 });
    if (attempt++ === 0) throw Object.assign(new Error('일시 오류'), { status: 503 });
  } }));
  await mutation.run({ kind: 'trash', ids: ['denied', 'temporary'] });
  await mutation.retry();
  assert.equal(mutation.getSnapshot().status, 'partial');
  assert.equal(mutation.getSnapshot().canRetry, false);
  assert.deepEqual(mutation.getSnapshot().result.failed.map(row => row.id), ['denied']);
});
test('권한·충돌·만료 오류에는 자동 또는 단순 재시도를 허용하지 않는다', async () => {
  for (const mode of ['forbidden', 'conflict', 'expired']) {
    const { mock, mutation } = setup(); mock.setWriteScenario(mode);
    await mutation.run(creation());
    assert.equal(mutation.getSnapshot().status, 'error');
    assert.equal(mutation.getSnapshot().canRetry, false);
    await mutation.retry();
    assert.equal(mutation.getSnapshot().status, 'error');
  }
});
test('이전 버전 수정은 원본 제목을 덮어쓰지 않는다', async () => {
  const { api } = setup();
  await assert.rejects(api.update('mock-travel', { title: '덮어쓰기', version: '0' }), { status: 409 });
  assert.equal((await api.get('mock-travel')).title, '여행 기록');
});
test('reset 이후 늦은 저장 응답은 화면 상태에 반영하지 않는다', async () => {
  let finish;
  const mutation = createDiaryMutation(() => new Promise(resolve => { finish = resolve; }));
  const pending = mutation.run(creation()); await Promise.resolve(); mutation.reset();
  finish({ id: 'late' }); await pending;
  assert.equal(mutation.getSnapshot().status, 'idle');
});
test('HTTP 쓰기 경계는 JSON·메서드·요청 키를 전달하고 204를 처리한다', async () => {
  let received;
  const transport = createHttpTransport({ baseUrl: 'https://example.test/api/v1', getAccessToken: async () => 'token', fetchImpl: async (url, init) => {
    received = { url, init }; return { ok: true, status: 204, json: async () => { throw new Error('empty'); } };
  } });
  assert.equal(await transport({ path: '/diaries/id', method: 'DELETE', requestId: 'operation-1' }), null);
  assert.equal(received.init.headers['Idempotency-Key'], 'operation-1');
  assert.equal(received.init.method, 'DELETE');
  await transport({ path: '/diaries/id', method: 'PATCH', body: { diaryTitle: '제목' } });
  assert.equal(received.init.body, JSON.stringify({ diaryTitle: '제목' }));
});
test('서로 다른 목 인스턴스는 데이터를 공유하지 않는다', async () => {
  const first = setup(), second = setup();
  await first.mutation.run(creation());
  assert.equal((await second.api.list()).items.length, 2);
});

test('영구 삭제 실패 시 항목 유지, 재시도 성공 후 상세 제거', async () => {
  const { api, mock, mutation } = setup();
  await assert.rejects(api.permanentlyDelete('mock-travel'), { status: 409 });
  await api.trash('mock-travel'); mock.setWriteScenario('fail-once');
  await mutation.run({ kind: 'permanentlyDelete', ids: ['mock-travel'] });
  assert.equal(mutation.getSnapshot().status, 'partial');
  assert.equal((await api.list({ query: { status: 'trashed' } })).items.length, 1);
  await mutation.retry(); assert.equal(mutation.getSnapshot().status, 'success');
  await assert.rejects(api.get('mock-travel'), { status: 404 });
});
test('서버 30일 경계 만료·복원 차단·정리 후 재조회', async () => {
  const mock = createMockDiaryTransport({ delay: 0, now: () => Date.parse('2026-01-01T00:00:00Z') });
  const api = createDiaryApi(mock.transport); await api.trash('mock-travel');
  mock.advanceServerTime(30 * 86400000 - 1);
  assert.equal((await api.get('mock-travel')).canRestore, true);
  mock.advanceServerTime(1);
  assert.equal((await api.get('mock-travel')).retentionStatus, 'EXPIRED');
  assert.equal((await api.get('mock-travel')).canRestore, false);
  await assert.rejects(api.restore('mock-travel'), { status: 410 });
  assert.equal((await api.list({ query: { status: 'trashed' } })).items.length, 1);
  mock.purgeExpired();
  assert.equal((await api.list({ query: { status: 'trashed' } })).items.length, 0);
  assert.equal((await api.list()).items.length, 1);
});
test('영구 삭제 응답 유실 후 같은 키 재시도와 DELETE 종류 구분', async () => {
  const { api, mock, mutation } = setup();
  await api.trash('mock-travel', { requestId: 'same' });
  await api.permanentlyDelete('mock-travel', { requestId: 'same' });
  await assert.rejects(api.get('mock-travel'), { status: 404 });
  await api.trash('mock-shared'); mock.setWriteScenario('response-lost');
  await mutation.run({ kind: 'permanentlyDelete', ids: ['mock-shared'] });
  assert.equal(mutation.getSnapshot().status, 'partial');
  await mutation.retry(); assert.equal(mutation.getSnapshot().status, 'success');
});
test('이미 삭제된 항목의 404는 성공으로 오인하거나 재시도하지 않는다', async () => {
  const { api, mutation } = setup(); await api.trash('mock-travel'); await api.permanentlyDelete('mock-travel');
  await mutation.run({ kind: 'permanentlyDelete', ids: ['mock-travel'] });
  assert.equal(mutation.getSnapshot().canRetry, false);
  assert.equal(mutation.getSnapshot().result.failed[0].error.status, 404);
});

test('응답 유실 후 닫기·다시 열기에서도 입력/키를 보존하고 새 생성을 막는다', async () => {
  const { api, mock, mutation } = setup();
  mock.setWriteScenario('response-lost'); await mutation.run(creation());
  const pending = mutation.getPendingInput(); mutation.dismiss();
  assert.deepEqual(mutation.getPendingInput(), pending);
  pending.values.title = '외부 수정';
  assert.equal(mutation.getPendingInput().values.title, '새 기록');
  mock.setWriteScenario('success');
  await mutation.run({ ...creation(), values: { title: '다른 새 요청' } });
  assert.equal(mutation.getSnapshot().status, 'error');
  await mutation.retry();
  assert.equal(mutation.getSnapshot().status, 'success');
  assert.equal((await api.list()).items.filter(row => row.title === '새 기록').length, 1);
  assert.equal((await api.list()).items.some(row => row.title === '다른 새 요청'), false);
  mutation.dismiss(); assert.equal(mutation.getPendingInput(), null);
  await mutation.run(creation()); assert.equal((await api.list()).items.length, 4);
});
test('일괄 요청 reset 후 이미 전송한 요청이 끝나도 다음 ID를 보내지 않는다', async () => {
  const calls = []; let finish; let firstSignal;
  const mutation = createDiaryMutation(createDiaryCommand({ trash: async (id, options) => {
    calls.push(id); firstSignal = options.signal;
    if (id === 'first') await new Promise(resolve => { finish = resolve; });
  } }));
  const pending = mutation.run({ kind: 'trash', ids: ['first', 'second'] });
  await Promise.resolve(); mutation.reset();
  assert.equal(firstSignal.aborted, true);
  finish(); await pending;
  assert.deepEqual(calls, ['first']); assert.equal(mutation.getSnapshot().status, 'idle');
  await mutation.run({ kind: 'trash', ids: ['new-session'] });
  assert.deepEqual(calls, ['first', 'new-session']);
});
test('일괄 요청 실행 전에 reset하면 첫 요청도 전송하지 않는다', async () => {
  const calls = [];
  const mutation = createDiaryMutation(createDiaryCommand({ restore: async id => calls.push(id) }));
  const pending = mutation.run({ kind: 'restore', ids: ['one', 'two'] });
  mutation.reset(); await pending;
  assert.deepEqual(calls, []);
});
test('수정 응답 ID가 다르면 성공 상태로 반영하지 않는다', async () => {
  const api = createDiaryApi(async () => ({ diary: { diaryId: 'other', diaryTitle: '다른 기록' } }));
  await assert.rejects(api.update('requested', { title: '수정' }), { code: 'INVALID_RESPONSE' });
  const mutation = createDiaryMutation(createDiaryCommand(api));
  await mutation.run({ kind: 'update', id: 'requested', values: { title: '수정' } });
  assert.equal(mutation.getSnapshot().status, 'error'); assert.equal(mutation.getSnapshot().result, null);
});
test('토큰을 기다리는 동안 취소한 HTTP 요청은 fetch하지 않는다', async () => {
  let tokenReady; let fetched = false; const controller = new AbortController();
  const transport = createHttpTransport({ baseUrl: '', getAccessToken: () => new Promise(resolve => { tokenReady = resolve; }), fetchImpl: async () => { fetched = true; } });
  const pending = transport({ path: '/diaries', method: 'POST', signal: controller.signal });
  controller.abort(); tokenReady('next-account-token');
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(fetched, false);
});
