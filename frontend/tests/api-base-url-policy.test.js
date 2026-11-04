import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSecureApiBaseUrl } from '../src/shared/apiBaseUrlPolicy.js';

test('릴리스 API 주소는 호스트가 있는 절대 HTTPS 주소만 허용하고 같은 출처 상대 경로는 거부한다', () => {
  for (const value of ['https://api.example.com/api', 'HTTPS://api.example.com', 'https://api.example.com?x=1', 'https://api.example.com:8443/api', 'https://localhost/api', 'https://10.0.2.2:8443/api', 'https://[::1]:8443/api', 'https://api.example.com#x']) {
    assert.equal(isSecureApiBaseUrl(value), true, value);
  }
  for (const value of [undefined, null, '', '/api', 'api', '//api.example.com/api', 'http://api.example.com/api', 'https://', 'https:///api', 'https://api example.com',
    // 호스트가 비었거나 형식이 잘못된 권한부
    'https://:8443/api', 'https://@/api', 'https://user@api.example.com/api', 'https://user:pw@api.example.com', 'https://api.example.com:/api', 'https://api.example.com:0/api',
    'https://api.example.com:65536', 'https://api.example.com:80a', 'https://-api.example.com', 'https://api..example.com', 'https://api_example.com', 'https://[]/api', 'https://[::1/api', 'https://api.example.com\t/api']) {
    assert.equal(isSecureApiBaseUrl(value), false, String(value));
  }
});

test('앱 릴리스 검사와 웹 export 검사는 같은 판정 모듈을 쓰고 정규식을 따로 두지 않는다', () => {
  const authService = readFileSync(new URL('../src/auth/authService.js', import.meta.url), 'utf8');
  const exportScript = readFileSync(new URL('../scripts/export-licensed-web.cjs', import.meta.url), 'utf8');
  assert.match(authService, /from '\.\.\/shared\/apiBaseUrlPolicy'/);
  assert.match(authService, /isSecureApiBaseUrl\(configuredApiBaseUrl\)/);
  // require(esm)이 없는 Node 22.12 미만에서도 읽히도록 동적 import를 쓴다.
  assert.match(exportScript, /await import\('\.\.\/src\/shared\/apiBaseUrlPolicy\.js'\)/);
  assert.doesNotMatch(exportScript, /require\([^)]*apiBaseUrlPolicy/);
  assert.match(exportScript, /isSecureApiBaseUrl\(productionEnv\.EXPO_PUBLIC_API_BASE_URL\)/);
  for (const source of [authService, exportScript]) assert.doesNotMatch(source, /\^https:/);
});
