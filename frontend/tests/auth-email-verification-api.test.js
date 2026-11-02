import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthApi } from '../src/auth/authApi.js';
import { developmentAuthorization } from '../src/auth/developmentAccess.js';

const email = 'member@example.com';
const response = (data, status = 200, retryAfter = null) => ({
  status, ok: status < 400, json: async () => data,
  headers: { get: name => name === 'Retry-After' ? retryAfter : null },
});
function setup(handler, options = {}) {
  const calls = [];
  const api = createAuthApi({ baseUrl: 'https://server.example/api', ...options,
    fetchImpl: async (url, init) => {
      const path = url.split('/auth/')[1];
      calls.push({ path, body: JSON.parse(init.body) });
      return handler(path, calls.at(-1).body);
    },
  });
  return { api, calls, gateway: api.verificationService };
}
const success = path => response(path === 'email-availability' ? { available: true }
  : path === 'email-verifications' ? { expiresIn: 600, resendAfter: 60 }
  : path === 'email-verifications/verify' ? { signupToken: 'server-token', expiresIn: 600 }
  : { userId: 'user-1', email, nickname: '회원' });

test('발송 전 이메일 확인, 서버 대기 시간 변환, 인증 후 같은 토큰으로 가입 준비', async () => {
  const { gateway, api, calls } = setup(success);
  assert.deepEqual(await gateway.send(' MEMBER@example.com '), { expiresIn: 600, retryAfter: 60 });
  assert.deepEqual(calls.map(call => call.path), ['email-availability', 'email-verifications']);
  assert.deepEqual(calls[1].body, { email });
  await gateway.verify(email, '482901');
  const profile = await gateway.prepareSignup({ email, password: 'Password123!' });
  await api.completeProfile({ ...profile, nickname: '회원', terms: { service: true, privacy: true } });
  assert.equal(calls.at(-1).body.signupToken, 'server-token');
});

test('사용 중인 이메일과 잘못된 가용성 응답에서는 메일을 발송하지 않는다', async () => {
  for (const data of [{ available: false }, {}, null]) {
    const { gateway, calls } = setup(() => response(data));
    await assert.rejects(gateway.send(email));
    assert.deepEqual(calls.map(call => call.path), ['email-availability']);
  }
});

test('화면 이탈 후 늦은 이메일 확인 결과로 메일을 발송하지 않는다', async () => {
  let release;
  const { gateway, api, calls } = setup(() => new Promise(resolve => { release = resolve; }));
  const pending = gateway.send(email);
  api.cancelPending(); release(response({ available: true }));
  await assert.rejects(pending, /취소/);
  assert.equal(calls.length, 1);
});

test('화면 이탈 후 늦은 인증 결과는 가입 토큰을 복원하지 않는다', async () => {
  let release;
  const { gateway, api } = setup(() => new Promise(resolve => { release = resolve; }));
  const pending = gateway.verify(email, '482901');
  api.cancelPending(); release(success('email-verifications/verify'));
  await assert.rejects(pending, /취소/);
  await assert.rejects(gateway.prepareSignup({ email, password: 'Password123!' }), /다시 인증/);
});

test('잘못된 인증 응답·다른 이메일·만료된 토큰으로 가입을 준비하지 않는다', async () => {
  for (const data of [null, {}, { signupToken: '', expiresIn: 600 }, { signupToken: 'x', expiresIn: -1 }]) {
    const { gateway } = setup(() => response(data));
    await assert.rejects(gateway.verify(email, '482901'), /결과/);
    await assert.rejects(gateway.prepareSignup({ email }), /다시 인증/);
  }
  let time = 0;
  const { gateway } = setup(success, { now: () => time });
  await gateway.verify(email, '482901');
  await assert.rejects(gateway.prepareSignup({ email: 'other@example.com' }), /다시 인증/);
  time = 600000;
  await assert.rejects(gateway.prepareSignup({ email }), /다시 인증/);
});

test('잘못된 발송 응답은 성공으로 취급하지 않는다', async () => {
  for (const data of [null, {}, { expiresIn: 600, retryAfter: 60 }, { expiresIn: -1, resendAfter: 60 }]) {
    const { gateway } = setup(path => path === 'email-availability' ? success(path) : response(data));
    await assert.rejects(gateway.send(email), /발송 정보/);
  }
});

