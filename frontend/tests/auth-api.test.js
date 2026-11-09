import test from 'node:test';
import assert from 'node:assert/strict';
import { authBaseUrl, createAuthApi } from '../src/auth/authApi.js';

const user = { userId: '7', email: 'member@example.com', nickname: '회원', profilePhotoUrl: '/api/v1/auth/profile-photos/photo-id' };
const tokens = (suffix = '') => ({ user, accessToken: `access${suffix}`, refreshToken: `refresh${suffix}`, expiresIn: 900 });
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
  assert.equal(api.getCurrentUserId(), null);
  const result = await api.login({ email: ' MEMBER@example.com ', password: 'Password123!' });
  assert.equal(result.photoUri, 'http://localhost:8080/api/v1/auth/profile-photos/photo-id');
  assert.equal(result.nickname, '회원'); assert.equal(result.mode, 'authenticated');
  assert.equal(result.accessToken, undefined);
  assert.equal(api.getCurrentUserId(), user.userId);
  assert.deepEqual(JSON.parse(calls[0].body), { email: user.email, password: 'Password123!' });
});

test('미리 설정한 개발 접속 정보는 첫 요청부터 Basic으로 붙이고 로그아웃 뒤에도 다시 넣는다', async () => {
  const headers = [];
  const basic = `Basic ${Buffer.from('qa-id:qa-pw').toString('base64')}`;
  const api = createAuthApi({ baseUrl: 'https://server.example:8443', allowDevelopmentAccess: true,
    presetDevelopmentAccess: { username: 'qa-id', password: 'qa-pw' },
    fetchImpl: async (_url, init) => { headers.push(init.headers); return response(tokens()); } });
  await api.login({ email: user.email, password: 'Password123!' });
  assert.equal(headers[0].Authorization, basic);
  await api.logout();
  assert.equal(headers[1].Authorization, basic);
  assert.equal(headers[1]['X-DIO-Access-Token'], tokens().accessToken);
  await api.login({ email: user.email, password: 'Password123!' });
  assert.equal(headers[2].Authorization, basic);
  const plain = createAuthApi({ baseUrl: 'http://localhost:8080', allowDevelopmentAccess: true,
    presetDevelopmentAccess: { username: 'qa-id', password: 'qa-pw' },
    fetchImpl: async (_url, init) => { headers.push(init.headers); return response(tokens()); } });
  await plain.login({ email: user.email, password: 'Password123!' });
  assert.equal(headers[3].Authorization, undefined);
  const release = createAuthApi({ baseUrl: 'https://server.example', allowDevelopmentAccess: false,
    presetDevelopmentAccess: { username: 'qa-id', password: 'qa-pw' },
    fetchImpl: async (_url, init) => { headers.push(init.headers); return response(tokens()); } });
  await release.login({ email: user.email, password: 'Password123!' });
  assert.equal(headers[4].Authorization, undefined);
});

test('서버가 거절한 개발 접속 프리셋은 다시 넣지 않고 수동 입력 흐름으로 넘어간다', async () => {
  const headers = [];
  const basicChallenge = { status: 401, ok: false, json: async () => null, headers: { get: name => name === 'WWW-Authenticate' ? 'Basic realm="DIO Development"' : null } };
  const manual = `Basic ${Buffer.from('tester:secret').toString('base64')}`;
  const api = createAuthApi({ baseUrl: 'https://server.example:8443', allowDevelopmentAccess: true,
    presetDevelopmentAccess: { username: 'stale-id', password: 'stale-pw' },
    fetchImpl: async (_url, init) => { headers.push(init.headers); return init.headers.Authorization === manual ? response(tokens()) : basicChallenge; } });
  await assert.rejects(api.login({ email: user.email, password: 'Password123!' }), error => error.code === 'DEVELOPMENT_ACCESS_REQUIRED');
  assert.equal(headers[0].Authorization, `Basic ${Buffer.from('stale-id:stale-pw').toString('base64')}`);
  await assert.rejects(api.login({ email: user.email, password: 'Password123!' }), error => error.code === 'DEVELOPMENT_ACCESS_REQUIRED');
  assert.equal(headers[1].Authorization, undefined);
  api.verificationService.setDevelopmentAccess('tester', 'secret');
  await api.login({ email: user.email, password: 'Password123!' });
  assert.equal(headers[2].Authorization, manual);
  await api.logout();
  await assert.rejects(api.login({ email: user.email, password: 'Password123!' }), error => error.code === 'DEVELOPMENT_ACCESS_REQUIRED');
  assert.equal(headers[4].Authorization, undefined);
});

