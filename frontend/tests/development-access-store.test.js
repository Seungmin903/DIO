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

test('새 저장소는 이전 실행의 개발 접속 정보를 복원하지 않는다', async () => {
  const previous = load()();
  await previous.save('https://k15f106.p.ssafy.io', 'Basic dGVzdGVyOnNlY3JldA==');
  assert.equal(await load()().load('https://k15f106.p.ssafy.io'), null);
});

test('웹에는 기존과 같이 개발 접속 저장소를 만들지 않는다', () => {
  assert.equal(load()('web'), null);
});
