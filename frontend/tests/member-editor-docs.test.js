import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createMemberAppStore } from '../src/diary/services/memberAppStore.js';
import * as memberStorage from '../src/diary/services/memberStorage.js';
import * as session from '../src/editor/services/sessionDocuments.js';
import { createDefaultDoc, migrateUntouchedAnnualDoc } from '../src/editor/state/defaultDoc.js';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const id = '11111111-2222-3333-4444-555555555555', pageId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const row = { id, title: '회원 문서', color: '#123456', canEdit: true, createdAt: '2026-10-27T00:00:00.123456Z', updatedAt: '2026-10-27T00:00:00.123456Z' };
const document = account => ({ id, memberAccountId: account, pages: [{ id: pageId, objects: [] }] });
const edited = account => ({ ...document(account), pages: [{ id: pageId, objects: [{ id: 'new-stroke', type: 'pen' }] }] });
function fixture() {
  const disk = new Map();
  let persist = async (key, value) => { disk.set(key, JSON.stringify(value)); return true; };
  const storage = { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value); }, removeItem: async key => { disk.delete(key); } };
  const mocks = {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    '../../diary/services/memberStorage.js': memberStorage,
    '../state/defaultDoc': { createDefaultDoc, migrateUntouchedAnnualDoc },
    '../templates/catalog.js': { templateReference: () => null }, '../templates/loadTemplate': {}, './mediaStore': {},
    './sessionDocuments.js': session, './editorViewState': { loadViewedPage: async () => null },
    './storage': { STORAGE_KEYS: { doc: 'guest:doc' }, saveJSON: (key, value) => persist(key, value) },
  };
  const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/editorDocs.js', import.meta.url), 'utf8'),
    { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => mocks[name], mod, mod.exports);
  const docs = mod.exports;
  const store = account => createMemberAppStore({ accountId: account, storage, makeRequestId: () => 'member-doc-key',
    api: { list: async () => ({ items: [row], hasNext: false, nextCursor: null }), get: async () => row } });
  const reopen = async current => {
    const opened = await current.open(id);
    // Use the exact disk-to-cache hand-off used by member App.enterEditor.
    docs.rememberEditorDoc(docs.editorDocKey(opened.diary), opened.doc, { overwrite: false });
    return docs.peekEditorDoc(docs.editorDocKey(opened.diary)).doc;
  };
  return { disk, docs, store, reopen, persistWith: fn => { persist = fn; } };
}

test('회원 문서 저장 중 재진입은 오래된 디스크 응답으로 최신 필기 캐시를 덮어쓰지 않는다', async () => {
  const f = fixture(), key = memberStorage.memberKeys('101').doc(id), current = f.store('101');
  f.disk.set(key, JSON.stringify(document('101'))); await current.load();
  const latest = edited('101'); f.docs.rememberEditorDoc(key, latest);
  let release;
  f.persistWith((k, value) => new Promise(resolve => { release = () => { f.disk.set(k, JSON.stringify(value)); resolve(true); }; }));
  const saving = f.docs.saveEditorDoc(key, latest);
  assert.equal((await f.reopen(current)).pages[0].objects[0]?.id, 'new-stroke');
  release(); await saving;
  assert.equal(f.docs.peekEditorDoc(key).doc, latest);
  assert.equal(JSON.parse(f.disk.get(key)).pages[0].objects[0].id, 'new-stroke');
});

test('회원 문서 저장 실패 후에도 재진입 시 메모리의 미저장 필기를 보존하고 다시 저장할 수 있다', async () => {
  const f = fixture(), key = memberStorage.memberKeys('101').doc(id), current = f.store('101');
  f.disk.set(key, JSON.stringify(document('101'))); await current.load();
  const latest = edited('101'); f.docs.rememberEditorDoc(key, latest);
  f.persistWith(async () => false); assert.equal(await f.docs.saveEditorDoc(key, latest), false);
  assert.equal((await f.reopen(current)).pages[0].objects[0]?.id, 'new-stroke');
  assert.equal(JSON.parse(f.disk.get(key)).pages[0].objects.length, 0);
  f.persistWith(async (k, value) => { f.disk.set(k, JSON.stringify(value)); return true; });
  assert.equal(await f.docs.saveEditorDoc(key, f.docs.peekEditorDoc(key).doc), true);
  assert.equal(JSON.parse(f.disk.get(key)).pages[0].objects[0].id, 'new-stroke');
});

test('캐시가 없거나 문서 없음으로 미리 읽었을 때는 실제 서버 ID의 기기 문서를 기억한다', async () => {
  for (const negative of [false, true]) {
    const f = fixture(), key = memberStorage.memberKeys('101').doc(id), current = f.store('101');
    if (negative) assert.equal(await f.docs.loadEditorDoc({ ...row, source: 'member-api', memberAccountId: '101' }), null);
    f.disk.set(key, JSON.stringify(document('101'))); await current.load();
    assert.equal((await f.reopen(current)).pages[0].id, pageId);
    assert.equal(f.docs.peekEditorDoc(key).doc.memberAccountId, '101');
  }
});

test('같은 다이어리 ID의 다른 계정 캐시는 회원 재진입에 사용하지 않는다', async () => {
  const f = fixture(), key1 = memberStorage.memberKeys('101').doc(id), key2 = memberStorage.memberKeys('202').doc(id);
  f.docs.rememberEditorDoc(key1, edited('101'));
  f.disk.set(key2, JSON.stringify(document('202')));
  const current = f.store('202'); await current.load();
  const opened = await f.reopen(current);
  assert.equal(opened.memberAccountId, '202'); assert.equal(opened.pages[0].objects.length, 0);
  assert.equal(f.docs.peekEditorDoc(key1).doc.pages[0].objects[0].id, 'new-stroke');
});