test('프로필 사진은 같은 서버의 사진 경로에만 개발 접속 인증을 보내고 회원 토큰은 보내지 않는다', async () => {
  const uri = 'https://server.example/api/v1/auth/profile-photos/12345678-1234-1234-1234-123456789abc';
  const api = createAuthApi({ baseUrl: 'https://server.example', allowDevelopmentAccess: true,
    fetchImpl: async () => response(tokens()) });
  assert.deepEqual(api.getProfilePhotoSource(uri), { uri });
  api.verificationService.setDevelopmentAccess('tester', 'secret');
  const view = await api.login({ email: user.email, password: 'Password123!' });
  const source = api.getProfilePhotoSource(uri);
  assert.equal(source.headers.Authorization, `Basic ${Buffer.from('tester:secret').toString('base64')}`);
  assert.equal(source.headers['X-DIO-Access-Token'], undefined);
  const portApi = createAuthApi({ baseUrl: 'https://server.example:8443', allowDevelopmentAccess: true,
    fetchImpl: async () => response(tokens()) });
  portApi.verificationService.setDevelopmentAccess('tester', 'secret');
  const portSource = portApi.getProfilePhotoSource(uri);
  assert.equal(portSource.uri, 'https://server.example:8443/api/v1/auth/profile-photos/12345678-1234-1234-1234-123456789abc');
  assert.equal(portSource.headers.Authorization, `Basic ${Buffer.from('tester:secret').toString('base64')}`);
  assert.equal(JSON.stringify(view).includes('Basic '), false);
  for (const other of [uri.replace('server.example', 'other.example'), uri.replace('https:', 'http:'),
    uri.replace('/auth/profile-photos/', '/other/'), `${uri}?redirect=1`, 'file:///local.png',
    uri.replace('https://', 'https://user:pw@'), uri.replace('https://', 'https://user@')]) {
    assert.deepEqual(api.getProfilePhotoSource(other), { uri: other });
  }
  const production = createAuthApi({ baseUrl: 'https://server.example' });
  assert.deepEqual(production.getProfilePhotoSource(uri), { uri });
  assert.equal(production.verificationService.setDevelopmentAccess, undefined);
});
test('로그인 실패 시 서버 원문 대신 오류 코드에 맞는 한국어 안내를 표시한다', async () => {
  const { api } = setup(() => response({ detail: 'UsernamePasswordAuthentication failed', code: 'INVALID_CREDENTIALS' }, 401));
  await assert.rejects(api.login({ email: user.email, password: 'wrong' }), {
    code: 'INVALID_CREDENTIALS', status: 401, message: '이메일 또는 비밀번호를 확인해 주세요.',
  });
});

test('알 수 없는 인증 오류나 서버 장애는 서버 원문을 노출하지 않는다', async () => {
  const fallback = '요청을 처리하지 못했어요. 다시 시도해 주세요.';
  for (const { status, code, message } of [
    { status: 400, code: 'UNKNOWN_AUTH_FAILURE', message: fallback },
    { status: 400, code: undefined, message: fallback },
    { status: 503, code: 'INVALID_CREDENTIALS', message: '서버에 문제가 있어요. 잠시 후 다시 시도해 주세요.' },
  ]) {
    const { api } = setup(() => response({ detail: 'Internal provider response', code }, status));
    await assert.rejects(api.login({ email: user.email, password: 'wrong' }), { code, status, message });
  }
});

test('잘못된 로그인 응답은 사용자 화면·세션으로 채택하지 않는다', async () => {
  for (const bad of [null, {}, { ...tokens(), accessToken: '' }, { ...tokens(), refreshToken: null },
    { ...tokens(), user: null }, { ...tokens(), user: { ...user, userId: '' } },
    { ...tokens(), user: { ...user, nickname: '' } },
    { ...tokens(), user: { ...user, email: 'other@example.com' } },
    { ...tokens(), user: { ...user, profilePhotoUrl: 'javascript:alert(1)' } }]) {
    const { api } = setup(() => response(bad));
    await assert.rejects(api.login({ email: user.email, password: 'Password123!' }), { code: 'INVALID_AUTH_RESPONSE' });
    assert.equal(api.getSessionKey(), null);
  }
});

