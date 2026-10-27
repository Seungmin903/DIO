import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthApi } from '../src/auth/authApi.js';
import { createAuthenticatedNotificationSession } from '../src/notifications/authenticatedNotifications.js';
import { notificationErrorNotice } from '../src/notifications/notificationErrorNotice.js';
const tokens = (id, token) => ({ user: { userId: id, email: id+'@example.test', nickname: '회원' }, accessToken: token, refreshToken: 'refresh-'+token, expiresIn: 60 });
const reply = (data, status=200) => ({ ok: status<400, status, json: async () => data });
const login = auth => auth.login({email:'member@example.test',password:'DioMember123!'});
function fixture(options={}) {
  let time=0, serial=0, activeId='1', refreshes=0;
  const auth=createAuthApi({baseUrl:'https://api.example.test/api',now:()=>time,fetchImpl:async url=>{
    if(url.endsWith('/login')) return reply(tokens(activeId,'access-'+(++serial)));
    if(url.endsWith('/refresh')) {refreshes++;await Promise.resolve();return reply(tokens(activeId,'access-'+(++serial)));}
    return reply(null,204);
  },...options});
  const requests=[];
  return {auth,requests,fetchImpl:async(url,init)=>{requests.push({url,...init});return reply({unreadCount:1});},
    advance:ms=>{time+=ms;},expire:()=>{time+=61000;},switchTo:id=>{activeId=id;},refreshes:()=>refreshes};
}
test('로그인 화면 해제 후 토큰 유지·정규화 주소·만료 동시 요청 한 번 갱신',async()=>{
  const f=fixture();const view=await login(f.auth);assert.equal(view.accessToken,undefined);
  const session=createAuthenticatedNotificationSession({auth:f.auth,userId:'1',fetchImpl:f.fetchImpl});
  f.auth.cancelPending();await session.api.count();
  assert.equal(f.requests[0].url,'https://api.example.test/api/v1/notifications/unread-count');
  assert.equal(f.requests[0].headers.Authorization,'Bearer access-1');
  f.expire();await Promise.all([session.api.count(),session.api.count()]);assert.equal(f.refreshes(),1);
  assert.ok(f.requests.slice(1).every(r=>r.headers.Authorization==='Bearer access-2'));
});
test('로그아웃·다른 계정·같은 계정 재로그인 뒤 옛 세션은 fetch 전 차단',async()=>{
  const f=fixture();await login(f.auth);const old=createAuthenticatedNotificationSession({auth:f.auth,userId:'1',fetchImpl:f.fetchImpl});
  await f.auth.logout();await assert.rejects(old.api.count(),e=>e.status===401);
  f.switchTo('2');await login(f.auth);await assert.rejects(old.api.count(),e=>e.status===401);
  f.switchTo('1');await login(f.auth);await assert.rejects(old.api.count(),e=>e.status===401);assert.equal(f.requests.length,0);
  await createAuthenticatedNotificationSession({auth:f.auth,userId:'1',fetchImpl:f.fetchImpl}).api.count();assert.equal(f.requests.length,1);
});
test('개발 보조 인증 헤더는 기존 로그인 설정을 사용',async()=>{
  const f=fixture({accessTokenHeader:'X-DIO-Access-Token'});await login(f.auth);
  await createAuthenticatedNotificationSession({auth:f.auth,userId:'1',fetchImpl:f.fetchImpl}).api.count();
  assert.equal(f.requests[0].headers['X-DIO-Access-Token'],'access-1');assert.equal(f.requests[0].headers.Authorization,undefined);
});
test('갱신 중 계정 변경 시 새 계정 토큰이 옛 알림 요청으로 전달되지 않음',async()=>{
  let release,started,id='1',time=0;const start=new Promise(resolve=>{started=resolve;});
  const auth=createAuthApi({baseUrl:'https://api.example.test',now:()=>time,fetchImpl:async url=>{
    if(url.endsWith('/refresh')){started();return new Promise(resolve=>{release=()=>resolve(reply(tokens('1','rotated')));});}
    return reply(tokens(id,'token-'+id));
  }});
  await login(auth);let fetched=false;const session=createAuthenticatedNotificationSession({auth,userId:'1',fetchImpl:async()=>{fetched=true;}});
  time=61000;const result=session.api.count().catch(e=>e);await start;id='2';await login(auth);release();
  assert.equal((await result).status,401);assert.equal(fetched,false);
});


test('토큰 만료 30초 전 경계부터 갱신하고 직전에는 기존 토큰을 사용한다',async()=>{
  const f=fixture();await login(f.auth);const session=createAuthenticatedNotificationSession({auth:f.auth,userId:'1',fetchImpl:f.fetchImpl});
  f.advance(29999);await session.api.count();assert.equal(f.refreshes(),0);
  f.advance(1);await Promise.all([session.api.count(),session.api.count()]);assert.equal(f.refreshes(),1);
  assert.equal(f.requests[0].headers.Authorization,'Bearer access-1');
  assert.ok(f.requests.slice(1).every(r=>r.headers.Authorization==='Bearer access-2'));
});
test('유효하지 않은 expiresIn 응답은 저장하거나 매 요청 갱신하지 않고 거부한다',async()=>{
  for(const expiresIn of [undefined,'60',0,-1,NaN,Infinity,86401,90000]) {
    let refreshes=0;
    const auth=createAuthApi({baseUrl:'https://api.example.test',fetchImpl:async url=>{
      if(url.endsWith('/refresh')) refreshes++;
      return reply({...tokens('1','test'),expiresIn});
    }});
    await assert.rejects(login(auth),e=>e.code==='INVALID_AUTH_RESPONSE');
    assert.equal(auth.getSessionKey(),null);assert.equal(refreshes,0);
  }
});

