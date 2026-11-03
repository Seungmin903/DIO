import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('preview만 개발 서버 Basic 인증과 개발 API를 명시적으로 활성화한다', () => {
  const profiles = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8')).build;
  assert.equal(profiles.preview.env.EXPO_PUBLIC_DEVELOPMENT_ACCESS_ENABLED, 'true');
  assert.equal(profiles.preview.env.EXPO_PUBLIC_API_BASE_URL, 'https://k15f106.p.ssafy.io:8443');
  assert.equal(profiles.production.env.EXPO_PUBLIC_DEVELOPMENT_ACCESS_ENABLED, undefined);
});
