import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as retention from '../src/diary/utils/trashRetention.js';
import * as library from '../src/diary/utils/diaryLibrary.js';
import { collectMediaIds } from '../src/editor/utils/mediaReferences.js';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/hooks/useDiaries.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
});
const keys = { diaries: 'diaries', doc: 'doc', customDecor: 'decor' };
const base = Date.parse('2026-10-21T03:00:00Z');
const item = (id, age) => ({ id, title: id, trashedAt: age === null ? null : new Date(base - age).toISOString() });

function fixture(t, initial, { failedRead = false, failedDelete = false, failedWrite = false } = {}) {
  let now = base;
  t.mock.method(Date, 'now', () => now);
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const slots = [], effects = [], listeners = new Set(), intervals = new Set();
  let cursor = 0, dirty = false, value;
  const data = new Map([[keys.diaries, JSON.stringify(initial)], ...initial.map(d => [`doc:${d.id}`, JSON.stringify({ title: d.title, pages: [{ objects: [] }] })])]);
  const storage = {
    async getItem(k) { if (failedRead) throw Error('read'); return data.get(k) ?? null; },
    async getAllKeys() { return [...data.keys()]; },
    async multiGet(ks) { return ks.map(k => [k, data.get(k) ?? null]); },
    async setItem(k, v) { data.set(k, v); },
    async removeItem(k) { if (failedDelete) throw Error('delete'); data.delete(k); },
  };
  const same = (a, b) => a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initialValue) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; dirty = true; }];
    },
    useRef(initialValue) { const i = cursor++; return (slots[i] ??= { current: initialValue }); },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps, cleanup: previous?.cleanup }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const appState = { currentState: 'active', addEventListener(_, fn) { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const load = id => {
    if (id === 'react') return react;
    if (id === 'react-native') return { AppState: appState };
    if (id.endsWith('/documentStorage')) return { __esModule: true, default: storage };
    if (id.endsWith('/storage')) return { STORAGE_KEYS: keys, saveJSON: async (k, v) => { if (failedWrite) return false; await storage.setItem(k, JSON.stringify(v)); return true; } };
    if (id.endsWith('/editorDocs')) return { forgetEditorDoc() {} };
    if (id.endsWith('/editorViewState')) return { forgetViewedPage: async () => true };
    if (id.endsWith('/mediaReferences')) return { collectMediaIds };
    if (id.endsWith('/mediaRepository')) return { remove: async () => {} };
    if (id.endsWith('/pdfSource')) return { collectPdfSourceIds: () => [] };
    if (id.endsWith('/pdfSourceStore')) return { removePdfSource: async () => {} };
    if (id.endsWith('/pdfImportRegistry')) return { sweepPdfImports: async () => null };
    if (id.endsWith('/diaryLibrary')) return library;
    if (id.endsWith('/trashRetention')) return retention;
    throw Error(id);
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'Date', 'setInterval', 'clearInterval', code)(load, module, module.exports, Clock,
    fn => { intervals.add(fn); return fn; }, fn => intervals.delete(fn));
  function render() { cursor = 0; dirty = false; value = module.exports.useDiaries(); while (effects.length) effects.shift()(); }
  async function flush() { for (let i = 0; i < 12; i++) { if (dirty) render(); await new Promise(resolve => setImmediate(resolve)); } if (dirty) render(); }
  render();
  t.after(() => slots.forEach(slot => slot?.cleanup?.()));
  return { data, flush, get hook() { return value; }, setNow: n => { now = n; }, resume() { listeners.forEach(fn => fn('active')); }, tick() { intervals.forEach(fn => fn()); } };
}

test('시작 시 30일 만료 항목만 삭제하고 1ms 남은 항목은 앱 복귀 시 정리한다', async t => {
  const f = fixture(t, [item('expired', retention.TRASH_RETENTION_MS), item('near', retention.TRASH_RETENTION_MS - 1), item('live', null)]);
  await f.flush();
  assert.deepEqual(f.hook.diaries.map(d => d.id), ['near', 'live']);
  assert.equal(f.data.has('doc:expired'), false);
  f.setNow(base + 1); f.resume(); await f.flush();
  assert.deepEqual(f.hook.diaries.map(d => d.id), ['live']);
  assert.equal(f.data.has('doc:near'), false);
});

test('복원 후 다시 휴지통으로 이동하면 새 기한을 사용하고 중복 이동은 기한을 연장하지 않는다', async t => {
  const f = fixture(t, [item('a', 1000)]); await f.flush();
  assert.equal(f.hook.restoreFromTrash('a'), true); await f.flush();
  f.hook.moveToTrash('a'); await f.flush();
  const first = f.hook.diaries[0].trashedAt;
  f.setNow(base + 10000); f.hook.moveToTrash('a'); await f.flush();
  assert.equal(f.hook.diaries[0].trashedAt, first);
  f.setNow(base + retention.TRASH_RETENTION_MS);
  assert.equal(f.hook.restoreFromTrash('a'), false);
  f.tick(); await f.flush();
  assert.equal(f.hook.diaries.length, 0);
});

test('자동 삭제 실패는 휴지통에 남기고 오류를 안내하며 삭제 중 표식의 복원을 막는다', async t => {
  const f = fixture(t, [item('a', retention.TRASH_RETENTION_MS)], { failedDelete: true }); await f.flush();
  assert.equal(f.hook.diaries[0].purgePending, true);
  assert.match(f.hook.trashError, /정리하지 못했어요/);
  assert.equal(f.hook.restoreFromTrash('a'), false);
  assert.ok(f.data.has('doc:a'));
});

test('읽기 실패 시 기존 목록과 편집 문서를 덮어쓰거나 자동 삭제하지 않는다', async t => {
  const f = fixture(t, [item('a', retention.TRASH_RETENTION_MS)], { failedRead: true });
  const original = f.data.get('diaries'); await f.flush();
  assert.equal(f.data.get('diaries'), original);
  assert.equal(f.data.has('doc:a'), true);
});

test('자동 정리와 새 다이어리 저장은 같은 큐를 사용해 서로의 목록 변경을 보존한다', async t => {
  const f = fixture(t, [item('old', retention.TRASH_RETENTION_MS - 1)]); await f.flush();
  f.setNow(base + 1);
  const cleanup = f.hook.cleanupTrash();
  const adding = f.hook.addDiary(item('new', null));
  assert.equal(await adding, true); await cleanup; await f.flush();
  assert.deepEqual(f.hook.diaries.map(d => d.id), ['new']);
  assert.deepEqual(JSON.parse(f.data.get('diaries')).map(d => d.id), ['new']);
});

test('기한 전에 복원한 다이어리는 이전 만료 시각이 지나도 삭제하지 않는다', async t => {
  const f = fixture(t, [item('a', retention.TRASH_RETENTION_MS - 1)]); await f.flush();
  assert.equal(f.hook.restoreFromTrash('a'), true); await f.flush();
  f.setNow(base + retention.TRASH_RETENTION_MS); f.resume(); f.tick(); await f.flush();
  assert.equal(f.hook.diaries[0].trashedAt, null);
  assert.equal(f.data.has('doc:a'), true);
});

test('여러 다이어리를 한 번에 휴지통으로 옮기면 고른 항목만 같은 삭제 시각으로 저장하고 30일 정리를 따른다', async t => {
  const f = fixture(t, [item('a', null), item('b', null), item('c', null), item('old', 1000)]); await f.flush();
  const oldTrashedAt = f.hook.diaries.find(d => d.id === 'old').trashedAt;
  assert.equal(await f.hook.moveManyToTrash(['a', 'c', 'old', 'missing']), true); await f.flush();
  const byId = Object.fromEntries(f.hook.diaries.map(d => [d.id, d.trashedAt]));
  assert.equal(byId.a, new Date(base).toISOString());
  assert.equal(byId.c, byId.a);
  assert.equal(byId.b, null);
  assert.equal(byId.old, oldTrashedAt, '이미 휴지통에 있던 항목은 기한을 늘리지 않는다');
  assert.deepEqual(JSON.parse(f.data.get('diaries')).filter(d => d.trashedAt).map(d => d.id).sort(), ['a', 'c', 'old']);
  assert.ok(f.data.has('doc:a') && f.data.has('doc:b') && f.data.has('doc:c'), '휴지통 이동은 편집 문서를 지우지 않는다');
  assert.equal(f.hook.restoreFromTrash('a'), true); await f.flush();
  f.setNow(base + retention.TRASH_RETENTION_MS); f.tick(); await f.flush();
  assert.deepEqual(f.hook.diaries.map(d => d.id).sort(), ['a', 'b']);
  assert.equal(f.data.has('doc:c'), false);
});

test('일괄 이동 저장에 실패하면 목록을 바꾸지 않고 실패를 알린다', async t => {
  const f = fixture(t, [item('a', null), item('b', null)], { failedWrite: true }); await f.flush();
  const before = f.data.get('diaries');
  assert.equal(await f.hook.moveManyToTrash(['a']), false); await f.flush();
  assert.deepEqual(f.hook.diaries.map(d => d.trashedAt), [null, null]);
  assert.equal(f.data.get('diaries'), before);
  assert.equal(await f.hook.moveManyToTrash([]), false);
});

test('저장소를 읽지 못한 실행에서는 일괄 이동을 저장하지 않는다', async t => {
  const f = fixture(t, [item('a', null)], { failedRead: true }); await f.flush();
  const before = f.data.get('diaries');
  assert.equal(await f.hook.moveManyToTrash(['a']), false);
  assert.equal(f.data.get('diaries'), before);
});