test('통신 실패와 자격 증명 오류를 구분하고 실패 후 다시 로그인할 수 있다', async () => {
  let fail = true;
  const { api } = setup(() => { if (fail) throw new TypeError('offline'); return response(tokens()); });
  await assert.rejects(api.login({ email: user.email, password: 'Password123!' }), /서버에 연결하지 못했어요/);
  assert.equal(api.getSessionKey(), null);
  fail = false;
  assert.equal((await api.login({ email: user.email, password: 'Password123!' })).userId, user.userId);
});
test('이메일 확인은 유지하고 닉네임 확인 API 없이 이메일 인증을 요구한다', async () => {
  const { api, calls } = setup(() => response({ available: true }));
  const profile = await api.signup({ ageConfirmed: true, email: user.email, password: 'Password123!' });
  assert.equal(api.checkNickname, undefined);
  await assert.rejects(api.completeProfile({ ...profile, nickname: '닉네임', terms: {} }), /이메일 인증/);
  assert.deepEqual(calls.map(call => call.path), ['email-availability']);
});
test('검증 토큰·필수 약관 v2 상태를 보내고 회원가입 후 자동 로그인하지 않는다', async () => {
  const { api, calls } = setup(call => response(call.path === 'email-verifications/verify'
    ? { signupToken: 'verified', expiresIn: 600 } : call.path === 'signup' ? { ...user, nickname: '닉네임' } : { available: true }));
  const profile = await api.signup({ ageConfirmed: true, email: user.email, password: 'Password123!' });
  await api.verifyEmail(user.email, '123456');
  const result = await api.completeProfile({ ...profile, nickname: '닉네임', terms: { service: true, privacy: true, marketing: false, adEmail: true, adPush: false } });
  const body = JSON.parse(calls.at(-1).body);
  assert.equal(body.signupToken, 'verified'); assert.equal(body.profileColor, undefined);
  assert.deepEqual(body.agreements.map(term => [term.termsType, term.agreed]), [['SERVICE', true], ['PRIVACY', true], ['AD_EMAIL', true], ['AD_PUSH', false]]);
  assert.equal(result.mode, 'registered');
  const count = calls.length; await api.logout(); assert.equal(calls.length, count);
});
test('사진 multipart는 Content-Type을 강제하지 않고 실패해도 임시 파일을 삭제한다', async () => {
  let disposed = 0;
  const form = new FormData();
  const { api, calls } = setup(call => call.path === 'signup' ? response({ detail: '오류' }, 400)
    : response(call.path === 'email-verifications/verify' ? { signupToken: 'verified', expiresIn: 600 } : { available: true }),
  { buildPhotoBody: async () => ({ body: form, dispose: () => disposed++ }) });
  const profile = await api.signup({ ageConfirmed: true, email: user.email, password: 'Password123!' });
  await api.verifyEmail(user.email, '123456');
  await assert.rejects(api.completeProfile({ ...profile, nickname: '닉네임', photoUri: 'local-photo', terms: { service: true, privacy: true } }));
  assert.equal(calls.at(-1).body, form); assert.equal(calls.at(-1).headers['Content-Type'], undefined);
  assert.equal(disposed, 1);
});
test('만료되거나 다른 이메일의 인증으로 가입할 수 없다', async () => {
  let time = 0;
  const { api, calls } = setup(call => response(call.path === 'email-verifications/verify'
    ? { signupToken: 'verified', expiresIn: 600 } : { available: true }), { now: () => time });
  const profile = await api.signup({ ageConfirmed: true, email: user.email, password: 'Password123!' });
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
  await assert.rejects(api.social('google', {ageConfirmed:true}), /연결되지/); assert.equal(calls.length, 0);
});

test('개발 프록시에서는 Basic 헤더와 충돌하지 않는 별도 토큰 헤더를 사용한다', async () => {
  const { api, calls } = setup(call => call.path === 'login' ? response(tokens()) : response(null, 204), { accessTokenHeader: 'X-DIO-Access-Token' });
  await api.login({ email: user.email, password: 'Password123!' });
  await api.logout();
  assert.equal(calls.at(-1).headers['X-DIO-Access-Token'], 'access');
  assert.equal(calls.at(-1).headers.Authorization, undefined);
});

const signupValues = { email: user.email, nickname: '회원', terms: { service: true, privacy: true, marketing: false } };

test('연령 확인 누락·거부는 가입 초안을 만들거나 서버 요청을 전송하지 않는다', async () => {
 const { api, calls } = setup(() => response({ available: true }));
 for (const ageConfirmed of [undefined, null, false, 'true']) {
  await assert.rejects(api.signup({ email: user.email, password: 'Password123!', ageConfirmed }), /14세/);
 }
 assert.equal(calls.length, 0);
});
const signupResponse = call => response(call.path === 'email-verifications/verify'
  ? { signupToken: 'server-signup-token', expiresIn: 600 }
  : call.path === 'signup' ? { ...user, profilePhotoUrl: null } : { available: true });
