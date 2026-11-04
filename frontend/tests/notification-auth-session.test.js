import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthApi } from '../src/auth/authApi.js';
import { createAuthenticatedNotificationSession } from '../src/notifications/authenticatedNotifications.js';
import { notificationErrorNotice } from '../src/notifications/notificationErrorNotice.js';
import { createNotificationStore } from '../src/notifications/notificationStore.js';
const tokens = (id, token) => ({ user: { userId: id, email: 'member@example.test', nickname: '회원' }, accessToken: token, refreshToken: 'refresh-'+token, expiresIn: 60 });
const reply = (data, status=200) => ({ ok: status<400, status, json: async () => data });
const login = auth => auth.login({email:'member@example.test',password:'DioMember123!'});
test('공유 factory 생성 실패·잘못된 반환값에도 기본 알림 조회와 미연결 안내는 유지한다',async()=>{
  const cases=[()=>{throw new Error('internal detail');},()=>({}),()=>({get:null}),()=>Promise.resolve({get:async()=>({})}),()=>Promise.reject(new Error('internal detail')),()=>null,42];
  for(const createInvitations of cases){
    const f=fixture();await login(f.auth);
    const session=createAuthenticatedNotificationSession({auth:f.auth,userId:'1',fetchImpl:f.fetchImpl,createInvitations});
    assert.deepEqual(await session.api.count(),{unreadCount:1});
    await assert.rejects(session.invitations.get('invite-1'),error=>{
      assert.equal(error.code,'INVITATION_NOT_CONNECTED');
      assert.equal(notificationErrorNotice(error).canRetry,false);
      assert.equal(error.message.includes('internal detail'),false);return true;
    });
  }
});
test('직접 주입한 gateway가 있으면 factory를 호출하지 않고 잘못된 직접 gateway는 차단한다',async()=>{
  const f=fixture();await login(f.auth);let called=0;
  const options={auth:f.auth,userId:'1',fetchImpl:f.fetchImpl,createInvitations:()=>{called++;throw new Error('unused');}};
  const valid=createAuthenticatedNotificationSession({...options,invitations:{get:async id=>({inviteId:id})}});
  assert.equal((await valid.invitations.get('invite-1')).inviteId,'invite-1');assert.equal(called,0);
  const invalid=createAuthenticatedNotificationSession({...options,invitations:{get:'invalid'}});
  await assert.rejects(invalid.invitations.get('invite-1'),e=>e.code==='INVITATION_NOT_CONNECTED');
  assert.equal(called,0);assert.deepEqual(await invalid.api.count(),{unreadCount:1});
});
test('AuthenticatedNotificationProvider는 createInvitations를 세션 gateway까지 전달한다', async () => {
  const { createRequire } = await import('node:module');
  const { readFileSync } = await import('node:fs');
  const require = createRequire(import.meta.url);
  const expoRequire = createRequire(require.resolve('expo/package.json'));
  const { transformSync } = expoRequire('@babel/core');
  const file = new URL('../src/notifications/NotificationProvider.js', import.meta.url);
  const { code } = transformSync(readFileSync(file, 'utf8'), {
    babelrc: false, configFile: false,
    plugins: [[expoRequire.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expoRequire.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  let memoValue, providerProps, receivedDescribe;
  const react = { createContext: value => ({ value }), useContext: context => context.value,
    useMemo: factory => { memoValue = factory(); return memoValue; },
    createElement: (type, props, children) => { providerProps = { type, props: { ...props, children } }; return providerProps; } };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return react;
    if (name.endsWith('/useNotifications.js')) return { useNotifications: () => ({}) };
    if (name.endsWith('/useServerNotifications.js')) return { useServerNotifications: () => ({}) };
    if (name.endsWith('/authenticatedNotifications.js')) return { createAuthenticatedNotificationSession: ({ createInvitations, describeInvitations }) => { receivedDescribe = describeInvitations; return { api: {}, invitations: createInvitations({}) }; } };
    return require(name);
  }, module, module.exports);
  const factory = () => ({ get: async () => ({}) });
  const auth = { getSessionKey: () => 'session-1', getConnectionOptions: () => ({}), getAccessToken: async () => 'token' };
  const describeInvitations = async () => new Map();
  module.exports.AuthenticatedNotificationProvider({ auth, userId: 'user-1', createInvitations: factory, describeInvitations, children: 'child' });
  assert.equal(receivedDescribe, describeInvitations);
  assert.equal(providerProps.props.invitations.get instanceof Function, true);
  assert.equal(memoValue.invitations.get instanceof Function, true);
});
test('AuthenticatedNotificationDialog는 onInvitationReady를 NotificationPanel에 전달한다', async () => {
  const { readFileSync } = await import('node:fs');
  const file = new URL('../src/notifications/AuthenticatedNotificationDialog.js', import.meta.url);
  const source = readFileSync(file, 'utf8');
  assert.match(source, /<NotificationPanel\s+model=\{model\}\s+onInvitationReady=\{onInvitationReady\}\s*\/>/);
});
test('공유 어댑터는 알림과 같은 인증 transport와 AbortSignal을 사용한다', async () => {
  const f=fixture(); await login(f.auth);
  const requests=[], controller=new AbortController();
  const session=createAuthenticatedNotificationSession({auth:f.auth,userId:'1',
    fetchImpl:async (url, options)=>{requests.push({url,...options});return reply({inviteId:'invite-1',status:'PENDING',canOpen:true});},
    createInvitations:({transport})=>({get:(id,options)=>transport({...options,path:'/test-invitation/'+id})})});
  f.expire();
  assert.equal((await session.invitations.get('invite-1',{signal:controller.signal})).inviteId,'invite-1');
  assert.equal(f.refreshes(),1);
  assert.equal(requests[0].headers.Authorization,'Bearer access-2');
  assert.equal(requests[0].signal,controller.signal);
  assert.equal(requests[0].url,'https://api.example.test/api/v1/test-invitation/invite-1');
});
test('계정 전환 뒤 지연된 공유 상세는 전달하지 않고 옛 gateway 재호출도 차단한다',async()=>{
  const f=fixture();await login(f.auth);let finish,calls=0;
  const session=createAuthenticatedNotificationSession({auth:f.auth,userId:'1',
    invitations:{get:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}}});
  const pending=session.invitations.get('invite-1');
  f.switchTo('2');await login(f.auth);
  finish({inviteId:'invite-1',status:'PENDING',canOpen:true});
  await assert.rejects(pending,e=>e.status===401);
  await assert.rejects(session.invitations.get('invite-1'),e=>e.status===401);
  assert.equal(calls,1);
});
test('공유 adapter가 취소를 무시해도 닫힌 상세 결과는 전달하지 않는다',async()=>{
  const f=fixture();await login(f.auth);let finish;
  const session=createAuthenticatedNotificationSession({auth:f.auth,userId:'1',
    invitations:{get:()=>new Promise(resolve=>{finish=resolve;})}});
  const controller=new AbortController();
  const pending=session.invitations.get('invite-1',{signal:controller.signal});
  controller.abort();finish({inviteId:'invite-1'});
  await assert.rejects(pending,{name:'AbortError'});
  await assert.rejects(session.invitations.get('invite-1',{signal:controller.signal}),{name:'AbortError'});
});
test('인증된 공유 상세에서 이동 직전 취소된 초대는 화면 callback을 실행하지 않는다',async()=>{
  const f=fixture();await login(f.auth);let status='PENDING',moves=0;
  const session=createAuthenticatedNotificationSession({auth:f.auth,userId:'1',
    invitations:{get:async id=>({inviteId:id,status,canOpen:status==='PENDING'})}});
  const store=createNotificationStore({list:async()=>({items:[],nextCursor:null}),count:async()=>({unreadCount:0})},session.invitations);
  await store.open({id:'n1',notificationType:'DIARY_INVITE',inviteId:'invite-1',readAt:'read'});
  status='REVOKED';await store.proceedToInvitation(()=>{moves++;});
  assert.equal(moves,0);assert.equal(store.getSnapshot().invitation.data.status,'REVOKED');
  store.dispose();
});
test('유효한 실제 gateway 응답은 이동 직전 재조회한 상세만 전달한다',async()=>{
  const f=fixture();await login(f.auth);let calls=0;
  const session=createAuthenticatedNotificationSession({auth:f.auth,userId:'1',
    createInvitations:()=>({get:async id=>({inviteId:id,status:'PENDING',canOpen:true,revision:++calls})})});
  const store=createNotificationStore({list:async()=>({items:[],nextCursor:null}),count:async()=>({unreadCount:0})},session.invitations);
  await store.open({id:'n1',notificationType:'DIARY_INVITE',inviteId:'invite-1',readAt:'read'});
  let delivered;await store.proceedToInvitation(detail=>{delivered=detail;});
  assert.equal(delivered.inviteId,'invite-1');assert.equal(delivered.revision,2);
  store.dispose();
});
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
  for (const status of [401]) {
    let time = 0, fetched = 0;
    const auth = createAuthApi({ baseUrl: 'https://api.example.test', now: () => time,
      fetchImpl: async url => url.endsWith('/refresh') ? reply({ code: 'INVALID_TOKEN' }, status) : reply(tokens('1', 'initial')) });
    await login(auth);
    const session = createAuthenticatedNotificationSession({ auth, userId: '1', fetchImpl: async () => { fetched++; } });
    time = 30000;
    await assert.rejects(session.api.count(), error => error.status === 401);
    assert.equal(auth.getSessionKey(), null); assert.equal(fetched, 0);
  }
});

