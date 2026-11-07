import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const { findLeakedQaAccess, assertNoLeakedQaAccess } = createRequire(import.meta.url)('../scripts/check-web-distribution.cjs');

function distribution(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-web-dist-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}
const env = { EXPO_PUBLIC_QA_ACCESS_ID: 'qa-user', EXPO_PUBLIC_QA_ACCESS_PASSWORD: 'qa-secret-pw' };

test('QA 접속 정보가 없는 배포본은 통과한다', () => {
  const dir = distribution({ 'index.html': '<html></html>', '_expo/static/js/web/app.js': 'const api="https://k15f106.p.ssafy.io/api";' });
  assert.equal(findLeakedQaAccess(dir, env), null);
  assert.doesNotThrow(() => assertNoLeakedQaAccess(dir, env));
});

test('변수명이나 실제 값이 남은 배포본은 파일 이름과 함께 실패한다', () => {
  const byName = distribution({ 'index.html': '<html></html>', '_expo/static/js/web/app.js': 'process.env.EXPO_PUBLIC_QA_ACCESS_ID' });
  assert.deepEqual(findLeakedQaAccess(byName, env), { file: '_expo/static/js/web/app.js', kind: 'variable name' });
  assert.throws(() => assertNoLeakedQaAccess(byName, env), /app\.js \(variable name\)/);
  const byValue = distribution({ 'app.js': 'Authorization: Basic qa-user:qa-secret-pw' });
  assert.equal(findLeakedQaAccess(byValue, env).kind, 'value');
  // 값이 설정되지 않았거나 너무 짧으면 값 검사는 건너뛰고 변수명만 본다.
  assert.equal(findLeakedQaAccess(byValue, { EXPO_PUBLIC_QA_ACCESS_ID: 'qa' }), null);
});