test('서버 TTL 범위의 최솟값·기본값·최댓값은 로그인과 갱신에 모두 허용한다', async () => {
  for (const expiresIn of [60, 900, 86400]) {
    let time = 0, refreshes = 0;
    const auth = createAuthApi({ baseUrl: 'https://api.example.test', now: () => time, fetchImpl: async url => {
      if (url.endsWith('/refresh')) refreshes++;
      return reply({ ...tokens('1', 'valid'), expiresIn });
    } });
    await login(auth);
    const sessionKey = auth.getSessionKey();
    time = expiresIn * 1000 - Math.min(30000, expiresIn * 500);
    assert.equal(await auth.getAccessToken({ userId: '1', sessionKey }), 'valid');
    assert.equal(refreshes, 1);
    assert.equal(auth.getSessionKey(), sessionKey);
  }
});

test('동시 갱신의 네트워크·5xx 실패는 세션을 보존하고 다음 알림 조회에서 복구한다', async () => {
  for (const failure of ['network', 500, 503]) {
    let time = 0, refreshes = 0, fetched = 0, fail = true;
    const auth = createAuthApi({ baseUrl: 'https://api.example.test', now: () => time, fetchImpl: async url => {
      if (!url.endsWith('/refresh')) return reply(tokens('1', 'initial'));
      refreshes++;
      await new Promise(resolve => setTimeout(resolve, 5));
      if (fail) {
        if (failure === 'network') throw new TypeError('offline');
        return reply({ code: 'SERVER_ERROR' }, failure);
      }
      return reply(tokens('1', 'recovered'));
    } });
    await login(auth);
    const key = auth.getSessionKey();
    const session = createAuthenticatedNotificationSession({ auth, userId: '1', fetchImpl: async (_url, init) => {
      fetched++; assert.equal(init.headers.Authorization, 'Bearer recovered'); return reply({ unreadCount: 1 });
    } });
    time = 30000;
    const results = await Promise.allSettled([session.api.count(), session.api.count()]);
    assert.equal(refreshes, 1); assert.equal(fetched, 0); assert.equal(auth.getSessionKey(), key);
    for (const result of results) {
      assert.equal(result.status, 'rejected');
      assert.equal(result.reason.status, failure === 'network' ? undefined : failure);
      assert.equal(notificationErrorNotice(result.reason).canRetry, true);
    }
    fail = false;
    await session.api.count();
    assert.equal(refreshes, 2); assert.equal(fetched, 1); assert.equal(auth.getSessionKey(), key);
  }
});

test('갱신 인증 거부는 세션을 비우고 이전 알림 요청을 전송하지 않는다', async () => {
  for (const status of [401, 403]) {
    let time = 0, fetched = 0;
    const auth = createAuthApi({ baseUrl: 'https://api.example.test', now: () => time,
      fetchImpl: async url => url.endsWith('/refresh') ? reply({ code: 'AUTHENTICATION_REQUIRED' }, status) : reply(tokens('1', 'initial')) });
    await login(auth);
    const session = createAuthenticatedNotificationSession({ auth, userId: '1', fetchImpl: async () => { fetched++; } });
    time = 30000;
    await assert.rejects(session.api.count(), error => error.status === 401);
    assert.equal(auth.getSessionKey(), null); assert.equal(fetched, 0);
  }
});


test('비밀번호 재설정 완료 후 이전 알림 세션을 차단하고 재로그인은 새 세션으로 조회한다', async () => {
  let serial = 0, fetched = 0;
  const auth = createAuthApi({ baseUrl: 'https://api.example.test', fetchImpl: async url => {
    if (url.endsWith('/login')) return reply(tokens('1', 'login-' + (++serial)));
    if (url.endsWith('/password-reset-verifications')) return reply({ resetToken: 'reset-only', expiresIn: 600 });
    return reply(null, 204);
  } });
  const fetchImpl = async () => { fetched++; return reply({ unreadCount: 0 }); };
  await login(auth);
  const old = createAuthenticatedNotificationSession({ auth, userId: '1', fetchImpl });
  await auth.verifyPasswordReset('member@example.test', '123456');
  await auth.completePasswordReset({ email: 'member@example.test', newPassword: 'NewPassword123!' });
  assert.equal(auth.getSessionKey(), null);
  await assert.rejects(old.api.count(), error => error.status === 401);
  await login(auth);
  await assert.rejects(old.api.count(), error => error.status === 401);
  assert.equal(fetched, 0);
  await createAuthenticatedNotificationSession({ auth, userId: '1', fetchImpl }).api.count();
  assert.equal(fetched, 1);
});
