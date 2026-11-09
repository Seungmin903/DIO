import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAuthApi } from '../src/auth/authApi.js';

const user = { userId: '7', email: 'user@example.com', nickname: '디오회원', profilePhotoUrl: null };
const tokens = (access = 'access', who = user) => ({ user: who, accessToken: access, refreshToken: `${access}-refresh`, expiresIn: 900 });
const response = (body, status = 200) => ({ status, ok: status < 400, json: async () => body });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function setup(handler, extra = {}) {
  const calls = [];
  const api = createAuthApi({ baseUrl: 'https://dio.test/api', googleSignIn: async () => ({ idToken: 'google-id-token', email: user.email }), ...extra,
    fetchImpl: async (url, options) => { calls.push({ url, ...options }); return handler(url, options, calls.length); } });
  return { api, calls };
}

test('799: 이메일 회원은 계정 비밀번호로 다시 확인하고, 확인용 세션은 바로 끊으며 지금 세션은 그대로 둔다', async () => {
  const { api, calls } = setup((url, options, n) => n === 1 ? response(tokens('access')) : url.endsWith('/auth/logout') ? response(null, 204) : response(tokens('verify-access')));
  await api.login({ email: user.email, password: 'Password123!' });
  const sessionKey = api.getSessionKey();
  assert.equal(await api.verifyAccount({ password: 'Password123!' }), true);
  await settle();
  assert.equal(calls[1].url, 'https://dio.test/api/v1/auth/login');
  assert.deepEqual(JSON.parse(calls[1].body), { email: user.email, password: 'Password123!' });
  // 확인용으로 열린 세션만 끊는다(그 세션의 토큰으로 로그아웃)
  assert.equal(calls[2].url, 'https://dio.test/api/v1/auth/logout');
  assert.equal(calls[2].headers.Authorization, 'Bearer verify-access');
  // 지금 세션은 바뀌지 않는다
  assert.equal(api.getSessionKey(), sessionKey);
  assert.equal(await api.getAccessToken({ userId: user.userId, sessionKey: api.getSessionKey() }), 'access');
});

test('799: 비밀번호가 틀리면 서버 오류를 그대로 알리고, 비밀번호가 비면 요청하지 않는다', async () => {
  const { api, calls } = setup((url, options, n) => n === 1 ? response(tokens('access')) : response({ code: 'INVALID_CREDENTIALS' }, 401));
  await api.login({ email: user.email, password: 'Password123!' });
  await assert.rejects(api.verifyAccount({ password: '' }), error => error.code === 'PASSWORD_REQUIRED');
  assert.equal(calls.length, 1);
  await assert.rejects(api.verifyAccount({ password: 'Wrong123!' }), error => error.status === 401);
  assert.equal(await api.getAccessToken({ userId: user.userId, sessionKey: api.getSessionKey() }), 'access');
});

test('799: 구글 회원은 구글 로그인을 한 번 더 받아 같은 계정이면 통과, 다른 계정이면 그 세션을 받지 않고 거절한다', async () => {
  let mode = 'same';
  const other = { ...user, userId: '8', email: 'other@gmail.com' };
  const { api, calls } = setup((url, options, n) => {
    if (n === 1) return response(tokens('access'));
    if (url.endsWith('/auth/logout')) return response(null, 204);
    if (mode === 'same') return response(tokens('verify-access'));
    if (mode === 'other') return response(tokens('other-access', other));
    return response({ code: 'SOCIAL_SIGNUP_REQUIRED' }, 409);
  });
  await api.social('google');
  const sessionKey = api.getSessionKey();
  assert.equal(await api.verifyAccount(), true);
  assert.equal(calls[1].url, 'https://dio.test/api/v1/auth/oauth/google');
  mode = 'other';
  await assert.rejects(api.verifyAccount(), error => error.code === 'ACCOUNT_MISMATCH' && /지금 로그인한 계정/.test(error.message));
  await settle();
  // 다른 계정의 세션도 끊고, 지금 세션 · 계정은 바뀌지 않는다
  assert.ok(calls.some(call => call.url.endsWith('/auth/logout') && call.headers.Authorization === 'Bearer other-access'));
  assert.equal(api.getSessionKey(), sessionKey);
  assert.equal(await api.getAccessToken({ userId: user.userId, sessionKey: api.getSessionKey() }), 'access');
  mode = 'unknown';
  await assert.rejects(api.verifyAccount(), error => error.code === 'ACCOUNT_MISMATCH');
});