async function prepareSignup(api, email = user.email) {
  await api.verifyEmail(email, '482901');
  return api.verificationService.prepareSignup({ ageConfirmed: true, email, password: 'Password123!' });
}

test('가입 초안의 이메일 가용성 응답이 boolean이 아니면 통과시키지 않는다', async () => {
  for (const value of [null, {}, { available: 'true' }, { available: 1 }]) {
    const { api } = setup(() => response(value));
    assert.equal(api.checkNickname, undefined);
    await assert.rejects(api.signup({ ageConfirmed: true, email: user.email, password: 'Password123!' }), /이메일 확인 정보/);
  }
});

test('필수 약관·닉네임 검증 실패 시 가입 요청 없이 같은 인증으로 다시 입력할 수 있다', async () => {
  const { api, calls } = setup(signupResponse);
  await prepareSignup(api);
  for (const terms of [{}, { service: true }, { service: true, privacy: false }]) {
    await assert.rejects(api.completeProfile({ ...signupValues, terms }), /필수 약관/);
  }
  await assert.rejects(api.completeProfile({ ...signupValues, nickname: '!' }), /닉네임|2~12/);
  assert.equal(calls.filter(call => call.path === 'signup').length, 0);
  const result = await api.completeProfile({ ...signupValues, nickname: ' 회원 ' });
  assert.equal(result.mode, 'registered');
  const body = JSON.parse(calls.at(-1).body);
  assert.equal(body.email, user.email);
  assert.equal(body.password, 'Password123!');
  assert.equal(body.nickname, '회원');
  assert.deepEqual(body.agreements, [
    { termsType: 'SERVICE', termsVersion: 'v2', agreed: true },
    { termsType: 'PRIVACY', termsVersion: 'v2', agreed: true },
  ]);
  await assert.rejects(api.completeProfile(signupValues), { code: 'SIGNUP_DRAFT_REQUIRED' });
  assert.equal(api.getSessionKey(), null);
});

test('사진 변환 중 가입 연타는 한 요청만 보내고 사진 multipart와 가입 토큰을 유지한다', async () => {
  let release, photoBody, disposed = 0;
  const form = new FormData();
  const { api, calls } = setup(signupResponse, { buildPhotoBody: (body, uri) => {
    photoBody = body;
    assert.equal(uri, 'picker/profile');
    return new Promise(resolve => { release = () => resolve({ body: form, dispose: () => disposed++ }); });
  } });
  await prepareSignup(api);
  const pending = api.completeProfile({ ...signupValues, photoUri: 'picker/profile' });
  await assert.rejects(api.completeProfile(signupValues), /처리하고/);
  assert.equal(calls.some(call => call.path === 'signup'), false);
  release();
  assert.equal((await pending).mode, 'registered');
  assert.equal(photoBody.signupToken, 'server-signup-token');
  assert.equal(calls.at(-1).body, form);
  assert.equal(calls.at(-1).headers['Content-Type'], undefined);
  assert.equal(calls.filter(call => call.path === 'signup').length, 1);
  assert.equal(disposed, 1);
});

test('사진 변환 중 화면 이탈 또는 인증 만료 시 가입을 전송하지 않고 변환 사진을 정리한다', async () => {
  for (const leave of [true, false]) {
    let release, disposed = 0, time = 0;
    const { api, calls } = setup(signupResponse, { now: () => time,
      buildPhotoBody: () => new Promise(resolve => { release = () => resolve({ body: new FormData(), dispose: () => disposed++ }); }) });
    await prepareSignup(api);
    const pending = api.completeProfile({ ...signupValues, photoUri: 'picker/profile' });
    if (leave) api.cancelPending(); else time = 600000;
    release();
    await assert.rejects(pending, leave ? /취소/ : /만료/);
    assert.equal(calls.some(call => call.path === 'signup'), false);
    assert.equal(disposed, 1);
  }
});

