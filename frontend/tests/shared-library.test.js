import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createSharingPreview } from '../src/sharing/sharingPreview.js';
import * as memory from '../src/editor/services/sessionDocuments.js';
import { createDefaultDoc, migrateUntouchedAnnualDoc } from '../src/editor/state/defaultDoc.js';
const require = createRequire(import.meta.url),
  expo = createRequire(require.resolve('expo/package.json')),
  babel = expo('@babel/core');
function docsFixture() {
  const disk = new Map(),
    calls = [];
  const code = babel.transformSync(
    readFileSync(new URL('../src/editor/services/editorDocs.js', import.meta.url), 'utf8'),
    {
      configFile: false,
      babelrc: false,
      plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
    },
  ).code;
  const mocks = {
    '@react-native-async-storage/async-storage': {
      __esModule: true,
      default: {
        getItem: async (key) => {
          calls.push(['get', key]);
          return disk.get(key) ?? null;
        },
      },
    },
    '../state/defaultDoc': { createDefaultDoc, migrateUntouchedAnnualDoc },
    '../templates/catalog.js': { templateReference: () => null },
    '../templates/loadTemplate': {},
    './mediaStore': {},
    './sessionDocuments.js': memory,
    './storage': {
      STORAGE_KEYS: { doc: 'personal:doc' },
      saveJSON: async (key, doc) => {
        calls.push(['save', key]);
        disk.set(key, JSON.stringify(doc));
        return true;
      },
    },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)((id) => mocks[id], mod, mod.exports);
  return { ...mod.exports, disk, calls };
}
const pending = (r) => r.preview.inspect().invitations.find((i) => i.status === 'PENDING').inviteId;
test('수락 후 공유 보관함 카드를 만들고 문서는 세션에서만 저장·재열람한다', async () => {
  const runtime = createSharingPreview({ delay: 0 });
  const docs = docsFixture();
  assert.deepEqual(runtime.getSnapshot().library, []);
  const shared = await runtime.accept(pending(runtime), '참여자');
  const card = runtime.getSnapshot().library[0];
  assert.equal(card.title, shared.title);
  assert.equal(card.sharedDiaryId, shared.id);
  assert.equal(card.canManage, false);
  assert.ok(memory.isSessionDocumentKey(card.id));
  const doc = createDefaultDoc(card);
  assert.equal(doc.pages.length, 1);
  assert.equal(docs.editorDocKey(card), card.sessionStorageKey);
  doc.pages[0].objects.push({ id: 'shape', type: 'shape' });
  assert.equal(await docs.saveEditorDoc(card.sessionStorageKey, doc), true);
  assert.equal((await docs.loadEditorDoc(card)).pages[0].objects[0].id, 'shape');
  assert.deepEqual(docs.calls, []);
  assert.equal(docs.disk.size, 0);
  runtime.toggleFavorite(shared.id);
  assert.equal(runtime.getSnapshot().library[0].favorite, true);
  assert.equal(runtime.registerDiary(card).members.find((m) => m.id === 'self').role, 'EDITOR');
  runtime.dispose();
});
test('참여 해제·로그아웃은 카드와 문서 접근을 지우며 늦은 저장으로 복구하지 않는다', async () => {
  const runtime = createSharingPreview({ delay: 0 }),
    docs = docsFixture(),
    shared = await runtime.accept(pending(runtime), '참여자');
  const card = runtime.getSnapshot().library[0];
  await docs.saveEditorDoc(card.sessionStorageKey, createDefaultDoc(card));
  await runtime.leave(shared.id);
  assert.equal(runtime.getSnapshot().library.length, 0);
  assert.equal(await docs.loadEditorDoc(card), null);
  assert.equal(await docs.saveEditorDoc(card.sessionStorageKey, { pages: [{}] }), false);
  assert.deepEqual(docs.calls, []);
  const other = await runtime.accept(pending(runtime), '다른참여자');
  const next = runtime.getSnapshot().library[0];
  assert.notEqual(next.sessionStorageKey, card.sessionStorageKey);
  runtime.dispose();
  assert.equal(await docs.saveEditorDoc(next.sessionStorageKey, { pages: [{}] }), false);
});
test('개인 다이어리 저장 키와 기존 기기 저장 경로는 유지한다', async () => {
  const docs = docsFixture(),
    diary = { id: 'own' };
  assert.equal(docs.editorDocKey(diary), 'personal:doc:own');
  const doc = { id: 'own', title: '내 기록', pages: [{ objects: [] }] };
  assert.equal(await docs.saveEditorDoc(docs.editorDocKey(diary), doc), true);
  assert.deepEqual(await docs.loadEditorDoc(diary), doc);
  assert.deepEqual(docs.calls, [
    ['save', 'personal:doc:own'],
    ['get', 'personal:doc:own'],
  ]);
});