test('799: 로그인하지 않았으면 확인할 계정이 없다', async () => {
  const { api, calls } = setup(() => response(tokens()));
  await assert.rejects(api.verifyAccount({ password: 'Password123!' }), error => error.status === 401);
  assert.equal(calls.length, 0);
});

test('799: 앱 잠금은 회원만 · 이 기기 — 게스트 잠금은 맞는 4자리로 열면 꺼지고, 회원은 잊었어요 → 계정 확인 → 새 4자리', () => {
  const app = read('App.js');
  assert.match(app, /const unlockWithPin = async \(\) => \{\s*if \(!lockMember\) await clearAppLock\(lockScope\)\.catch\(\(\) => \{\}\);\s*unlockApp\(\);\s*\};/);
  assert.match(app, /onDone=\{unlockWithPin\} onForgot=\{forgotAppLock\}/);
  assert.match(app, /onReauth: \(\) => setLockRecovery\('reauth'\)/);
  assert.match(app, /lockRecovery === 'reauth' && <AppLockReauth[\s\S]*?verify=\{input => authService\.verifyAccount\(input\)\} onVerified=\{\(\) => setLockRecovery\('setup'\)\}/);
  assert.match(app, /lockRecovery === 'setup' && <View[\s\S]*?<PinScreen mode="setup"[\s\S]*?onDone=\{finishLockRecovery\}/);
  assert.match(app, /setLockNotice\(\{ key: createId\(\), message: '이 기기의 앱 잠금 비밀번호를 바꿨어요' \}\)/);
  // 계정 비밀번호까지 잊었으면 로그아웃(이 기기의 이 계정 잠금을 지운 뒤)
  assert.match(app, /const logoutFromLock = async \(\) => \{\s*try \{ await clearAppLock\(lockScope\); \}/);

  const profile = read('src/diary/screens/ProfileScreen.js');
  // 확인 수단이 있을 때만 '잊었어요'를 둔다(없으면 칸을 비운다). 누른 순간의 목적(끄기 · 바꾸기)을 그대로 쓴다
  assert.match(profile, /const canReauth = authenticatedUser && typeof accountService\?\.verifyAccount === 'function';/);
  assert.match(profile, /onReauth: canReauth \? \(\) => setReauth\(pin\?\.next === 'off' \? 'off' : 'change'\) : undefined/);
  assert.match(profile, /\{reauth && canReauth && <AppLockReauth/);
  // PIN 화면이 닫히면 계정 확인도 닫는다. 안드로이드 뒤로 키는 계정 확인이 열려 있으면 그것만 닫는다
  assert.match(profile, /useEffect\(\(\) => \{ if \(!pin\) setReauth\(null\); \}, \[pin\]\);/);
  assert.match(profile, /onRequestClose=\{\(\) => \{ if \(reauth\) setReauth\(null\); else setPin\(null\); \}\}/);
  assert.ok(profile.indexOf('if (!pin) setReauth(null)') < profile.indexOf('if (!authenticatedUser && !guest) return null;'), '훅은 조건부 return 전에');
  assert.match(profile, /verify=\{input => accountService\.verifyAccount\(input\)\} onVerified=\{verified\}/);
  for (const message of ['이 기기에 앱 잠금을 켰어요', '이 기기의 앱 잠금을 껐어요', '이 기기의 앱 잠금 비밀번호를 바꿨어요']) assert.ok(profile.includes(`'${message}'`), message);

  // 이 기기에만 걸리는 설정이라 구역 이름이 '이 기기'다(설명 문구 없이 자리로 알린다)
  const setting = read('src/diary/components/AppLockSetting.js');
  assert.match(setting, /<SettingSection title="이 기기" compact=\{compact\}>/);
  assert.doesNotMatch(setting, /title="보안"/);
});

test('799: 계정 확인 화면 — 이메일은 비밀번호 칸 + 확인, 구글 · 애플은 그 로그인 원 하나, 맨 아래 로그아웃', () => {
  const screen = read('src/diary/components/AppLockReauth.js');
  assert.match(screen, /const title = social \? `\$\{social\.name\} 계정으로 확인해 주세요` : '계정 비밀번호를 입력해 주세요';/);
  assert.match(screen, /secureTextEntry=\{!visible\}/);
  assert.match(screen, /<DioButton variant="filled" block label="확인"/);
  assert.match(screen, /\{onLogout && <DioButton variant="ghost" label="로그아웃"/);
  // 실패하면 입력을 비우고 서버 문구를 보인다
  assert.match(screen, /setError\(failure\?\.message \|\| '계정을 확인하지 못했어요\. 다시 시도해 주세요\.'\);\s*setPassword\(''\);/);
});
