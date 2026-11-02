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
