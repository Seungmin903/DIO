import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createInitialState, editorReducer, getCurrentPage } from '../src/editor/state/editorReducer.js';
import * as session from '../src/editor/services/sessionDocuments.js';
import * as common from '../src/editor/utils/common.js';
import * as collaboration from '../src/collaboration/collaborationReducer.js';
import { memberDocumentKey } from '../src/diary/services/memberStorage.js';
import { purgeTrashedDiary } from '../src/diary/utils/trashRetention.js';

const require = createRequire(import.meta.url);
const expo = createRequire(require.resolve('expo/package.json'));
const compile = (name) => expo('@babel/core').transformSync(
  readFileSync(new URL(name, import.meta.url), 'utf8'),
  { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] },
).code;
function viewStore(disk = new Map(), overrides = {}) {
  const calls = [];
  const mocks = {
    './sessionDocuments.js': session,
    './storage': {
      loadJSON: async (key, fallback) => disk.has(key) ? JSON.parse(disk.get(key)) : fallback,
      saveJSON: async (key, value) => { calls.push([key, value]); disk.set(key, JSON.stringify(value)); return true; },
      removeJSON: async (key) => { disk.delete(key); return true; },
      ...overrides,
    },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compile('../src/editor/services/editorViewState.js'))(
    (id) => mocks[id], mod, mod.exports,
  );
  return { ...mod.exports, disk, calls };
}
const doc = { id: 'a', updatedAt: '2026-10-01', pages: [
  { id: 'p1', objects: [] }, { id: 'p2', objects: [] }, { id: 'p3', objects: [] },
] };

test('다이어리별 열람 페이지를 기억하고 새 실행에서도 별도 키에서 복원한다', async () => {
  const store = viewStore();
  await store.rememberViewedPage('doc:a', 'p3');
  await store.rememberViewedPage('doc:b', 'p2');
  assert.equal(store.peekViewedPage('doc:a'), 'p3');
  const restarted = viewStore(store.disk);
  assert.equal(restarted.peekViewedPage('doc:a'), undefined);
  assert.equal(await restarted.loadViewedPage('doc:a'), 'p3');
  assert.equal(await restarted.loadViewedPage('doc:b'), 'p2');
  assert.equal(store.disk.has('doc:a'), false); // 열람은 원본 문서를 저장하지 않는다.
});

test('삭제된 페이지·손상된 기록·기록 없는 문서는 첫 페이지로 복원한다', async () => {
  assert.equal(createInitialState(doc, 'deleted').pageId, 'p1');
  assert.equal(createInitialState(doc).pageId, 'p1');
  const store = viewStore(new Map([['dio:editor:view:v1:doc:a', JSON.stringify({ invalid: true })]]));
  assert.equal(await store.loadViewedPage('doc:a'), null);
  const loaded = editorReducer(createInitialState(doc), { type: 'load', doc, pageId: 'p3' });
  assert.equal(loaded.pageId, 'p3');
  assert.deepEqual(loaded.past, []);
});

test('보기만 한 페이지를 기록하며 문서 수정 시각·내용·Undo 이력을 바꾸지 않는다', () => {
  const first = createInitialState(doc, 'p2');
  const next = editorReducer(first, { type: 'selectPage', id: 'p3' });
  assert.equal(next.pageId, 'p3');
  assert.equal(next.doc, doc);
  assert.equal(next.doc.updatedAt, '2026-10-01');
  assert.deepEqual(next.past, []);
  assert.deepEqual(next.future, []);
  const deleted = editorReducer(next, { type: 'removePages', ids: ['p3'] });
  assert.notEqual(getCurrentPage(deleted).id, 'p3');
});

test('늦게 도착한 저장소 읽기가 최근 열람 위치를 덮어쓰지 않는다', async () => {
  let resolve;
  const store = viewStore(new Map(), { loadJSON: () => new Promise((r) => { resolve = r; }) });
  const pending = store.loadViewedPage('doc:a');
  await store.rememberViewedPage('doc:a', 'p3');
  resolve('p1');
  assert.equal(await pending, 'p3');
});

test('빠른 페이지 이동 저장을 직렬화하고 실패 후 같은 페이지 저장을 재시도한다', async () => {
  let release;
  const writes = [];
  const store = viewStore(new Map(), { saveJSON: async (_, id) => {
    writes.push(id);
    if (writes.length === 1) await new Promise((r) => { release = r; });
    return writes.length !== 1;
  } });
  const first = store.rememberViewedPage('doc:a', 'p2');
  const last = store.rememberViewedPage('doc:a', 'p3');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(writes, ['p2']);
  assert.equal(store.peekViewedPage('doc:a'), 'p3');
  release();
  assert.equal(await first, false);
  await last;
  await store.rememberViewedPage('doc:a', 'p3');
  assert.deepEqual(writes, ['p2', 'p3', 'p3']);
});

