import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/utils/mediaPicker.native.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
});

function load(os, native) {
  const calls = [];
  globalThis.expo = native ? { modules: { DioGallery: native } } : {};
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => id === 'react-native' ? { Platform: { OS: os } } : {
    UIImagePickerPreferredAssetRepresentationMode: { Current: 'current' },
    launchImageLibraryAsync: async options => { calls.push(options); return { canceled: false, assets: ['system'] }; },
  }, m, m.exports);
  return { selectImages: m.exports.selectImages, calls, dismissMs: m.exports.IOS_PICKER_DISMISS_MS };
}

test('안드로이드에 갤러리가 있으면 갤러리를 열고 고른 결과를 그대로 돌려준다', async () => {
  let asked;
  const { selectImages, calls } = load('android', { isAvailable: () => true, pick: async multiple => { asked = multiple; return { canceled: false, assets: ['gallery'] }; } });
  assert.deepEqual((await selectImages({ multiple: true })).assets, ['gallery']);
  assert.equal(asked, true);
  assert.equal(calls.length, 0);
});

test('갤러리에서 취소하면 시스템 창을 다시 열지 않는다', async () => {
  const { selectImages, calls } = load('android', { isAvailable: () => true, pick: async () => ({ canceled: true, assets: [] }) });
  assert.equal((await selectImages({ multiple: false })).canceled, true);
  assert.equal(calls.length, 0);
});

test('빈 칸 수가 정해진 다중 선택은 삼성 갤러리 대신 제한을 지원하는 시스템 창을 연다', async () => {
  const { selectImages, calls } = load('android', {
    isAvailable: () => true,
    pick: async () => assert.fail('갤러리는 최대 장수를 지정할 수 없다'),
  });
  for (const selectionLimit of [4, 2]) {
    await selectImages({ multiple: true, selectionLimit });
  }
  assert.deepEqual(calls.map(options => [options.allowsMultipleSelection, options.selectionLimit]), [[true, 4], [true, 2]]);
  delete globalThis.expo;
});

test('모듈 · 갤러리가 없거나 실패하면 시스템 창을 쓰고, iOS 는 언제나 시스템 창이다', async () => {
  for (const [os, native] of [
    ['android', null],
    ['android', { isAvailable: () => false }],
    ['android', { isAvailable: () => { throw new Error('x'); } }],
    ['android', { isAvailable: () => true, pick: async () => { throw new Error('x'); } }],
    ['ios', { isAvailable: () => true, pick: async () => ({ canceled: false, assets: ['gallery'] }) }],
  ]) {
    const { selectImages, calls } = load(os, native);
    assert.deepEqual((await selectImages({ multiple: true })).assets, ['system']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].allowsMultipleSelection, true);
  }
  delete globalThis.expo;
});

test('갤러리에서 고른 뒤 읽기에 실패하면 시스템 창을 다시 열지 않고 실패를 알린다', async () => {
  const failure = Object.assign(new Error('x'), { code: 'ERR_GALLERY_READ' });
  const { selectImages, calls } = load('android', { isAvailable: () => true, pick: async () => { throw failure; } });
  await assert.rejects(selectImages({ multiple: true }), failure);
  assert.equal(calls.length, 0);
  delete globalThis.expo;
});

test('갤러리를 열지 못하면 시스템 창으로 넘어간다', async () => {
  const failure = Object.assign(new Error('x'), { code: 'ERR_GALLERY_OPEN' });
  const { selectImages, calls } = load('android', { isAvailable: () => true, pick: async () => { throw failure; } });
  assert.deepEqual((await selectImages({ multiple: false })).assets, ['system']);
  assert.equal(calls.length, 1);
  delete globalThis.expo;
});

test('새 요청에 밀린 갤러리 요청은 시스템 창을 열지 않고 취소로 끝난다', async () => {
  const failure = Object.assign(new Error('x'), { code: 'ERR_GALLERY_STALE' });
  const { selectImages, calls } = load('android', { isAvailable: () => true, pick: async () => { throw failure; } });
  assert.deepEqual(await selectImages({ multiple: true }), { canceled: true, assets: [] });
  assert.equal(calls.length, 0);
  delete globalThis.expo;
});

test('iOS 는 보관함이 닫힐 때까지 기다린 뒤 고른 결과를 돌려준다(닫히는 중에 자르기 창을 띄우면 뜨지 않았다)', async () => {
  const { selectImages, dismissMs } = load('ios', null);
  assert.ok(dismissMs >= 400);
  const started = Date.now();
  assert.deepEqual((await selectImages({ multiple: false })).assets, ['system']);
  assert.ok(Date.now() - started >= dismissMs - 20, '고른 결과를 바로 돌려주지 않는다');
  delete globalThis.expo;
});
