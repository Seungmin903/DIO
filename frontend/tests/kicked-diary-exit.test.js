import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharingApi } from '../src/sharing/sharingApi.js';
import { watchKickedDiaryExit } from '../src/sharing/kickedDiaryExit.js';
import { isDiaryAccessLost } from '../src/sharing/diaryAccessLoss.js';

const diaryId = '11111111-1111-4111-8111-111111111111';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

async function setup({ tabId = diaryId, reloadFails = false, member = true } = {}) {
  let failure = null, deferred = null, reloads = 0, queries = 0, callback;
  const timers = new Map(), notices = [];
  const runtime = createSharingApi({ user: { userId: 10, nickname: '나' }, auth: {
    getConnectionOptions: () => ({ baseUrl: 'https://dio.test/api/v1' }),
    getSessionKey: () => 'test-session', getAccessToken: async () => 'test-token',
  }, setIntervalImpl: fn => { timers.set('poll', fn); return 'poll'; }, clearIntervalImpl: id => timers.delete(id),
  fetchImpl: async url => {
    if (url.endsWith('/members')) {
      queries++;
      if (deferred) return deferred;
      if (failure instanceof Error) throw failure;
      if (failure && typeof failure === 'object') return {
        ...response(failure.body, failure.status),
        ...(failure.html ? { json: async () => { throw new SyntaxError('HTML gateway response'); } } : {}),
      };
      if (failure) return response({ code: failure === 403 ? 'DIARY_ACCESS_DENIED' : 'DIARY_NOT_FOUND' }, failure);
      return response({ members: [{ userId: '10', role: 'EDITOR', nickname: '나' }, { userId: '20', role: 'OWNER', nickname: '친구' }] });
    }
    if (url.includes('/invites?')) return response({ available: false, emailInvites: { items: [], page: 0, hasNext: false } });
    if (url.endsWith(`/member/diaries/${diaryId}`)) return response({ diary: { diaryTitle: '공유 기록', coverColor: '#FFFFFF' } });
    throw Error(`Unexpected request: ${url}`);
  } });
  await runtime.getSharing(diaryId);
  const realWatch = runtime.watchDiary;
  runtime.watchDiary = (id, options) => { callback = options.onUnavailable; return realWatch(id, options); };
  const state = { active: { id: tabId, ...(tabId === diaryId ? {} : { sharedDiaryId: diaryId }) },
    tabs: ['other-diary', tabId, 'another-diary'], page: 'editor', sharingRequest: { mode: 'participants' },
    filter: 'shared', search: '검색', searchOpen: true, carousel: 3 };
  const set = key => value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  const returnDiaryId = { current: tabId }, opening = { current: {} };
  const goHome = () => {
    state.filter = 'all'; state.searchOpen = false; state.search = ''; state.carousel = 0; state.page = 'library';
  };
  const actions = { opening, returnDiaryId, returnToLibrary: goHome,
    reloadLibrary: () => { reloads++; return reloadFails ? Promise.reject(Error('offline')) : Promise.resolve(); },
    setTabIds: set('tabs'), setActive: set('active'), setSharingRequest: set('sharingRequest'),
    notify: (title, message) => notices.push({ title, message }) };
  const cleanup = watchKickedDiaryExit({ member, diary: state.active, runtime, getActions: () => actions });
  await flush();
  return { state, notices, runtime, timers, opening, returnDiaryId,
    updateActions: next => Object.assign(actions, next), reloads: () => reloads, queries: () => queries, deny: value => { failure = value; },
    async tick() { for (const fn of [...timers.values()]) fn(); await flush(); },
    callback: (...args) => callback?.(...args),
    defer() { deferred = new Promise(resolve => { this.resolve = resolve; }); },
    unwatch: () => cleanup?.(), close() { cleanup?.(); runtime.dispose(); } };
}

for (const status of [403, 404]) test(`${status} 확인 시 해당 탭만 닫고 다른 탭 대신 목록으로 이동한다`, async () => {
  const app = await setup();
  try {
    app.deny(status); await app.tick();
    assert.deepEqual(app.state.tabs, ['other-diary', 'another-diary']);
    assert.equal(app.state.active, null);
    assert.equal(app.state.page, 'library');
    assert.equal(app.state.sharingRequest, null);
    assert.equal(app.state.filter, 'all'); assert.equal(app.state.search, ''); assert.equal(app.state.searchOpen, false);
    assert.equal(app.opening.current, null); assert.equal(app.returnDiaryId.current, null);
    assert.equal(app.reloads(), 1); assert.equal(app.notices.length, 1);
    assert.equal(app.runtime.getSnapshot().diaries.length, 0);
    assert.equal(app.runtime.getSnapshot().joined.length, 0);
    assert.equal(app.timers.size, 0);
    app.callback('late duplicate', { status });
    assert.equal(app.reloads(), 1); assert.equal(app.notices.length, 1);
  } finally { app.close(); }
});

test('WebSocket 종료 후 참여자 재조회로 강퇴가 확인되면 즉시 나간다', async () => {
  const app = await setup();
  try {
    app.runtime.setWatchingRealtime(diaryId, true); await flush();
    app.deny(403); app.runtime.setWatchingRealtime(diaryId, false); await flush();
    assert.equal(app.state.page, 'library'); assert.equal(app.state.tabs.includes(diaryId), false);
  } finally { app.close(); }
});

