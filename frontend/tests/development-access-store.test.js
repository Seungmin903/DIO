import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json')), babel = expo('@babel/core');
const source = babel.transformSync(readFileSync(new URL('../src/auth/developmentAccessStore.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;
const load = () => {
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(id => ({ 'react-native': { Platform: { OS: 'android' } } })[id], mod, mod.exports);
  return mod.exports.createDevelopmentAccessStore;
};

test('개발 접속 저장소는 앱 실행 중 서버 주소별로 Basic 헤더만 유지한다', async () => {
  const store = load()();
  await store.save('https://k15f106.p.ssafy.io', 'Basic dGVzdGVyOnNlY3JldA==');
  assert.equal(await store.load('https://k15f106.p.ssafy.io'), 'Basic dGVzdGVyOnNlY3JldA==');
  assert.equal(await store.load('https://other.example'), null);
  await store.save('https://k15f106.p.ssafy.io', 'Bearer token');
  assert.equal(await store.load('https://k15f106.p.ssafy.io'), null);
  await store.clear('https://k15f106.p.ssafy.io');
  assert.equal(await store.load('https://k15f106.p.ssafy.io'), null);
});

test('같은 앱 실행 중 새 저장소 인스턴스도 개발 접속 정보를 공유한다', async () => {
  const factory = load();
  const first = factory(), second = factory();
  await first.save('https://instance.example', 'Basic dGVzdGVyOnNlY3JldA==');
  assert.equal(await second.load('https://instance.example'), 'Basic dGVzdGVyOnNlY3JldA==');
  await second.clear('https://instance.example');
});

test('웹에는 기존과 같이 개발 접속 저장소를 만들지 않는다', () => {
  const factory = load();
  assert.equal(factory({ platform: 'web' }), null);
});

test('예전 빌드가 Keychain·Keystore에 남긴 개발 접속 정보는 읽지 않고 서버 주소별로 한 번만 지운다', async () => {
  const deleted = [];
  const legacyKeychain = {
    getItemAsync: async () => assert.fail('예전 값은 읽지 않는다'),
    setItemAsync: async () => assert.fail('새 값은 저장하지 않는다'),
    deleteItemAsync: async key => { deleted.push(key); },
  };
  const factory = load();
  const store = factory({ legacyKeychain });
  assert.equal(await store.load('https://legacy.example:8443'), null);
  await store.load('https://legacy.example:8443');
  await factory({ legacyKeychain }).load('https://legacy.example:8443');
  await store.save('https://legacy.example:8443', 'Basic dGVzdGVyOnNlY3JldA==');
  await store.clear('https://legacy.example:8443');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(deleted, ['dio_dev_access_https___legacy.example_8443']);
});

test('예전 접속 정보 삭제가 실패해도 현재 접속 정보는 동작하고 다음 load 때 다시 지운다', async () => {
  let attempts = 0;
  const legacyKeychain = { deleteItemAsync: async () => { attempts++; if (attempts === 1) throw new Error('keychain locked'); } };
  const store = load()({ legacyKeychain });
  await store.save('https://retry.example', 'Basic dGVzdGVyOnNlY3JldA==');
  assert.equal(await store.load('https://retry.example'), 'Basic dGVzdGVyOnNlY3JldA==');
  await new Promise(resolve => setImmediate(resolve));
  await store.load('https://retry.example');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 2);
  await store.clear('https://retry.example');
});

test('웹과 Keychain이 없는 환경은 예전 접속 정보를 건드리지 않는다', async () => {
  const factory = load();
  assert.equal(factory({ platform: 'web', legacyKeychain: { deleteItemAsync: () => assert.fail() } }), null);
  assert.equal(await factory().load('https://nokeychain.example'), null);
});