test('이전 가입 성공·토큰 오류가 늦게 도착해도 새 이메일의 가입 초안을 지우지 않는다', async () => {
  for (const status of [201, 400]) {
    let release;
    const { api, calls } = setup(call => call.path === 'signup' && !release
      ? new Promise(resolve => { release = () => resolve(status === 201 ? response(user, status)
        : response({ code: 'INVALID_SIGNUP_TOKEN', detail: '다시 인증해 주세요.' }, status)); })
      : call.path === 'signup' ? response({ ...user, email: 'new@example.com', profilePhotoUrl: null }, 201)
      : signupResponse(call));
    await prepareSignup(api);
    const pending = api.completeProfile(signupValues);
    api.cancelPending();
    await prepareSignup(api, 'new@example.com');
    release();
    await assert.rejects(pending);
    const result = await api.completeProfile({ ...signupValues, email: 'new@example.com' });
    assert.equal(result.email, 'new@example.com');
    assert.equal(calls.filter(call => call.path === 'signup').length, 2);
  }
});

test('사진 변환·통신·닉네임 충돌 오류 후 입력을 보존하고 가입을 재시도한다', async () => {
  for (const failure of ['photo', 'network', 'server']) {
    let failed = false;
    const { api, calls } = setup(call => {
      if (call.path !== 'signup' || failed) return signupResponse(call);
      failed = true;
      if (failure === 'network') throw new Error('offline');
      return response({ code: 'SIGNUP_PERSISTENCE_FAILED', detail: '가입을 완료하지 못했어요.' }, 409);
    }, { buildPhotoBody: async () => {
      if (!failed) { failed = true; throw new Error('사진 변환 실패'); }
      return { body: new FormData(), dispose() {} };
    } });
    await prepareSignup(api);
    await assert.rejects(api.completeProfile({ ...signupValues, ...(failure === 'photo' ? { photoUri: 'picker/profile' } : {}) }));
    const result = await api.completeProfile(signupValues);
    assert.equal(result.mode, 'registered');
    assert.equal(JSON.parse(calls.at(-1).body).signupToken, 'server-signup-token');
  }
});

test('서버가 거절한 인증 토큰으로 다시 가입하지 않고 재인증 후에는 가입할 수 있다', async () => {
  let rejected = false;
  const { api, calls } = setup(call => {
    if (call.path === 'signup' && !rejected) {
      rejected = true;
      return response({ code: 'INVALID_SIGNUP_TOKEN', detail: '이메일 인증을 다시 진행해 주세요.' }, 400);
    }
    return signupResponse(call);
  });
  await prepareSignup(api);
  await assert.rejects(api.completeProfile(signupValues), { code: 'INVALID_SIGNUP_TOKEN' });
  await assert.rejects(api.completeProfile(signupValues), /이메일 인증/);
  assert.equal(calls.filter(call => call.path === 'signup').length, 1);
  await prepareSignup(api);
  assert.equal((await api.completeProfile(signupValues)).mode, 'registered');
});

test('비정상·다른 계정의 가입 응답은 완료로 표시하지 않는다', async () => {
  for (const data of [null, {}, { ...user, userId: '' }, { ...user, email: 'other@example.com' },
    { ...user, nickname: '다른이름' }, { ...user, profilePhotoUrl: 7 }]) {
    const { api } = setup(call => call.path === 'signup' ? response(data, 201) : signupResponse(call));
    await prepareSignup(api);
    await assert.rejects(api.completeProfile(signupValues), /가입 결과/);
    assert.equal(api.getSessionKey(), null);
  }
});

test('임시 사진 정리 실패가 서버 가입 성공 또는 원래 서버 오류를 덮어쓰지 않는다', async () => {
  for (const status of [201, 413]) {
    const { api } = setup(call => call.path === 'signup'
      ? response(status === 201 ? user : { code: 'PROFILE_PHOTO_TOO_LARGE', detail: '사진이 너무 커요.' }, status)
      : signupResponse(call),
    { buildPhotoBody: async () => ({ body: new FormData(), dispose: async () => { throw new Error('cleanup failed'); } }) });
    await prepareSignup(api);
    const pending = api.completeProfile({ ...signupValues, photoUri: 'picker/profile' });
    if (status === 201) assert.equal((await pending).mode, 'registered');
    else await assert.rejects(pending, { status: 413, code: 'PROFILE_PHOTO_TOO_LARGE' });
  }
});


