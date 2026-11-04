import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createMemberAppStore } from '../src/diary/services/memberAppStore.js';
import { memberKeys } from '../src/diary/services/memberStorage.js';
import { canLeaveForInvitation } from '../src/notifications/editorInvitationGuard.js';

// App의 실제 이동 콜백을 실행한다. 네이티브 UI·문서 준비만 경계에서 대체한다.
const require = createRequire(import.meta.url);
const expo = createRequire(require.resolve('expo/package.json'));
const source = readFileSync(new URL('../App.js', import.meta.url), 'utf8');
const ast = expo('@babel/core').parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const app = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'DiaryAppContent');
function callback(name, context) {
  const declaration = app.body.body.flatMap(node => node.type === 'VariableDeclaration' ? node.declarations : [])
    .find(node => node.id.name === name);
  assert.ok(declaration, `App callback ${name}`);
  return new Function(...Object.keys(context), `return (${source.slice(declaration.init.start, declaration.init.end)})`)(...Object.values(context));
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const id = '11111111-1111-4111-8111-111111111111';
const page = { id: '22222222-2222-4222-8222-222222222222', canvasWidth: 800, canvasHeight: 1000,
  objects: [{ id: 'real-text', type: 'text', text: '서버에서 저장한 기록' }] };
const remote = { id, title: '함께 쓰는 기록', myRole: 'EDITOR', canEdit: false, visibility: 'PRIVATE',
  permissions: { canEditCanvas: true, canEditMetadata: false, canTrash: false } };
async function memberFixture({ pages = [page], get, loadPages } = {}) {
  const values = new Map(), calls = [];
  const storage = { getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
  const api = { list: async options => { calls.push(['list', options]); return { items: [], hasNext: false, nextCursor: null }; },
    get: get || (async target => { assert.equal(target, id); return remote; }),
    loadPages: loadPages || (async target => { calls.push(['pages', target]); return pages; }) };
  const store = createMemberAppStore({ accountId: '101', api, storage, serverLibrary: true });
  await store.load();
  return { store, values, calls, storage, api };
}
function navigation(store, { guard = () => true, safety = async () => true, prepare = async () => {} , member = true, library = [] } = {}) {
  const events = [], opening = { current: null }, invitationLeaveGuard = { current: guard };
  const context = { useCallback: fn => fn, member, diaryState: { store }, opening, invitationLeaveGuard,
    sharedLibraryRef: { current: library }, safety: { canOpenDiary: async diary => { events.push(['safety', diary]); return safety(diary); } },
    rememberEditorDoc: (_key, doc) => events.push(['document', doc]), editorDocKey: diary => diary.id,
    prepareEditor: prepare, wait: async () => {}, EDITOR_PREPARE_LIMIT_MS: 10,
    setEditorOrientation: value => events.push(['orientation', value]), setActive: value => events.push(['active', value]),
    setTabIds: fn => events.push(['tabs', fn([])]), setPage: value => events.push(['page', value]),
    setSharingRequest: value => events.push(['sharing', value]), notify: (...args) => events.push(['notice', ...args]) };
  context.enterEditor = callback('enterEditor', context);
  return { open: callback('openSharedDiary', context), events, opening, invitationLeaveGuard };
}

test('목록에 없는 수락 다이어리는 실제 서버 페이지와 편집자 권한으로 열고 검색 조건을 보존한다', async () => {
  const f = await memberFixture();
  await assert.rejects(f.store.refresh(id), { code: 'UNKNOWN_MEMBER_DIARY' });
  assert.equal(f.store.getSnapshot().diaries.length, 0);
  await f.store.queryLibrary({ q: '다른 제목', filter: 'personal', favorite: true });
  const criteria = f.store.getSnapshot().library.criteria;
  const ui = navigation(f.store);
  assert.equal(await ui.open(id), true);
  assert.equal(ui.events.find(row => row[0] === 'document')[1].pages[0].objects[0].text, page.objects[0].text);
  const active = ui.events.find(row => row[0] === 'active')[1];
  assert.equal(active.source, 'member-api'); assert.equal(active.myRole, 'EDITOR');
  assert.equal(active.isShared, true); assert.equal(active.canManage, false);
  assert.equal(active.permissions.canEditCanvas, true); assert.equal(active.permissions.canEditMetadata, false);
  assert.deepEqual(f.store.getSnapshot().library.criteria, criteria);
  assert.ok(ui.events.some(row => row[0] === 'sharing' && row[1] === null));
  assert.equal(f.calls.filter(row => row[0] === 'pages').length, 1);
  // 재시작 후 계정별 기존 문서를 재사용하고 서버 상세 권한은 다시 확인한다.
  const restarted = createMemberAppStore({ accountId: '101', api: f.api, storage: f.storage, serverLibrary: true });
  await restarted.load(); await restarted.open(id);
  assert.equal(f.calls.filter(row => row[0] === 'pages').length, 1);
  restarted.dispose(); f.store.dispose();
});

test('일반 refresh는 목록의 공유 표시를 보존하고 open에서만 편집자 공유 표시를 보정한다', async () => {
  const f = await memberFixture();
  f.api.list = async () => ({ items: [{ ...remote, isShared: false }], hasNext: false, nextCursor: null });
  await f.store.reload();
  const refreshed = await f.store.refresh(id);
  assert.equal(refreshed.myRole, 'EDITOR');
  assert.equal(refreshed.isShared, false);
  assert.equal(refreshed.type, '개인');
  const opened = await f.store.open(id);
  assert.equal(opened.diary.isShared, true);
  assert.equal(opened.diary.type, '공유');
  assert.equal(opened.diary.permissions.canEditMetadata, false);
  f.store.dispose();
});

test('저장 중·편집 중 이탈을 막고 저장 완료 후에만 열며 차단 경고 취소도 이동하지 않는다', async () => {
  const f = await memberFixture(); let saveStatus = 'saving', editing = false;
  const ui = navigation(f.store, { guard: () => canLeaveForInvitation({ loaded: true, saveStatus, editing }) });
  await assert.rejects(ui.open(id), /입력·자르기와 저장을 마친 뒤/);
  assert.equal(ui.events.length, 0);
  saveStatus = 'saved'; editing = true;
  await assert.rejects(ui.open(id), /입력·자르기와 저장을 마친 뒤/); assert.equal(ui.events.length, 0);
  editing = false;
  const cancelled = navigation(f.store, { safety: async () => false });
  assert.equal(await cancelled.open(id), false);
  assert.ok(!cancelled.events.some(row => row[0] === 'document' || row[0] === 'sharing'));
  assert.equal(await ui.open(id), true); f.store.dispose();
});

test('페이지 로딩 도중 새 편집이 시작되면 알림 패널을 닫거나 현재 편집기를 바꾸지 않는다', async () => {
  const loading = deferred(); let safe = true;
  const f = await memberFixture({ loadPages: async () => { await loading.promise; return [page]; } });
  const ui = navigation(f.store, { guard: () => safe });
  const pending = ui.open(id); safe = false; loading.resolve();
  await assert.rejects(pending, /입력·자르기와 저장을 마친 뒤/);
  assert.ok(!ui.events.some(row => ['active', 'page', 'sharing'].includes(row[0])));
  f.store.dispose();
});

test('권한 해제·서버 실패·빈 페이지는 빈 로컬 문서로 대체하지 않고 다시 열 수 있다', async () => {
  for (const status of [403, 404, 503]) {
    let failed = true;
    const f = await memberFixture({ get: async () => { if (failed) throw Object.assign(new Error('다이어리에 접근할 수 없어요.'), { status }); return remote; } });
    const ui = navigation(f.store);
    assert.equal(await ui.open(id), false);
    assert.equal(f.values.has(memberKeys('101').doc(id)), false);
    assert.ok(!ui.events.some(row => row[0] === 'sharing' || row[0] === 'active'));
    failed = false; assert.equal(await ui.open(id), true); f.store.dispose();
  }
  const f = await memberFixture({ pages: [] }), ui = navigation(f.store);
  assert.equal(await ui.open(id), false);
  assert.equal(f.values.has(memberKeys('101').doc(id)), false); f.store.dispose();
});

test('계정 교체·화면 해제 후 늦은 응답은 편집기와 저장 문서를 바꾸지 않는다', async () => {
  const loading = deferred(), started = deferred();
  const f = await memberFixture({ loadPages: async () => { started.resolve(); await loading.promise; return [page]; } });
  const ui = navigation(f.store), pending = ui.open(id);
  await started.promise; ui.opening.current = null; f.store.dispose(); loading.resolve();
  assert.equal(await pending, false);
  assert.equal(f.values.has(memberKeys('101').doc(id)), false);
  assert.ok(!ui.events.some(row => ['active', 'page', 'sharing'].includes(row[0])));
});

test('미리보기 공유 문서의 기존 열기 경로는 회원 API를 호출하지 않는다', async () => {
  const diary = { id: 'preview-entry', sharedDiaryId: 'preview' };
  const ui = navigation({ open: () => { throw new Error('회원 API 호출 금지'); } }, { member: false, library: [diary] });
  assert.equal(await ui.open('preview'), true);
  assert.equal(ui.events.find(row => row[0] === 'active')[1], diary);
});

test('이탈 차단·안전 확인 취소는 보관함을 갱신하지 않고 성공 후 갱신 오류는 안내한다', async () => {
  let reloads = 0;
  const store = { open: async () => ({ diary: remote, doc: { id, pages: [page] } }),
    reload: async () => { reloads++; throw new Error('목록 연결 실패'); } };
  await assert.rejects(navigation(store, { guard: () => false }).open(id), /입력·자르기와 저장을 마친 뒤/);
  assert.equal(await navigation(store, { safety: async () => false }).open(id), false);
  assert.equal(reloads, 0);
  const ui = navigation(store);
  assert.equal(await ui.open(id), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reloads, 1);
  assert.ok(ui.events.some(row => row[0] === 'notice' && row[1] === '공유 목록을 확인하지 못했어요'));
  assert.ok(ui.events.some(row => row[0] === 'page' && row[1] === 'editor'));
});
