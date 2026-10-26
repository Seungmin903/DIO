import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/hooks/useLibraryMetadata.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
});

function fixture(loadEditorDoc, createDefaultDoc = () => ({ pages: [{}] })) {
  let value, previous, cleanup;
  const module = { exports: {} };
  const mocks = {
    react: {
      useState(initial) { value ??= initial; return [value, next => { value = next; }]; },
      useEffect(effect, deps) {
        if (!previous || deps.some((dep, index) => dep !== previous[index])) {
          cleanup?.(); previous = deps; cleanup = effect();
        }
      },
    },
    '../../editor/services/editorDocs': { loadEditorDoc },
    '../../editor/state/defaultDoc': { createDefaultDoc },
  };
  new Function('require', 'module', 'exports', code)(id => mocks[id], module, module.exports);
  return { render: (diaries, page = 'library') => module.exports.useLibraryMetadata(diaries, page), unmount: () => cleanup?.() };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('페이지 추가·삭제 후 보관함 복귀 시 개수를 다시 읽고 실패는 0으로 표시하지 않는다', async () => {
  let pages = [{}, {}, {}], failure = false;
  const f = fixture(async () => { if (failure) throw new Error('storage unavailable'); return { pages }; });
  const diaries = [{ id: 'a' }];
  assert.equal(f.render(diaries).a, undefined);
  await settle(); assert.equal(f.render(diaries).a.pageCount, 3);
  f.render(diaries, 'editor'); pages = [...pages, {}]; f.render(diaries);
  await settle(); assert.equal(f.render(diaries).a.pageCount, 4);
  f.render(diaries, 'editor'); pages = pages.slice(0, 2); f.render(diaries);
  await settle(); assert.equal(f.render(diaries).a.pageCount, 2);
  f.render(diaries, 'editor'); failure = true; f.render(diaries);
  await settle(); assert.equal(f.render(diaries).a.pageCount, null);
  f.unmount();
});

test('저장 전 다이어리는 실제 생성되는 초기 페이지 구성을 센다', async () => {
  const f = fixture(async () => null, () => ({ pages: [{}, {}, {}, {}, {}] }));
  const diaries = [{ id: 'new' }];
  f.render(diaries); await settle();
  assert.equal(f.render(diaries).new.pageCount, 5);
  f.unmount();
});

test('다른 목록으로 전환한 뒤 도착하는 이전 페이지 수를 반영하지 않는다', async () => {
  let resolveOld;
  const f = fixture(diary => diary.id === 'old' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ pages: [{}, {}] }));
  f.render([{ id: 'old' }]);
  const diaries = [{ id: 'new' }];
  f.render(diaries); await settle();
  resolveOld({ pages: [{}, {}, {}, {}] }); await settle();
  assert.deepEqual(f.render(diaries), { new: { pageCount: 2, updatedAt: undefined } });
  f.unmount();
});
