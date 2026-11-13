import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MediaError } from '../src/editor/utils/mediaPolicy.js';
import { mediaFailureMessage } from '../src/editor/utils/mediaRecovery.js';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/image.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
});

function load(assets) {
  const picked = [], imported = [];
  const mocks = {
    'react-native': { Platform: { OS: 'android' } },
    '../utils/mediaPicker': { selectImages: async (options) => { picked.push(options); return { canceled: false, assets }; } },
    './mediaStore': {
      importMedia: async (list, options) => { imported.push([list, options]); return list.map((asset) => ({ mediaFileId: asset, extension: 'jpg' })); },
      makePoster: async () => null, mediaService: { get: async () => ({}) },
    },
    '../utils/mediaPolicy.js': { MediaError },
    '../utils/mediaImport.js': { attachMediaPreviews: async (items) => items },
    '../utils/mediaProcessing': { createPoster: async () => null },
  };
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => { assert.ok(name in mocks, name); return mocks[name]; }, m, m.exports);
  return { pickImages: m.exports.pickImages, picked, imported };
}

test('선택 창이 최대 장수를 무시하고 더 많이 돌려주면 저장하지 않고 안내 문구로 실패한다', async () => {
  const { pickImages, picked, imported } = load(['a', 'b', 'c']);
  const error = await pickImages({ multiple: true, selectionLimit: 2 }).then(() => assert.fail('실패해야 한다'), (e) => e);
  assert.ok(error instanceof MediaError);
  assert.equal(error.code, 'PHOTO_SELECTION_LIMIT');
  assert.equal(mediaFailureMessage(error), '사진은 최대 2장까지 선택할 수 있어요.');
  assert.deepEqual(picked, [{ multiple: true, selectionLimit: 2 }]);
  assert.equal(imported.length, 0);
});

test('최대 장수 이내이거나 한도가 없으면 고른 사진을 그대로 가져온다', async () => {
  for (const [assets, selectionLimit] of [[['a', 'b'], 2], [['a'], 2], [['a', 'b', 'c'], undefined]]) {
    const { pickImages, imported } = load(assets);
    const images = await pickImages({ multiple: true, selectionLimit });
    assert.deepEqual(images.map((image) => image.mediaFileId), assets);
    assert.deepEqual(imported.map(([list]) => list), [assets]);
  }
});