for (const failure of [new TypeError('offline'), Object.assign(Error('timeout'), { name: 'AbortError' }), 500, 503]) {
  test(`${failure instanceof Error ? failure.name : failure} 일시 오류는 탭을 유지하고 복구 뒤 조회를 계속한다`, async () => {
    const app = await setup();
    try {
      app.runtime.setWatchingRealtime(diaryId, true); await flush();
      app.deny(failure); app.runtime.setWatchingRealtime(diaryId, false); await flush();
      assert.equal(app.state.page, 'editor'); assert.equal(app.state.active.id, diaryId);
      assert.equal(app.state.tabs.includes(diaryId), true); assert.equal(app.reloads(), 0);
      assert.equal(app.notices.length, 0); assert.equal(app.timers.size, 1);
      assert.equal(app.runtime.getSnapshot().diaries.length, 1);
      const before = app.queries(); app.deny(null); await app.tick(); await app.tick();
      assert.ok(app.queries() > before); assert.equal(app.state.page, 'editor');
    } finally { app.close(); }
  });
}

test('401 세션 오류를 강퇴로 취급해 탭을 삭제하지 않는다', async () => {
  const app = await setup();
  try {
    app.deny(401); await app.tick();
    assert.equal(app.state.page, 'editor'); assert.equal(app.state.tabs.includes(diaryId), true);
    assert.equal(app.reloads(), 0); assert.equal(app.runtime.getSnapshot().diaries.length, 1);
    assert.equal(app.notices.length, 1);
  } finally { app.close(); }
});

test('탭 전환·언마운트 후 늦게 온 거절 응답은 현재 화면과 캐시를 지우지 않는다', async () => {
  const app = await setup();
  try {
    app.defer(); const tick = app.tick(); app.unwatch();
    app.state.active = { id: 'other-diary' };
    await flush(); app.resolve(response({ code: 'DIARY_ACCESS_DENIED' }, 403)); await tick; await flush();
    app.callback('stale callback', { status: 403, code: 'DIARY_ACCESS_DENIED' });
    assert.equal(app.state.active.id, 'other-diary'); assert.equal(app.state.page, 'editor');
    assert.equal(app.state.tabs.includes(diaryId), true); assert.equal(app.notices.length, 0);
    assert.equal(app.runtime.getSnapshot().diaries.length, 1);
  } finally { app.close(); }
});

test('서버 ID와 다른 로컬 탭 ID도 정확히 닫고 목록 새로고침 실패가 퇴장을 되돌리지 않는다', async () => {
  const app = await setup({ tabId: 'local-tab', reloadFails: true });
  try {
    app.deny(403); await app.tick();
    assert.deepEqual(app.state.tabs, ['other-diary', 'another-diary']);
    assert.equal(app.state.page, 'library'); assert.equal(app.reloads(), 1);
  } finally { app.close(); }
});

test('게스트는 서버 다이어리 감시와 강제 퇴장을 사용하지 않는다', async () => {
  const app = await setup({ member: false });
  try { assert.equal(app.timers.size, 0); assert.equal(app.state.page, 'editor'); }
  finally { app.close(); }
});

for (const failure of [
  { status: 403, body: {} }, { status: 404, body: {} },
  { status: 403, body: { code: 'UPSTREAM_FORBIDDEN' } },
  { status: 404, body: { code: 'ROUTE_NOT_FOUND' } },
  { status: 403, body: { code: 'DIARY_NOT_FOUND' } },
  { status: 404, body: { code: 'DIARY_ACCESS_DENIED' } },
  { status: 403, html: true }, { status: 404, html: true },
]) test(`게이트웨이·무관한·불일치 오류 ${JSON.stringify(failure)}는 탭과 캐시를 유지하고 재시도한다`, async () => {
  const app = await setup();
  try {
    app.deny(failure); await app.tick();
    assert.equal(app.state.page, 'editor'); assert.equal(app.state.tabs.includes(diaryId), true);
    assert.equal(app.runtime.getSnapshot().diaries.length, 1); assert.equal(app.notices.length, 0);
    assert.equal(app.timers.size, 1); assert.equal(app.reloads(), 0);
    app.deny(null); const before = app.queries(); await app.tick(); await app.tick();
    assert.ok(app.queries() > before); assert.equal(app.state.page, 'editor');
  } finally { app.close(); }
});

test('퇴장 처리도 오류 코드 없는 403/404를 다시 방어한다', async () => {
  const app = await setup();
  try {
    for (const status of [403, 404]) app.callback('unknown error', { status });
    assert.equal(app.state.page, 'editor'); assert.equal(app.state.tabs.includes(diaryId), true);
    assert.equal(app.reloads(), 0);
  } finally { app.close(); }
});

test('감시를 다시 시작하지 않고 최신 목록 복귀 콜백을 사용한다', async () => {
  const app = await setup(); let called = 0;
  try {
    const timer = app.timers.get('poll');
    app.updateActions({ returnToLibrary: () => { called++; app.state.page = 'library'; } });
    app.deny(403); await app.tick();
    assert.equal(called, 1); assert.equal(app.state.page, 'library');
    assert.equal(app.queries(), 3); assert.equal(typeof timer, 'function');
  } finally { app.close(); }
});

test('접근 상실 판정은 HTTP 상태와 서버 코드의 정확한 조합만 허용한다', () => {
  assert.equal(isDiaryAccessLost({ status: 403, code: 'DIARY_ACCESS_DENIED' }), true);
  assert.equal(isDiaryAccessLost({ status: 404, code: 'DIARY_NOT_FOUND' }), true);
  for (const error of [null, {}, { status: 503, code: 'DIARY_NOT_FOUND' }, { status: 403 }, { status: 404, code: 'HTTP_ERROR' }])
    assert.equal(isDiaryAccessLost(error), false);
});
