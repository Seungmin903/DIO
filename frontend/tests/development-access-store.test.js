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
  new Function('require', 'module', 'exports', source)(id => ({ 'react-native': { Platform: { OS: 'android' } }, 'expo-secure-store': {} })[id], mod, mod.exports);
  return mod.exports.createDevelopmentAccessStore;
};

test('개발 접속 저장소는 서버 주소별 키를 쓰고 Basic 형식이 아닌 값은 버린다', async () => {
  const values = {};
  const secure = { getItemAsync: async key => values[key] ?? null, setItemAsync: async (key, value) => { values[key] = value; },
    deleteItemAsync: async key => { delete values[key]; } };
  const store = load()(secure, 'android');
  await store.save('https://k15f106.p.ssafy.io', 'Basic dGVzdGVyOnNlY3JldA==');
  assert.deepEqual(Object.keys(values), ['dio_dev_access_https___k15f106.p.ssafy.io']);
  assert.equal(await store.load('https://k15f106.p.ssafy.io'), 'Basic dGVzdGVyOnNlY3JldA==');
  assert.equal(await store.load('https://other.example'), null);
  values['dio_dev_access_https___k15f106.p.ssafy.io'] = 'Bearer token';
  assert.equal(await store.load('https://k15f106.p.ssafy.io'), null);
  await store.clear('https://k15f106.p.ssafy.io');
  assert.deepEqual(values, {});
});

test('웹에는 개발 접속 저장소를 만들지 않는다', () => {
  assert.equal(load()({}, 'web'), null);
});