test('화면 이탈 후 늦은 발송 응답은 성공으로 처리하지 않는다', async () => {
  let release;
  const { gateway, api } = setup(path => path === 'email-availability' ? success(path)
    : new Promise(resolve => { release = resolve; }));
  const pending = gateway.send(email);
  await new Promise(resolve => setImmediate(resolve));
  api.cancelPending(); release(success('email-verifications'));
  await assert.rejects(pending, /취소/);
});

test('발송 제한의 Retry-After와 서버 오류 문구를 화면에 전달한다', async () => {
  const { gateway } = setup(path => path === 'email-availability' ? success(path)
    : response({ code: 'EMAIL_RESEND_TOO_SOON', detail: '잠시 후 다시 요청해 주세요.' }, 429, '47'));
  await assert.rejects(gateway.send(email), { status: 429, retryAfter: 47, message: '잠시 후 다시 요청해 주세요.' });
});

test('개발 Nginx의 Basic 인증 401을 이메일 인증 오류와 구분하고 메일 발송을 진행하지 않는다', async () => {
  const { gateway, calls } = setup(() => ({
    status: 401, ok: false,
    json: async () => { throw new SyntaxError('HTML response'); },
    headers: { get: name => name === 'WWW-Authenticate' ? 'Basic realm="DIO Development"' : null },
  }));
  await assert.rejects(gateway.send(email), {
    status: 401, code: 'DEVELOPMENT_ACCESS_REQUIRED',
    message: '개발 서버 접근 인증이 필요해요. 서버 담당자에게 앱의 API 접근 방법을 확인해 주세요.',
  });
  assert.deepEqual(calls.map(call => call.path), ['email-availability']);
});

test('개발 접근 정보는 명시적으로 허용한 HTTPS 서비스에만 설정하며 인코딩 패딩을 유지한다', () => {
  assert.equal(createAuthApi({ baseUrl: 'https://server.example' }).verificationService.setDevelopmentAccess, undefined);
  for (const password of ['x', 'xx', 'xxx', 'xxxx']) {
    assert.equal(developmentAuthorization('https://server.example', 'tester', password),
      `Basic ${Buffer.from(`tester:${password}`).toString('base64')}`);
  }
  assert.throws(() => developmentAuthorization('http://server.example', 'tester', 'secret'), /HTTPS/);
  assert.throws(() => developmentAuthorization('https://server.example', 'bad:id', 'secret'), /확인/);
});

test('Basic 접근 인증과 로그인 토큰은 서로 다른 헤더로 보내며 새 인스턴스에 접속 정보를 남기지 않는다', async () => {
  const headers = [];
  const api = createAuthApi({ baseUrl: 'https://server.example', allowDevelopmentAccess: true,
    fetchImpl: async (url, init) => {
      headers.push(init.headers);
      if (url.endsWith('/login')) return response({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900,
        user: { userId: '1', email, nickname: '회원' } });
      return url.endsWith('/logout') ? response(null, 204) : response({ available: true });
    } });
  api.verificationService.setDevelopmentAccess('tester', 'secret');
  await api.checkEmailAvailability(email);
  await api.login({ email, password: 'Password123!' });
  await api.logout();
  assert.equal(headers[0].Authorization, `Basic ${Buffer.from('tester:secret').toString('base64')}`);
  assert.equal(headers.at(-1)['X-DIO-Access-Token'], 'access');
  assert.equal(headers.at(-1).Authorization, headers[0].Authorization);
  const fresh = createAuthApi({ baseUrl: 'https://server.example', allowDevelopmentAccess: true,
    fetchImpl: async (_, init) => { assert.equal(init.headers.Authorization, undefined); return response({ available: true }); } });
  await fresh.checkEmailAvailability(email);
});

const memoryStore = (initial = {}) => {
  const values = { ...initial }, log = [];
  return { values, log,
    load: async origin => { log.push(['load', origin]); return values[origin] ?? null; },
    save: async (origin, value) => { log.push(['save', origin]); values[origin] = value; },
    clear: async origin => { log.push(['clear', origin]); delete values[origin]; },
    clearAll: async () => { log.push(['clearAll']); Object.keys(values).forEach(key => delete values[key]); } };
};
const basicChallenge = () => ({ status: 401, ok: false, json: async () => { throw new SyntaxError('HTML'); },
  headers: { get: name => name === 'WWW-Authenticate' ? 'Basic realm="DIO Development"' : null } });