test('공동 편집 개발 인증은 같은 서버의 허용 경로·현재 계정에만 전달한다',async()=>{
 const {api}=setup(()=>response(tokens()),{baseUrl:'https://dio.example/api/v1',allowDevelopmentAccess:true})
 api.verificationService.setDevelopmentAccess('qa-user','qa-pass')
 await api.login({email:user.email,password:'Password123!'})
 const current={userId:user.userId,sessionKey:api.getSessionKey()}
 assert.match(api.getCollaborationHeaders({...current,url:'wss://dio.example/ws/diaries/diary-id'}).Authorization,/^Basic /)
 assert.match(api.getCollaborationHeaders({...current,url:'https://dio.example/api/v1/pages/page-id'}).Authorization,/^Basic /)
 assert.match(api.getCollaborationHeaders({...current,url:'https://dio.example/api/v1/diaries/10000000-0000-4000-8000-000000000001/pages'}).Authorization,/^Basic /)
 assert.match(api.getCollaborationHeaders({...current,url:'https://dio.example/api/v1/diaries/10000000-0000-4000-8000-000000000001/pages/order'}).Authorization,/^Basic /)
 for(const url of ['https://other.example/api/v1/pages/page-id','ws://dio.example/ws/diaries/diary-id','https://dio.example/not-allowed','https://name@dio.example/api/v1/pages/page-id'])
  assert.throws(()=>api.getCollaborationHeaders({...current,url}))
 assert.throws(()=>api.getCollaborationHeaders({...current,userId:'other',url:'https://dio.example/api/v1/pages/page-id'}))
})

test('WebSocket 정책 종료의 강제 토큰 갱신도 동시 요청은 한 번으로 합친다',async()=>{
 let finish,refreshes=0
 const {api}=setup(call=>{
  if(call.path==='refresh'){refreshes++;return new Promise(resolve=>{finish=()=>resolve(response(tokens('-new')))})}
  return response(tokens())
 })
 await api.login({email:user.email,password:'Password123!'})
 const options={userId:user.userId,sessionKey:api.getSessionKey(),forceRefresh:true}
 const first=api.getAccessToken(options),second=api.getAccessToken(options)
 assert.equal(refreshes,1);finish()
 assert.deepEqual(await Promise.all([first,second]),['access-new','access-new']);assert.equal(refreshes,1)
})
test('서버 계약의 사진 없는 null 응답은 로그인·갱신 모두 허용한다', async () => {
  const { api } = setup(() => response({ ...tokens(), user: { ...user, profilePhotoUrl: null } }));
  assert.equal((await api.login({ email: user.email, password: 'Password123!' })).photoUri, null);
  await api.refresh();
  assert.ok(await api.getAccessToken({ userId: user.userId, sessionKey: api.getSessionKey() }));
});

test('서버 계약과 달리 사용자 정보 없는 갱신 응답은 세션으로 채택하지 않는다', async () => {
  const { api } = setup(call => response(call.path === 'refresh' ? { ...tokens(), user: undefined } : tokens()));
  await api.login({ email: user.email, password: 'Password123!' });
  await assert.rejects(api.refresh(), { code: 'INVALID_AUTH_RESPONSE' });
  assert.equal(api.getSessionKey(), null);
});

test('비밀번호 변경은 기존 me/password에 PATCH하고 성공 시 세션을 비운다',async()=>{
 const calls=[];const api=createAuthApi({baseUrl:'http://localhost:8080/api',fetchImpl:async(url,init)=>{calls.push({url,...init});return response(url.endsWith('/login')?tokens():null,url.endsWith('/login')?200:204)}});
 const user=await api.login({email:'member@example.com',password:'Password123!'});
 await api.changePassword(user,{currentPassword:'Password123!',password:'ChangedDio123!',confirmation:'ChangedDio123!'});
 assert.equal(calls[1].url,'http://localhost:8080/api/v1/me/password');assert.equal(calls[1].method,'PATCH');
 assert.deepEqual(JSON.parse(calls[1].body),{currentPassword:'Password123!',newPassword:'ChangedDio123!'});
 assert.equal(calls[1].headers.Authorization,'Bearer access');assert.equal(api.getSessionKey(),null);
});
test('현재 비밀번호 거절과 네트워크 실패는 로그인 세션을 유지한다',async()=>{
 for(const network of [false,true]){
  const api=createAuthApi({baseUrl:'http://localhost:8080/api',fetchImpl:async(url)=>{if(url.endsWith('/login'))return response(tokens());if(network)throw new TypeError('offline');return response({code:'CURRENT_PASSWORD_MISMATCH',detail:'현재 비밀번호가 맞지 않아요.'},400)}});
  const user=await api.login({email:'member@example.com',password:'Password123!'});const key=api.getSessionKey();
  await assert.rejects(api.changePassword(user,{currentPassword:'Wrong123!',password:'ChangedDio123!',confirmation:'ChangedDio123!'}));assert.equal(api.getSessionKey(),key);
 }
});