test('프록시 401·403은 저장 세션을 폐기하지 않고 다음 알림 조회에서 갱신을 재시도한다', async () => {
  for (const status of [401,403]) {
    let time=0, blocked=true, fetched=0;
    const auth=createAuthApi({baseUrl:'https://api.example.test',now:()=>time,fetchImpl:async url=>
      url.endsWith('/refresh')&&blocked ? reply({code:'AUTHENTICATION_REQUIRED'},status) : reply(tokens('1','renewed'))});
    await login(auth);
    const key=auth.getSessionKey();
    const session=createAuthenticatedNotificationSession({auth,userId:'1',fetchImpl:async()=>{fetched++;return reply({unreadCount:0})}});
    time=30000;
    await assert.rejects(session.api.count(),error=>error.status===status);
    assert.equal(auth.getSessionKey(),key);assert.equal(fetched,0);
    blocked=false;
    await session.api.count();assert.equal(fetched,1);
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
test('회원 초대 알림은 받은 초대 목록에서 다이어리 제목 · 보낸 사람을 채우고, 채우기 실패는 목록을 막지 않는다',async()=>{
  const f=fixture();await login(f.auth);
  const items=[{notification:{notificationId:'n1',notificationType:'DIARY_INVITE',createdAt:'2026-11-01T00:00:00Z',readAt:null},invitation:{inviteId:'7',status:'PENDING',canOpen:true}},
    {notification:{notificationId:'n2',notificationType:'NOTICE',createdAt:'2026-11-01T00:00:00Z',readAt:null},invitation:null}];
  const fetchImpl=async()=>reply({items,hasNext:false});
  const asked=[];
  const session=createAuthenticatedNotificationSession({auth:f.auth,userId:'1',fetchImpl,
    describeInvitations:async ids=>{asked.push(ids);return new Map([['7',{title:'우리 기록',actor:'하루'}]]);}});
  const page=await session.api.list();
  assert.deepEqual(asked,[['7']]);
  assert.equal(page.items[0].title,'우리 기록');assert.equal(page.items[0].actor,'하루');assert.equal(page.items[0].inviteId,'7');
  assert.equal(page.items[1].title,'다이어리 알림');
  const failing=createAuthenticatedNotificationSession({auth:f.auth,userId:'1',fetchImpl,describeInvitations:async()=>{throw new Error('down');}});
  assert.equal((await failing.api.list()).items[0].title,'다이어리 알림');
});

test('공유 목록 보충 함수와 실제 세션이 제목·발신자를 적용하고 알림ID·읽음·상태를 유지한다', async () => {
  const { describeSharingInvitations } = await import('../src/notifications/describeSharingInvitations.js');
  const f = fixture(); await login(f.auth);
  const response = { items: [{ notification: { notificationId: 'notice-7', notificationType: 'DIARY_INVITE', createdAt: '2026-11-01T00:00:00Z', readAt: null }, invitation: { inviteId: '7', status: 'PENDING', canOpen: true } }], hasNext: false };
  const shared = { list: async () => ({ items: [{ id: 'different', inviteId: '7', title: '같은 기록', actor: '하루', diary: { title: '같은 기록' }, readAt: 'old', status: 'ACCEPTED' }], nextCursor: null }) };
  const session = createAuthenticatedNotificationSession({ auth: f.auth, userId: '1', fetchImpl: async () => reply(response), describeInvitations: (ids, options) => describeSharingInvitations(shared, ids, options) });
  const page = await session.api.list();
  assert.equal(page.items[0].title, '같은 기록'); assert.equal(page.items[0].actor, '하루');
  assert.equal(page.items[0].id, 'notice-7'); assert.equal(page.items[0].readAt, null); assert.equal(page.items[0].status, 'PENDING');
});
