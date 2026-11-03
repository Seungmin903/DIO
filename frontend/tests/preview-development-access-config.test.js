import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const configFor = (development, env = {}) => {
  const path = new URL('../src/auth/developmentAccessConfig.js', import.meta.url);
  const source = readFileSync(path, 'utf8').replaceAll('export const ', 'const ')
    + '; module.exports = { developmentAccessEnabled, developmentAccessStoreEnabled };';
  const module = { exports: {} };
  new Function('module', 'exports', '__DEV__', 'process', source)(module, module.exports, development, { env });
  return module.exports;
};

test('preview만 개발 서버 Basic 인증과 개발 API를 명시적으로 활성화한다', () => {
  const profiles = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8')).build;
  assert.equal(profiles.preview.env.EXPO_PUBLIC_DEVELOPMENT_ACCESS_ENABLED, 'true');
  assert.equal(profiles.preview.env.EXPO_PUBLIC_API_BASE_URL, 'https://k15f106.p.ssafy.io:8443');
  assert.equal(profiles.production.env.EXPO_PUBLIC_DEVELOPMENT_ACCESS_ENABLED, undefined);
});

test('preview는 Basic 인증만 허용하고 자격 증명 저장소는 만들지 않는다', () => {
  assert.deepEqual(configFor(false, { EXPO_PUBLIC_DEVELOPMENT_ACCESS_ENABLED: 'true' }), {
    developmentAccessEnabled: true, developmentAccessStoreEnabled: false,
  });
  assert.deepEqual(configFor(false), { developmentAccessEnabled: false, developmentAccessStoreEnabled: false });
  assert.deepEqual(configFor(true), { developmentAccessEnabled: true, developmentAccessStoreEnabled: true });
});
