import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createSharingApi, isSharingDiaryId } from '../src/sharing/sharingApi.js';

// Execute the actual App effect and return-to-library callback with controlled React setters.
const source = readFileSync(new URL('../App.js', import.meta.url), 'utf8');
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const ast = expo('@babel/core').parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const component = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'DiaryAppContent');
const effect = component.body.body.find(node => node.type === 'ExpressionStatement'
  && node.expression.callee?.name === 'useEffect'
  && source.slice(node.expression.arguments[0].start, node.expression.arguments[0].end).includes('sharing.runtime.watchDiary')).expression.arguments[0];
const returnHome = component.body.body.flatMap(node => node.declarations || [])
  .find(node => node.id.name === 'returnToLibrary').init.arguments[0];
const bind = (node, scope) => new Function(...Object.keys(scope), `return (${source.slice(node.start, node.end)});`)(...Object.values(scope));
const diaryId = '11111111-1111-4111-8111-111111111111';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('목록이나 로그인 안내로 복귀 콜백이 바뀌어도 참여자 감시를 재시작하지 않는다', () => {
  const dependencies = component.body.body.find(node => node.expression?.arguments?.[0] === effect).expression.arguments[1];
  const scope = { member: true, active: { id: diaryId }, sharing: { runtime: {} }, diaryState: { store: {} }, returnToLibrary: () => {} };
  const before = bind(dependencies, scope);
  scope.returnToLibrary = () => {};
  const after = bind(dependencies, scope);
  assert.equal(before.length, after.length);
  before.forEach((value, index) => assert.equal(value, after[index]));
});

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
  const goHome = bind(returnHome, { returnDiaryId, active: state.active, member: true,
    visibleDiaries: [], librarySort: 'created', libraryMetadata: {}, DEFAULT_FILTER: 'all',
    setFilter: set('filter'), setMemberSearchOpen: set('searchOpen'), setMemberSearch: set('search'),
    setCarousel: set('carousel'), setPage: set('page') });
  const cleanup = bind(effect, { active: state.active, member, sharing: { runtime },
    diaryState: { store: { reload: () => { reloads++; return reloadFails ? Promise.reject(Error('offline')) : Promise.resolve(); } } },
    isSharingDiaryId, opening, returnDiaryId, returnToLibraryRef: { current: goHome },
    setTabIds: set('tabs'), setActive: set('active'), setSharingRequest: set('sharingRequest'),
    notify: (title, message) => notices.push({ title, message }) })();
  await flush();
  return { state, notices, runtime, timers, opening, returnDiaryId,
    reloads: () => reloads, queries: () => queries, deny: value => { failure = value; },
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
    app.callback('stale callback', { status: 403 });
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