test('입력한 개발 서버 접속 정보는 서버 주소별로 저장하고 새 인스턴스가 다시 묻지 않고 사용한다', async () => {
  const store = memoryStore();
  const first = createAuthApi({ baseUrl: 'https://server.example', allowDevelopmentAccess: true, developmentAccessStore: store,
    fetchImpl: async () => response({ available: true }) });
  first.verificationService.setDevelopmentAccess('tester', 'secret');
  await first.checkEmailAvailability(email);
  const expected = `Basic ${Buffer.from('tester:secret').toString('base64')}`;
  assert.equal(store.values['https://server.example'], expected);

  const headers = [];
  const restarted = createAuthApi({ baseUrl: 'https://server.example', allowDevelopmentAccess: true, developmentAccessStore: store,
    fetchImpl: async (_, init) => { headers.push(init.headers); return response({ available: true }); } });
  await restarted.checkEmailAvailability(email);
  assert.equal(headers[0].Authorization, expected);

  const other = createAuthApi({ baseUrl: 'https://other.example', allowDevelopmentAccess: true, developmentAccessStore: store,
    fetchImpl: async (_, init) => { assert.equal(init.headers.Authorization, undefined); return response({ available: true }); } });
  await other.checkEmailAvailability(email);
});

test('서버가 저장된 개발 접속 정보를 거절하면 지우고 다시 입력을 요구한다', async () => {
  const saved = `Basic ${Buffer.from('tester:old').toString('base64')}`;
  const store = memoryStore({ 'https://server.example': saved });
  const api = createAuthApi({ baseUrl: 'https://server.example', allowDevelopmentAccess: true, developmentAccessStore: store,
    fetchImpl: async () => basicChallenge() });
  await assert.rejects(api.checkEmailAvailability(email), { code: 'DEVELOPMENT_ACCESS_REQUIRED' });
  assert.equal(store.values['https://server.example'], undefined);
  assert.deepEqual(store.log.at(-1), ['clear', 'https://server.example']);
});

test('로그아웃하면 개발 서버 접근 정보를 모두 지운다', async () => {
  const store = memoryStore();
  const api = createAuthApi({ baseUrl: 'https://server.example', allowDevelopmentAccess: true, developmentAccessStore: store,
    fetchImpl: async url => url.endsWith('/login')
      ? response({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900, user: { userId: '1', email, nickname: '회원' } })
      : response(null, 204) });
  api.verificationService.setDevelopmentAccess('tester', 'secret');
  await api.login({ email, password: 'Password123!' });
  await api.logout();
  assert.deepEqual(store.values, {});
  assert.deepEqual(store.log.at(-1), ['clearAll']);
});

test('운영 설정이나 HTTP 주소는 개발 접속 저장소를 읽거나 쓰지 않는다', async () => {
  for (const options of [{ baseUrl: 'https://server.example' }, { baseUrl: 'http://localhost:8080/api', allowDevelopmentAccess: true }]) {
    const store = memoryStore({ 'https://server.example': 'Basic dGVzdGVyOnNlY3JldA==', 'http://localhost:8080': 'Basic dGVzdGVyOnNlY3JldA==' });
    const api = createAuthApi({ ...options, developmentAccessStore: store,
      fetchImpl: async (_, init) => { assert.equal(init.headers.Authorization, undefined); return response({ available: true }); } });
    await api.checkEmailAvailability(email);
    assert.deepEqual(store.log, []);
  }
});

test('저장소를 읽지 못해도 요청은 접속 정보 없이 진행한다', async () => {
  const api = createAuthApi({ baseUrl: 'https://server.example', allowDevelopmentAccess: true,
    developmentAccessStore: { load: async () => { throw new Error('keystore'); }, save: async () => {}, clear: async () => {} },
    fetchImpl: async (_, init) => { assert.equal(init.headers.Authorization, undefined); return response({ available: true }); } });
  await api.checkEmailAvailability(email);
});