test('임시 공유 문서 위치는 기기에 쓰지 않고 참여 해제·로그아웃 시 함께 제거한다', async () => {
  const store = viewStore();
  const owner = session.createSessionDocuments();
  const key = owner.key('shared');
  await store.rememberViewedPage(key, 'p2');
  assert.equal(await store.loadViewedPage(key), 'p2');
  owner.release('shared');
  assert.equal(store.peekViewedPage(key), null);
  assert.equal(await store.rememberViewedPage(key, 'p3'), false);
  const next = owner.key('shared');
  assert.equal(store.peekViewedPage(next), null);
  await store.rememberViewedPage(next, 'p1');
  owner.dispose();
  assert.equal(store.peekViewedPage(next), null);
  assert.deepEqual(store.calls, []);
  assert.equal(store.disk.size, 0);
});

function editorHook({ cached = true, viewed, store, diary = { id: 'a' } }) {
  const key = memberDocumentKey(diary) ?? 'doc:a';
  const slots = [], effects = [], documentSaves = [];
  let cursor = 0;
  const same = (a, b) => a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (v) => { slots[i].value = v; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useReducer(reducer, arg, init) {
      const i = cursor++;
      slots[i] ??= { value: init(arg) };
      return [slots[i].value, (action) => { slots[i].value = reducer(slots[i].value, action); }];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const mocks = {
    react,
    '../../collaboration/collaborationReducer.js': collaboration,
    '../utils/common.js': common,
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    '../state/defaultDoc': { createDefaultDoc: () => ({ ...doc, pages: [doc.pages[0]] }) },
    '../state/editorReducer': { createInitialState, editorReducer },
    '../services/editorDocs': {
      editorDocKey: () => key, peekEditorDoc: () => cached ? { doc } : null,
      openEditorDoc: async () => ({ doc, pendingIds: [] }),
      loadEditorPages: async () => [],
      rememberEditorDoc: (_, value) => documentSaves.push(value),
      saveEditorDoc: async () => true,
    },
    '../services/editorViewState': {
      peekViewedPage: () => viewed,
      loadViewedPage: () => store.loadViewedPage(key),
      rememberViewedPage: store.rememberViewedPage,
    },
    '../services/mediaStore': { hydrateMedia: async () => {} },
    '../utils/idleTask': {},
    '../utils/pageHydrator.js': { createPageHydrator: () => ({ start() {}, stop() {}, prioritize() {} }) },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compile('../src/editor/hooks/useEditor.js'))(
    (id) => mocks[id], mod, mod.exports,
  );
  return {
    render() {
      cursor = 0;
      const result = mod.exports.useEditor(diary);
      effects.splice(0).forEach((fn) => fn());
      return result;
    },
    documentSaves,
    unmount() { slots.forEach((slot) => slot.cleanup?.()); },
  };
}

test('다이어리 탭 재진입은 편집하지 않고 마지막으로 본 페이지를 초기 화면으로 사용한다', async () => {
  const store = viewStore();
  const first = editorHook({ store, viewed: 'p2' });
  assert.equal(first.render().state.pageId, 'p2');
  first.render().dispatch({ type: 'selectPage', id: 'p3' });
  first.render();
  first.unmount();
  const reopened = editorHook({ store, viewed: store.peekViewedPage('doc:a') });
  assert.equal(reopened.render().state.pageId, 'p3');
  assert.equal(reopened.render().saveStatus, 'saved');
  assert.deepEqual(first.documentSaves, []);
  assert.deepEqual(reopened.documentSaves, []);
  reopened.unmount();
});

for (const cached of [true, false]) test(`비동기 열람 복원 전 첫 페이지를 덮어쓰지 않는다 (문서 캐시=${cached})`, async () => {
  let resolve;
  const store = viewStore(new Map(), { loadJSON: () => new Promise((r) => { resolve = r; }) });
  const hook = editorHook({ store, cached, viewed: undefined });
  assert.equal(hook.render().loaded, false);
  assert.equal(store.calls.length, 0);
  await new Promise((r) => setImmediate(r));
  resolve('p3');
  await new Promise((r) => setImmediate(r));
  const loaded = hook.render();
  assert.equal(loaded.loaded, true);
  assert.equal(loaded.state.pageId, 'p3');
  assert.deepEqual(hook.documentSaves, []);
  await new Promise((r) => setImmediate(r));
  assert.equal(store.disk.get('dio:editor:view:v1:doc:a'), '"p3"');
  hook.unmount();
});

test('열람 읽기 reject는 첫 페이지로 대체하고 문서 편집 저장을 막지 않는다', async () => {
  const store = viewStore(new Map(), { loadJSON: async () => { throw Error('read'); } });
  const hook = editorHook({ store, viewed: undefined });
  hook.render();
  await new Promise((r) => setImmediate(r));
  const loaded = hook.render();
  assert.equal(loaded.loaded, true);
  assert.equal(loaded.state.pageId, 'p1');
  loaded.dispatch({ type: 'renameDoc', title: '편집 가능' });
  hook.render();
  assert.equal(hook.documentSaves[0].title, '편집 가능');
  hook.unmount();
});

test('쓰기 reject를 false로 반환하고 대기 중 다음 쓰기는 계속 수행한다', async () => {
  const seen = [];
  const store = viewStore(new Map(), { saveJSON: async (_, id) => {
    seen.push(id);
    if (id === 'p2') throw Error('write');
    return true;
  } });
  const first = store.rememberViewedPage('doc:a', 'p2');
  const next = store.rememberViewedPage('doc:a', 'p3');
  assert.equal(await first, false);
  assert.equal(await next, true);
  assert.deepEqual(seen, ['p2', 'p3']);
});

test('진행 중인 쓰기 뒤에 영구 삭제하며 늦은 읽기가 캐시를 복구하지 않는다', async () => {
  let resolveRead, releaseWrite;
  const disk = new Map();
  const store = viewStore(disk, {
    loadJSON: () => new Promise((r) => { resolveRead = r; }),
    saveJSON: async (key, id) => {
      await new Promise((r) => { releaseWrite = r; });
      disk.set(key, JSON.stringify(id));
      return true;
    },
  });
  const read = store.loadViewedPage('doc:a');
  await new Promise((r) => setImmediate(r));
  const write = store.rememberViewedPage('doc:a', 'p3');
  await new Promise((r) => setImmediate(r));
  const removed = store.forgetViewedPage('doc:a');
  resolveRead('p2');
  assert.equal(await read, null);
  releaseWrite();
  await write;
  assert.equal(await removed, true);
  assert.equal(store.peekViewedPage('doc:a'), undefined);
  assert.equal(disk.size, 0);
});

test('영구 삭제는 열람 기록 삭제까지 기다리고 실패하면 삭제 표식을 유지해 재시도한다', async () => {
  let diaries = [{ id: 'a', trashedAt: '2026-10-01' }];
  const store = viewStore();
  await store.rememberViewedPage('doc:a', 'p3');
  store.disk.set('doc:a', JSON.stringify(doc));
  const storage = {
    setItem: async (k, v) => store.disk.set(k, v),
    getItem: async (k) => store.disk.get(k),
    getAllKeys: async () => [...store.disk.keys()],
    multiGet: async (ks) => ks.map((k) => [k, store.disk.get(k)]),
    removeItem: async (k) => store.disk.delete(k),
  };
  const args = { id: 'a', storage, keys: { doc: 'doc', diaries: 'diaries' },
    getDiaries: () => diaries, updateDiaries: (fn) => { diaries = fn(diaries); },
    collectMediaIds: () => [], removeMedia: async () => {}, forgetDoc() {}, forgetView: async () => false };
  assert.equal(await purgeTrashedDiary(args), false);
  assert.equal(diaries[0].purgePending, true);
  assert.equal(store.disk.has('doc:a'), true);
  assert.equal(await purgeTrashedDiary({ ...args, forgetView: store.forgetViewedPage }), true);
  assert.equal(store.disk.has('dio:editor:view:v1:doc:a'), false);
  assert.equal(store.peekViewedPage('doc:a'), undefined);
  assert.deepEqual(diaries, []);
});

test('열람 캐시는 상한을 넘으면 디스크에서 다시 읽어 복원한다', async () => {
  const store = viewStore();
  for (let i = 0; i < 130; i++) await store.rememberViewedPage(`doc:${i}`, 'p2');
  assert.equal(store.peekViewedPage('doc:0'), undefined);
  assert.equal(await store.loadViewedPage('doc:0'), 'p2');
});


test('회원 계정별 실제 문서 키로 열람 위치를 복원하며 다른 계정과 비회원 위치를 섞지 않는다', async () => {
  const store = viewStore();
  const first = { id: 'a', source: 'member-api', memberAccountId: '1' };
  const second = { ...first, memberAccountId: '2' };
  const key = memberDocumentKey(first);
  await store.rememberViewedPage(key, 'p3');
  await store.rememberViewedPage('doc:a', 'p2');
  const restarted = viewStore(store.disk);
  const hook = editorHook({ store: restarted, diary: first, viewed: undefined });
  hook.render(); await new Promise(r => setImmediate(r));
  assert.equal(hook.render().state.pageId, 'p3');
  assert.deepEqual(hook.documentSaves, []);
  hook.unmount();
  const other = editorHook({ store: restarted, diary: second, viewed: undefined });
  other.render(); await new Promise(r => setImmediate(r));
  assert.equal(other.render().state.pageId, 'p1');
  assert.equal(await restarted.loadViewedPage('doc:a'), 'p2');
  assert.deepEqual(other.documentSaves, []);
  other.unmount();
});
