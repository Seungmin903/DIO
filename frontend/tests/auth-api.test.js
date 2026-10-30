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
  const result = await api.login({ email: ' MEMBER@example.com ', password: 'Password123!' });
  assert.equal(result.photoUri, 'http://localhost:8080/api/v1/auth/profile-photos/photo-id');
  assert.equal(result.nickname, '회원'); assert.equal(result.mode, 'authenticated');
  assert.equal(result.accessToken, undefined);
  assert.deepEqual(JSON.parse(calls[0].body), { email: user.email, password: 'Password123!' });
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
  assert.equal(JSON.stringify(view).includes('Basic '), false);
  for (const other of [uri.replace('server.example', 'other.example'), uri.replace('https:', 'http:'),
    uri.replace('/auth/profile-photos/', '/other/'), `${uri}?redirect=1`, 'file:///local.png']) {
    assert.deepEqual(api.getProfilePhotoSource(other), { uri: other });
  }
  const production = createAuthApi({ baseUrl: 'https://server.example' });
  assert.deepEqual(production.getProfilePhotoSource(uri), { uri });
  assert.equal(production.verificationService.setDevelopmentAccess, undefined);
});
test('로그인 실패는 실제 오류이며 mock 성공으로 대체하지 않는다', async () => {
  const { api } = setup(() => response({ detail: '이메일 또는 비밀번호가 맞지 않아요.', code: 'INVALID_CREDENTIALS' }, 401));
  await assert.rejects(api.login({ email: user.email, password: 'wrong' }), { code: 'INVALID_CREDENTIALS', status: 401 });
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
  const profile = await api.signup({ email: user.email, password: 'Password123!' });
  assert.equal(api.checkNickname, undefined);
  await assert.rejects(api.completeProfile({ ...profile, nickname: '닉네임', terms: {} }), /이메일 인증/);
  assert.deepEqual(calls.map(call => call.path), ['email-availability']);
});
test('검증 토큰·3가지 실제 약관 상태를 보내고 회원가입 후 자동 로그인하지 않는다', async () => {
  const { api, calls } = setup(call => response(call.path === 'email-verifications/verify'
    ? { signupToken: 'verified', expiresIn: 600 } : call.path === 'signup' ? { ...user, nickname: '닉네임' } : { available: true }));
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
  await assert.rejects(api.completeProfile({ ...profile, nickname: '닉네임', photoUri: 'local-photo', terms: { service: true, privacy: true } }));
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

const signupValues = { email: user.email, nickname: '회원', terms: { service: true, privacy: true, marketing: false } };
const signupResponse = call => response(call.path === 'email-verifications/verify'
  ? { signupToken: 'server-signup-token', expiresIn: 600 }
  : call.path === 'signup' ? { ...user, profilePhotoUrl: null } : { available: true });
async function prepareSignup(api, email = user.email) {
  await api.verifyEmail(email, '482901');
  return api.verificationService.prepareSignup({ email, password: 'Password123!' });
}

test('가입 초안의 이메일 가용성 응답이 boolean이 아니면 통과시키지 않는다', async () => {
  for (const value of [null, {}, { available: 'true' }, { available: 1 }]) {
    const { api } = setup(() => response(value));
    assert.equal(api.checkNickname, undefined);
    await assert.rejects(api.signup({ email: user.email, password: 'Password123!' }), /이메일 확인 정보/);
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
    { termsType: 'SERVICE', termsVersion: 'v1', agreed: true },
    { termsType: 'PRIVACY', termsVersion: 'v1', agreed: true },
    { termsType: 'MARKETING', termsVersion: 'v1', agreed: false },
  ]);
  await assert.rejects(api.completeProfile(signupValues), /이메일 인증/);
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

test('회원 탈퇴는 본문 없는 DELETE me를 호출하고 성공 후 세션을 비운다',async()=>{
 const calls=[];const api=createAuthApi({baseUrl:'http://localhost:8080/api',fetchImpl:async(url,init)=>{calls.push({url,...init});return response(url.endsWith('/login')?tokens():null,url.endsWith('/login')?200:204)}});
 const user=await api.login({email:'member@example.com',password:'Password123!'});await api.withdraw(user);
 assert.equal(calls[1].url,'http://localhost:8080/api/v1/me');assert.equal(calls[1].method,'DELETE');assert.equal(calls[1].body,undefined);assert.equal(api.getSessionKey(),null);
});
test('소유권 양도 필요나 네트워크 오류로 탈퇴가 실패하면 로그인과 재시도 경로를 유지한다',async()=>{
 for(const offline of [false,true]){
  const api=createAuthApi({baseUrl:'http://localhost:8080/api',fetchImpl:async(url)=>{if(url.endsWith('/login'))return response(tokens());if(offline)throw new TypeError('offline');return response({code:'OWNER_TRANSFER_REQUIRED',detail:'소유권을 양도해 주세요.'},409)}});
  const user=await api.login({email:'member@example.com',password:'Password123!'});const key=api.getSessionKey();await assert.rejects(api.withdraw(user));assert.equal(api.getSessionKey(),key);
 }
});
