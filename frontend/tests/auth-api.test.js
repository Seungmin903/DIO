import test from 'node:test';
import assert from 'node:assert/strict';
import { authBaseUrl, createAuthApi } from '../src/auth/authApi.js';

const user = { userId: '7', email: 'member@example.com', nickname: '회원', profilePhotoUrl: '/api/v1/auth/profile-photos/photo-id' };
const tokens = (suffix = '') => ({ user, accessToken: `access${suffix}`, refreshToken: `refresh${suffix}` });
const response = (data, status = 200) => ({ status, ok: status < 400, json: async () => data });
function setup(handler, options = {}) {
  const calls = [];
  const api = createAuthApi({ baseUrl: 'http://localhost:8080/api', ...options,
    fetchImpl: async (url, init) => {
      const call = { path: url.split('/auth/')[1], ...init };
      calls.push(call);
      return handler(call);
    } });
  return { api, calls };
}
test('API 주소 형식을 통일한다', () => {
  for (const suffix of ['', '/api', '/api/v1/']) assert.equal(authBaseUrl(`http://localhost:8080${suffix}`), 'http://localhost:8080/api/v1');
});
test('로그인은 실제 서버 사용자·사진을 표시하고 view에는 토큰을 노출하지 않는다', async () => {
  const { api, calls } = setup(() => response(tokens()));
  const result = await api.login({ email: ' MEMBER@example.com ', password: 'Password123!' });
  assert.equal(result.photoUri, 'http://localhost:8080/api/v1/auth/profile-photos/photo-id');
  assert.equal(result.nickname, '회원'); assert.equal(result.mode, 'authenticated');
  assert.equal(result.accessToken, undefined);
  assert.deepEqual(JSON.parse(calls[0].body), { email: user.email, password: 'Password123!' });
});
test('로그인 실패는 실제 오류이며 mock 성공으로 대체하지 않는다', async () => {
  const { api } = setup(() => response({ detail: '이메일 또는 비밀번호가 맞지 않아요.', code: 'INVALID_CREDENTIALS' }, 401));
  await assert.rejects(api.login({ email: user.email, password: 'wrong' }), { code: 'INVALID_CREDENTIALS', status: 401 });
});
test('이메일 확인·닉네임 확인을 연결하고 인증 UI가 없으면 가입 생성 요청을 보내지 않는다', async () => {
  const { api, calls } = setup(() => response({ available: true }));
  const profile = await api.signup({ email: user.email, password: 'Password123!' });
  assert.equal(await api.checkNickname(' 닉네임 '), true);
  await assert.rejects(api.completeProfile({ ...profile, nickname: '닉네임', terms: {} }), /이메일 인증/);
  assert.deepEqual(calls.map(call => call.path), ['email-availability', 'nickname-availability']);
});
test('검증 토큰·3가지 실제 약관 상태를 보내고 회원가입 후 자동 로그인하지 않는다', async () => {
  const { api, calls } = setup(call => response(call.path === 'email-verifications/verify'
    ? { signupToken: 'verified', expiresIn: 600 } : call.path === 'signup' ? user : { available: true }));
  const profile = await api.signup({ email: user.email, password: 'Password123!' });
  await api.verifyEmail(user.email, '123456');
  const result = await api.completeProfile({ ...profile, nickname: '닉네임', terms: { service: true, privacy: true, marketing: false } });
  const body = JSON.parse(calls.at(-1).body);
  assert.equal(body.signupToken, 'verified'); assert.equal(body.profileColor, undefined);
  assert.deepEqual(body.agreements.map(term => [term.termsType, term.agreed]), [['SERVICE', true], ['PRIVACY', true], ['MARKETING', false]]);
  assert.equal(result.mode, 'registered');
  const count = calls.length; await api.logout(); assert.equal(calls.length, count);
});
test('사진 multipart는 Content-Type을 강제하지 않고 실패해도 임시 파일을 삭제한다', async () => {
  let disposed = 0;
  const form = new FormData();
  const { api, calls } = setup(call => call.path === 'signup' ? response({ detail: '오류' }, 400)
    : response(call.path === 'email-verifications/verify' ? { signupToken: 'verified', expiresIn: 600 } : { available: true }),
  { buildPhotoBody: async () => ({ body: form, dispose: () => disposed++ }) });
  const profile = await api.signup({ email: user.email, password: 'Password123!' });
  await api.verifyEmail(user.email, '123456');
  await assert.rejects(api.completeProfile({ ...profile, nickname: '닉네임', photoUri: 'local-photo', terms: {} }));
  assert.equal(calls.at(-1).body, form); assert.equal(calls.at(-1).headers['Content-Type'], undefined);
  assert.equal(disposed, 1);
});
test('만료되거나 다른 이메일의 인증으로 가입할 수 없다', async () => {
  let time = 0;
  const { api, calls } = setup(call => response(call.path === 'email-verifications/verify'
    ? { signupToken: 'verified', expiresIn: 600 } : { available: true }), { now: () => time });
  const profile = await api.signup({ email: user.email, password: 'Password123!' });
  await api.verifyEmail(user.email, '123456'); time = 600001;
  await assert.rejects(api.completeProfile({ ...profile, nickname: '닉네임' }), /이메일 인증/);
  time = 0; await api.verifyEmail('other@example.com', '123456');
  await assert.rejects(api.completeProfile({ ...profile, nickname: '닉네임' }), /이메일 인증/);
  assert.equal(calls.some(call => call.path === 'signup'), false);
});
test('동시 refresh는 한 번만 회전하고 로그아웃은 최신 accessToken을 사용한다', async () => {
  let release;
  const { api, calls } = setup(call => call.path === 'refresh' ? new Promise(resolve => { release = () => resolve(response(tokens('2'))); }) : response(tokens()));
  await api.login({ email: user.email, password: 'Password123!' });
  const first = api.refresh(), second = api.refresh(); release(); await Promise.all([first, second]);
  await api.logout();
  assert.equal(calls.filter(call => call.path === 'refresh').length, 1);
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer access2');
  await assert.rejects(api.refresh(), /다시 로그인/);
});
test('취소된 로그인 응답은 세션을 만들지 않는다', async () => {
  let release;
  const { api, calls } = setup(() => new Promise(resolve => { release = () => resolve(response(tokens())); }));
  const login = api.login({ email: user.email, password: 'Password123!' }); api.cancelPending(); release();
  await assert.rejects(login, /취소/); await api.logout(); assert.equal(calls.length, 1);
});
test('소셜 로그인은 서버 구현 없이 체험 계정을 생성하지 않는다', async () => {
  const { api, calls } = setup(() => { throw new Error('unexpected'); });
  await assert.rejects(api.social('google'), /아직 연결/); assert.equal(calls.length, 0);
});

test('개발 프록시에서는 Basic 헤더와 충돌하지 않는 별도 토큰 헤더를 사용한다', async () => {
  const { api, calls } = setup(call => call.path === 'login' ? response(tokens()) : response(null, 204), { accessTokenHeader: 'X-DIO-Access-Token' });
  await api.login({ email: user.email, password: 'Password123!' });
  await api.logout();
  assert.equal(calls.at(-1).headers['X-DIO-Access-Token'], 'access');
  assert.equal(calls.at(-1).headers.Authorization, undefined);
});