test('회원 탈퇴는 DELETE me로 요청하고 성공한 세션만 지운다', async () => {
 const calls=[]; const api=createAuthApi({baseUrl:'http://localhost:8080/api',fetchImpl:async(url,init)=>{
  calls.push({url,...init}); return response(url.endsWith('/login') ? tokens() : null, url.endsWith('/login') ? 200 : 204);
 }});
 const loggedIn=await api.login({email:user.email,password:'Password123!'});
 await api.withdraw(loggedIn);
 assert.equal(calls[1].url,'http://localhost:8080/api/v1/me'); assert.equal(calls[1].method,'DELETE');
 assert.equal(calls[1].body,undefined); assert.equal(calls[1].headers.Authorization,'Bearer access');
 assert.equal(api.getSessionKey(),null);
});

test('애플 회원 탈퇴는 애플 재확인 후 authorizationCode를 보내고, 실패하면 세션을 유지한다', async () => {
 for (const outcome of ['success','cancel','revokeFailed']) {
  const calls=[]; let appleCalls=0;
  const api=createAuthApi({baseUrl:'http://localhost:8080/api',
   appleSignIn:async()=>{appleCalls++;if(outcome==='cancel')throw new Error('애플 로그인을 취소했어요.');return {idToken:'id',authorizationCode:'apple-code'};},
   fetchImpl:async(url,init)=>{
    calls.push({url,...init});
    if(url.endsWith('/login'))return response(tokens(),200);
    if(!init.body)return response({code:'APPLE_REAUTH_REQUIRED',detail:'탈퇴하려면 애플 계정으로 한 번 더 확인해 주세요.'},400);
    return outcome==='revokeFailed'?response({code:'APPLE_REVOKE_UNAVAILABLE',detail:'애플 계정 연결을 해제하지 못했어요.'},503):response(null,204);
   }});
  const loggedIn=await api.login({email:user.email,password:'Password123!'}), key=api.getSessionKey();
  if(outcome==='success'){
   await api.withdraw(loggedIn);
   assert.equal(calls.length,3);assert.equal(calls[2].method,'DELETE');
   assert.equal(calls[2].headers['Content-Type'],'application/json');
   assert.deepEqual(JSON.parse(calls[2].body),{appleAuthorizationCode:'apple-code'});
   assert.equal(api.getSessionKey(),null);
  }else{
   await assert.rejects(api.withdraw(loggedIn),outcome==='cancel'?/취소/:{code:'APPLE_REVOKE_UNAVAILABLE'});
   assert.equal(api.getSessionKey(),key);
  }
  assert.equal(appleCalls,1);
 }
});

test('회원 탈퇴 실패 시 로그인 세션을 유지해 다시 시도할 수 있다', async () => {
 const api=createAuthApi({baseUrl:'http://localhost:8080/api',fetchImpl:async(url)=>
  response(url.endsWith('/login') ? tokens() : {code:'WITHDRAWAL_FAILED',detail:'탈퇴 처리에 실패했어요.'}, url.endsWith('/login') ? 200 : 500)});
 const loggedIn=await api.login({email:user.email,password:'Password123!'}), key=api.getSessionKey();
 await assert.rejects(api.withdraw(loggedIn),{code:'WITHDRAWAL_FAILED',status:500});
 assert.equal(api.getSessionKey(),key);
});

test('회원정보 수정은 본인 토큰으로 PATCH me를 호출하고 갱신된 사용자 정보를 반환한다', async () => {
  const calls = [];
  const api = createAuthApi({ baseUrl: 'http://localhost:8080/api', fetchImpl: async (url, init) => {
    calls.push({ url, ...init });
    if (url.endsWith('/auth/login')) return response(tokens());
    return response({ ...user, nickname: '바뀐이름' });
  } });
  const loggedIn = await api.login({ email: user.email, password: 'Password123!' });
  const updated = await api.updateProfile(loggedIn, { nickname: ' 바뀐이름 ', photoUri: loggedIn.photoUri });
  assert.equal(calls[1].url, 'http://localhost:8080/api/v1/me');
  assert.equal(calls[1].method, 'PATCH');
  assert.equal(calls[1].headers.Authorization, 'Bearer access');
  assert.deepEqual(JSON.parse(calls[1].body), { nickname: '바뀐이름' });
  assert.equal(updated.nickname, '바뀐이름');
  assert.equal((await api.getAccessToken({ userId: user.userId, sessionKey: api.getSessionKey() })), 'access');
});

test('회원정보 조회는 본인 토큰으로 GET me를 호출하고 서버 닉네임으로 세션을 갱신한다', async () => {
  const calls = [];
  const api = createAuthApi({ baseUrl: 'http://localhost:8080/api', fetchImpl: async (url, init) => {
    calls.push({ url, ...init });
    if (url.endsWith('/auth/login')) return response(tokens());
    return response({ ...user, nickname: '다른기기이름' });
  } });
  const loggedIn = await api.login({ email: user.email, password: 'Password123!' });
  const profile = await api.getProfile(loggedIn);
  assert.equal(calls[1].url, 'http://localhost:8080/api/v1/me');
  assert.equal(calls[1].method, 'GET');
  assert.equal(calls[1].body, undefined);
  assert.equal(calls[1].headers.Authorization, 'Bearer access');
  assert.equal(profile.nickname, '다른기기이름');
  assert.equal(profile.mode, 'authenticated');
  await assert.rejects(api.getProfile({ ...loggedIn, userId: 'other' }), { code: 'AUTHENTICATION_REQUIRED' });
  assert.equal(calls.length, 2);
});

test('회원정보 조회는 숫자 userId 응답도 현재 로그인 계정으로 받아들인다', async () => {
  const api = createAuthApi({ baseUrl: 'http://localhost:8080/api', fetchImpl: async (url) =>
    response(url.endsWith('/auth/login') ? tokens() : { ...user, userId: 7, nickname: '숫자 식별자' }) });
  const loggedIn = await api.login({ email: user.email, password: 'Password123!' });
  const profile = await api.getProfile(loggedIn);
  assert.equal(profile.userId, 7);
  assert.equal(profile.nickname, '숫자 식별자');
});

test('회원정보 조회는 다른 계정 응답을 받아들이지 않는다', async () => {
  const api = createAuthApi({ baseUrl: 'http://localhost:8080/api', fetchImpl: async (url) =>
    response(url.endsWith('/auth/login') ? tokens() : { ...user, userId: 'other' }) });
  const loggedIn = await api.login({ email: user.email, password: 'Password123!' });
  await assert.rejects(api.getProfile(loggedIn), { code: 'INVALID_PROFILE_RESPONSE' });
});

test('회원정보 수정은 본인 계정에서 사진 multipart를 전송하고 다른 계정 요청은 막는다', async () => {
  const { api, calls } = setup(() => response(tokens()), {
    buildPhotoBody: async (profile, uri, partName) => ({ body: JSON.stringify({ profile, uri, partName }), dispose() {} }),
  });
  const loggedIn = await api.login({ email: user.email, password: 'Password123!' });
  await assert.rejects(api.updateProfile({ ...loggedIn, userId: 'other' }, { nickname: '바뀐이름', photoUri: loggedIn.photoUri }), { code: 'AUTHENTICATION_REQUIRED' });
  const updated = await api.updateProfile(loggedIn, { nickname: '바뀐이름', photoUri: 'file:///new-photo.png' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, 'PATCH');
  assert.equal(calls[1].headers['Content-Type'], undefined);
  assert.deepEqual(JSON.parse(calls[1].body), {
    profile: { nickname: '바뀐이름', removeProfilePhoto: false }, uri: 'file:///new-photo.png', partName: 'profile',
  });
  assert.equal(updated.nickname, '회원');
});

test('인증 응답의 1시간 기한을 사용하여 10분이 지나도 가입을 완료한다', async () => {
 let time=0;
 const {api,calls}=setup(call=>call.path==='email-verifications/verify'
  ?response({signupToken:'hour-token',expiresIn:3600}):signupResponse(call),{now:()=>time});
 await prepareSignup(api);time=45*60*1000;
 assert.equal((await api.completeProfile(signupValues)).mode,'registered');
 assert.equal(JSON.parse(calls.at(-1).body).signupToken,'hour-token');
});

test('가입 초안 유실·다른 이메일은 토큰 만료와 구분하고 서버로 보내지 않는다',async()=>{
 const {api,calls}=setup(signupResponse);
 await assert.rejects(api.completeProfile(signupValues),{code:'SIGNUP_DRAFT_REQUIRED'});
 await prepareSignup(api);
 await assert.rejects(api.completeProfile({...signupValues,email:'other@example.com'}),{code:'SIGNUP_DRAFT_REQUIRED'});
 api.cancelPending();
 await assert.rejects(api.completeProfile(signupValues),{code:'SIGNUP_DRAFT_REQUIRED'});
 assert.equal(calls.some(call=>call.path==='signup'),false);
});
