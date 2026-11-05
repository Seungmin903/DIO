import test from 'node:test';
import { AUTHENTICATION_FAILED_MESSAGE } from '../src/auth/sessionExpiry.js';
import assert from 'node:assert/strict';
import { createSharingApi } from '../src/sharing/sharingApi.js';
import { createAuthApi } from '../src/auth/authApi.js';

const diaryId = '11111111-1111-4111-8111-111111111111';
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
function fixture(overrides = {}) {
  const calls = [], uploaded = [];
  let available = true;
  const auth = {
    getConnectionOptions: overrides.connection || (() => ({ baseUrl: 'https://api.dio.test/api/v1', accessTokenHeader: 'X-DIO-Access-Token' })),
    getSessionKey: () => 'session-1',
    getProfilePhotoSource: overrides.photoSource,
    async getAccessToken(context) { assert.deepEqual(context, { userId: 10, sessionKey: 'session-1' }); if (!available) throw Object.assign(new Error('로그인 필요'), { status: 401 }); return 'test-token'; },
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init });
    if (url.includes('/auth/profile-photos/')) assert.equal(init.headers['X-DIO-Access-Token'], undefined);
    else assert.equal(init.headers['X-DIO-Access-Token'], 'test-token');
    if (overrides.fetch) { const response = await overrides.fetch(url, init); if (response) return response; }
    if (url.endsWith('/members')) return reply({ members: [{ userId: '10', nickname: '기본이름', role: 'EDITOR', usingAccountPhoto: true, profilePhotoUrl: null }], currentMembers: 2, maxMembers: 4 });
    if (url.endsWith(`/diaries/${diaryId}/invites?page=0&size=20`)) return reply({ available: true, inviteUrl: 'https://dio.test/invite/token', emailInvites: { items: [], page: 0, hasNext: false } });
    if (url.endsWith(`/diaries/${diaryId}`)) return reply({ diary: { diaryTitle: '우리 기록', coverColor: '#FFFFFF' } });
    if (url.endsWith('/accept')) return reply({ diaryId });
    if (url.includes('/me/invites?')) return reply({ items: [{ inviteId: '123', token: 'private-token', diaryId, diaryTitle: '우리 기록', inviterNickname: '친구', status: 'PENDING', createdAt: '2026-10-28T00:00:00Z' }], hasNext: false });
    if (url.includes('/invites/')) return reply({ diaryId, title: '우리 기록', status: 'PENDING', inviteType: 'LINK' });
    return reply(null, 204);
  };
  const runtime = createSharingApi({ user: { userId: 10, nickname: '기본이름', photoUri: 'https://api.dio.test/account.png' }, auth, fetchImpl,
    buildPhotoBody: async (body, photo, part) => { uploaded.push({ body, photo, part }); return { body: 'multipart', dispose() { uploaded.push('disposed'); } }; },
    ...overrides.runtimeOptions });
  return { runtime, calls, uploaded, logout() { available = false; } };
}

test('멤버 차단 상태는 내 방향 blockedByMe만 UI로 전달한다', async () => {
  const f = fixture({ fetch: async url => url.endsWith('/members') ? reply({ members: [
    { userId: '25', nickname: '친구', role: 'EDITOR', blockedByMe: true, blockedByOther: true, activeAccount: true },
  ] }) : null });
  const members = await f.runtime.getMembers(diaryId);
  assert.equal(members[0].blockedByMe, true); assert.equal(members[0].blockedByOther, undefined);
});
test('받은 초대도 토큰 상세를 재조회하고 확인 후 수락에만 acknowledgeBlockedMembers를 보낸다', async () => {
  const f = fixture({ fetch: async url => url.endsWith('/invites/private-token') ? reply({ diaryId, title: '우리 기록', status: 'PENDING', inviteType: 'EMAIL', requiresBlockedMemberConfirmation: true }) : null });
  const invite = await f.runtime.invitationGateway.get('123');
  assert.equal(invite.requiresBlockedMemberConfirmation, true);
  await f.runtime.accept('123', '기본이름', { acknowledgeBlockedMembers: true });
  const accepted = f.calls.find(call => call.url.endsWith('/accept'));
  assert.deepEqual(JSON.parse(accepted.body), { acknowledgeBlockedMembers: true });
});

test('공유 조회의 일반 401은 만료 안내나 서버의 만료 표식으로 오인하지 않는다',async()=>{
 const auth={getSessionKey:()=> '10:1',getAccessToken:async()=> 'access',getConnectionOptions:()=>({baseUrl:'https://api.example.test/api/v1'})};
 const runtime=createSharingApi({user:{userId:'10',nickname:'회원'},auth,
  fetchImpl:async()=>new Response(JSON.stringify({code:'INVALID_TOKEN',sessionExpired:true,detail:'로그인이 만료됐어요.'}),{status:401})});
 await assert.rejects(runtime.getSharing(diaryId),error=>error.status===401&&error.message===AUTHENTICATION_FAILED_MESSAGE&&error.sessionExpired!==true);
});

test('서버 공유 조회는 실제 사용자 ID와 권한을 사용하며 로컬 ID는 요청하지 않는다', async () => {
  const f = fixture();
  assert.throws(() => f.runtime.registerDiary({ id: 'local-only' }), { code: 'LOCAL_DIARY' });
  assert.equal(f.calls.length, 0);
  const diary = await f.runtime.getSharing(diaryId);
  assert.equal(diary.members[0].id, f.runtime.self.id);
  assert.equal(diary.members[0].presence, '편집자');
  assert.deepEqual(f.runtime.getSnapshot().library, []); // 서버 문서를 로컬 빈 사본으로 열지 않는다.
  assert.equal(f.runtime.supportsExportSettings, false);
  assert.equal(f.runtime.canOpenDiary, true);
});

test('보고 있는 공유 다이어리는 타이머로 참여자·역할을 갱신하고 마지막 구독 해제 때 정리한다', async () => {
  let owner = '10';
  const timers = new Map(), cleared = [];
  const f = fixture({ runtimeOptions: {
    setIntervalImpl: callback => { const id = `timer-${timers.size + 1}`; timers.set(id, callback); return id; },
    clearIntervalImpl: id => { cleared.push(id); timers.delete(id); },
  }, fetch: async url => url.endsWith('/members') ? reply({ members: [
    { userId: '10', nickname: '나', role: owner === '10' ? 'OWNER' : 'EDITOR', usingAccountPhoto: true },
    { userId: '20', nickname: '친구', role: owner === '20' ? 'OWNER' : 'EDITOR', usingAccountPhoto: true },
  ] }) : null });
  await f.runtime.getSharing(diaryId);
  let notified = 0;
  const stop = f.runtime.subscribe(() => { notified++; });
  const release = f.runtime.watchDiary(diaryId), secondRelease = f.runtime.watchDiary(diaryId);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(timers.size, 1);
  owner = '20';
  [...timers.values()][0]();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(f.runtime.getSnapshot().diaries[0].members.map(member => member.role), ['EDITOR', 'OWNER']);
  assert.ok(notified > 0);
  release(); assert.deepEqual(cleared, []);
  secondRelease(); assert.deepEqual(cleared, ['timer-1']);
  f.runtime.watchDiary(diaryId); f.runtime.dispose();
  assert.deepEqual(cleared, ['timer-1', 'timer-1']);
  stop();
});

test('폴링은 권한·인증 오류 후 멈추고 일시 오류는 백오프한다', async () => {
  const timers = new Map(), cleared = [];
  let status = 503;
  const f = fixture({ runtimeOptions: {
    setIntervalImpl: callback => { const id = `timer-${timers.size + 1}`; timers.set(id, callback); return id; },
    clearIntervalImpl: id => { cleared.push(id); timers.delete(id); },
  }, fetch: async url => url.endsWith('/members') ? reply({ detail: '실패' }, status) : null });
  const release = f.runtime.watchDiary(diaryId);
  await new Promise(resolve => setTimeout(resolve, 0));
  const timer = [...timers.values()][0], callsAfterFailure = f.calls.length;
  timer();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.calls.length, callsAfterFailure); // 첫 실패 뒤 한 틱은 건너뛴다.
  status = 403;
  timer(); timer(); timer(); timer();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(cleared, ['timer-1']);
  release();
});

test('수락 후 공유 상세 조회 실패는 수락 완료 ID와 경고를 반환하고 재수락하지 않는다', async () => {
  for (const status of [401, 403, 503]) {
    const f = fixture({ fetch: async url => url.endsWith('/members') ? reply({ detail: '후처리 오류' }, status) : null });
    const diary = await f.runtime.accept('123', '하루');
    assert.equal(diary.id, diaryId); assert.ok(diary.profileWarning);
    assert.equal(f.calls.filter(call => call.url.endsWith('/accept')).length, 1);
    assert.deepEqual(f.runtime.getSnapshot().library, []);
    f.runtime.dispose();
  }
});

test('링크 생성과 멤버 강퇴·나가기는 기존 공유 엔드포인트를 호출한다', async () => {
  const f = fixture();
  await f.runtime.createLink(diaryId);
  await f.runtime.removeMember(diaryId, '20');
  await f.runtime.leave(diaryId);
  assert.ok(f.calls.some(c => c.method === 'POST' && c.url.endsWith(`/diaries/${diaryId}/invites`)));
  assert.ok(f.calls.some(c => c.method === 'DELETE' && c.url.endsWith('/members/20')));
  assert.ok(f.calls.some(c => c.method === 'DELETE' && c.url.endsWith('/members/10')));
  assert.equal(f.runtime.getSnapshot().diaries.length, 0);
});

test('받은 이메일 초대 목록·확인·수락·거절은 이메일 초대 토큰을 사용한다', async () => {
  const f = fixture();
  const list = await f.runtime.notificationApi.list();
  assert.equal(list.items[0].inviteId, '123');
  assert.equal((await f.runtime.invitationGateway.get('123')).canOpen, true);
  await f.runtime.accept('123', '새별칭');
  await f.runtime.decline('123');
  assert.ok(f.calls.some(c => c.url.endsWith('/invites/private-token/accept')));
  assert.ok(f.calls.some(c => c.url.endsWith('/me/invites/123/decline')));
  assert.equal((await f.runtime.notificationApi.count()).actionableUnreadCount, 1);
});

test('붙여넣은 링크의 외부 주소로 인증 토큰을 보내지 않고 고정 API에서 토큰만 조회한다', async () => {
  const f = fixture();
  await f.runtime.resolveLink('https://another.example/invite/link-token?extra=1');
  assert.ok(f.calls.every(c => c.url.startsWith('https://api.dio.test/api/v1/')));
  assert.ok(f.calls.some(c => c.url.endsWith('/invites/link-token')));
  await assert.rejects(f.runtime.resolveLink('javascript:alert(1)'), { code: 'INVALID_LINK' });
});

test('서버 기본 상대 초대 링크도 같은 서버 API에서 확인한다', async () => {
  const f = fixture();
  const result = await f.runtime.resolveLink('  /invite/local-link-token  ');
  assert.equal(result.token, 'local-link-token');
  assert.equal(f.calls.at(-1).url, 'https://api.dio.test/api/v1/invites/local-link-token');
  await f.runtime.resolveLink('/invite/encoded%2Dtoken/?from=clipboard');
  assert.equal(f.calls.at(-1).url, 'https://api.dio.test/api/v1/invites/encoded-token');
});

test('잘못된 상대 경로나 빈 토큰은 네트워크 요청 전에 거절한다', async () => {
  const f = fixture();
  for (const value of ['/invite/', '/invite/../other', '/invite/token/extra', '//other.example/invite/token', 'token-only', '/invite/%ZZ']) {
    await assert.rejects(f.runtime.resolveLink(value), { code: 'INVALID_LINK' });
  }
  assert.equal(f.calls.length, 0);
});

test('별칭은 중복 확인 요청 없이 검증하고 사진 초기화는 null, 파일은 profile multipart로 전송한다', async () => {
  const f = fixture();
  await f.runtime.getSharing(diaryId);
  await f.runtime.updateProfile(diaryId, { nickname: '같은별칭', photoUri: null });
  const json = f.calls.find(c => c.method === 'PATCH');
  assert.deepEqual(JSON.parse(json.body), { nickname: '같은별칭', memberProfilePhotoId: null });
  await f.runtime.updateProfile(diaryId, { nickname: '같은별칭', photoUri: 'file:///new.png' });
  assert.equal(f.uploaded[0].part, 'profile');
  assert.equal(f.uploaded.at(-1), 'disposed');
  const multipart = f.calls.find(c => c.body === 'multipart');
  assert.equal(multipart.headers['Content-Type'], undefined);
});

test('서버 제한 안내를 보존하고 로그아웃 후 네트워크 요청을 막는다', async () => {
  const f = fixture({ fetch: (url, init) => init.method === 'POST' ? reply({ code: 'INVITE_RATE_LIMITED', detail: '5분에 3회까지 만들 수 있어요.' }, 429) : null });
  await assert.rejects(f.runtime.createLink(diaryId), { code: 'INVITE_RATE_LIMITED', status: 429, message: '5분에 3회까지 만들 수 있어요.' });
  f.logout(); const before = f.calls.length;
  await assert.rejects(f.runtime.getSharing(diaryId), { status: 401 });
  assert.equal(f.calls.length, before);
});

test('폐기 후 도착한 응답은 같은 런타임이 재활성화되어도 반영하지 않는다', async () => {
  let release, started;
  const pending = new Promise(resolve => { started = resolve; });
  const f = fixture({ fetch: async url => { if (url.endsWith('/members')) { started(); await new Promise(resolve => { release = resolve; }); } } });
  const result = f.runtime.getSharing(diaryId);
  await pending; f.runtime.dispose(); f.runtime.activate(); release();
  await assert.rejects(result, { code: 'DISPOSED' });
  assert.deepEqual(f.runtime.getSnapshot().diaries, []);
});

test('인증이 필요한 다이어리 사진은 인증 fetch 후 메모리 이미지로 표시한다', async () => {
  const f = fixture({ fetch: url => {
    if (url.endsWith('/members')) return reply({ members: [{ userId: '10', nickname: '사진회원', role: 'OWNER', usingAccountPhoto: false, profilePhotoUrl: `/api/v1/diaries/${diaryId}/members/10/profile-photo?v=1` }] });
    if (url.includes('/profile-photo?')) return { ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => new Uint8Array([137,80,78,71]).buffer };
  } });
  const diary = await f.runtime.getSharing(diaryId);
  assert.equal(diary.members[0].photoUri, 'data:image/png;base64,iVBORw==');
});


test('명세의 membership 경로로 별칭·사진과 즐겨찾기를 수정한다', async () => {
  const f = fixture();
  await f.runtime.getSharing(diaryId);
  await f.runtime.updateProfile(diaryId, { nickname: '우리별칭', photoUri: null });
  await f.runtime.updateProfile(diaryId, { nickname: '우리별칭', photoUri: 'file:///membership-test.png' });
  await f.runtime.toggleFavorite(diaryId);
  const writes = f.calls.filter(call => call.method === 'PATCH');
  assert.equal(writes.length, 3);
  assert.ok(writes.every(call => call.url === `https://api.dio.test/api/v1/diaries/${diaryId}/membership`));
  assert.equal(writes[1].body, 'multipart');
  assert.equal(JSON.parse(writes[2].body).favorite, true);
});

const sentRow = (id, status = 'PENDING') => ({ inviteId: id, recipientEmail: 'friend@example.com', status, token: 'private-token', inviteUrl: 'private-url' });
const sentResult = (items, page = 0, hasNext = false) => ({ available: false, emailInvites: { items, page, hasNext } });
test('이메일은 정규화하고 202 후 서버 목록만 표시하며 비공개 토큰을 복사하지 않는다', async () => {
  const f=fixture({fetch:url=>url.endsWith(`/diaries/${diaryId}/invites?page=0&size=20`)?reply(sentResult([sentRow('1')])):null});
  const diary=await f.runtime.sendEmailInvite(diaryId,'  FRIEND@Example.COM  ');
  assert.deepEqual(JSON.parse(f.calls.find(c=>c.method==='POST').body),{email:'friend@example.com'});
  assert.deepEqual(diary.emailInvites,[{id:'1',email:'friend@example.com',status:'PENDING',createdAt:undefined}]);
  await assert.rejects(f.runtime.sendEmailInvite(diaryId,'bad'),{code:'INVALID_EMAIL'});

  await assert.rejects(f.runtime.sendEmailInvite('local','a@example.com'),{code:'LOCAL_DIARY'});
});
test('보낸 목록은 ID별로 합치고 페이지 실패 후 재시도하며 취소는 DELETE로 요청한다',async()=>{
  let failed=true;
  const f=fixture({fetch:(url,init)=>{
    if(url.endsWith(`/diaries/${diaryId}/invites?page=0&size=20`))return reply(sentResult([sentRow('1')],0,true));
    if(url.includes('/invites?page=1'))return failed?reply({code:'TEMPORARY'},503):reply(sentResult([sentRow('1','CANCELLED'),sentRow('2')],1));
  }});
  await f.runtime.getSharing(diaryId);
  await assert.rejects(f.runtime.loadMoreEmailInvites(diaryId),{status:503});
  assert.equal(f.runtime.getSnapshot().diaries[0].emailNextPage,1);
  failed=false;const d=await f.runtime.loadMoreEmailInvites(diaryId);
  assert.deepEqual(d.emailInvites.map(r=>r.id),['1','2']);assert.equal(d.emailInvites[0].status,'CANCELLED');
  await f.runtime.cancelEmailInvite(diaryId,'1');
  assert.ok(f.calls.some(c=>c.method==='DELETE'&&c.url.endsWith('/invites/1')));
  await assert.rejects(f.runtime.cancelEmailInvite(diaryId,'wrong'),{code:'INVALID_INVITE'});
});
test('늦은 다음 페이지 응답은 새로고침된 취소 상태를 덮지 않는다',async()=>{
  let release,started;const waiting=new Promise(resolve=>{started=resolve});let cancelled=false;
  const f=fixture({fetch:async url=>{
    if(url.endsWith(`/diaries/${diaryId}/invites?page=0&size=20`))return reply(sentResult([sentRow('1',cancelled?'CANCELLED':'PENDING')],0,true));
    if(url.includes('/invites?page=1')){started();await new Promise(resolve=>{release=resolve});return reply(sentResult([sentRow('1')],1));}
  }});
  await f.runtime.getSharing(diaryId);const more=f.runtime.loadMoreEmailInvites(diaryId);await waiting;
  cancelled=true;await f.runtime.getSharing(diaryId);release();await more;
  assert.equal(f.runtime.getSnapshot().diaries[0].emailInvites[0].status,'CANCELLED');
});
test('변경 완료 후 재조회 실패는 안내로 구분하고 실패한 양도는 기존 역할을 유지한다',async()=>{
  let readFails=false,transferFails=true;
  const f=fixture({fetch:(url,init)=>{
    if(url.endsWith('/transfer-owner'))return reply({code:'FORBIDDEN'},transferFails?403:204);
    if(init.method==='POST'&&url.endsWith('/invites/email')){readFails=true;return reply({},202)}
    if(readFails&&url.endsWith(`/diaries/${diaryId}/invites?page=0&size=20`))return reply({},503);
  }});
  await f.runtime.getSharing(diaryId);
  await assert.rejects(f.runtime.transferOwner(diaryId,'20'),{status:403});
  assert.equal(f.runtime.getSnapshot().diaries[0].members[0].role,'EDITOR');
  const d=await f.runtime.sendEmailInvite(diaryId,'a@example.com');assert.ok(d.refreshWarning);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/invites/email')).length,1);
  transferFails=false;await f.runtime.transferOwner(diaryId,'20');
  assert.deepEqual(JSON.parse(f.calls.find(c=>c.url.endsWith('/transfer-owner')).body),{newOwnerUserId:'20'});
  assert.equal(f.calls.filter(c=>c.method==='DELETE').length,0);
  await assert.rejects(f.runtime.transferOwner(diaryId,'10'),{code:'INVALID_MEMBER'});
});
test('Basic 인증과 회원 토큰은 기존 인증 서비스에서 분리하고 리다이렉트는 막는다',async()=>{
  const f=fixture({connection:()=>({baseUrl:'https://api.dio.test/api/v1',getAuthHeaders:(url,token)=>({Authorization:'Basic test-only','X-DIO-Access-Token':token})})});
  await f.runtime.getSharing(diaryId);
  for(const call of f.calls){assert.equal(call.headers.Authorization,'Basic test-only');assert.equal(call.headers['X-DIO-Access-Token'],'test-token');assert.equal(call.redirect,'error');assert.equal(call.credentials,'omit');}
});
test('탈퇴한 이메일을 대체 표시하고 잘못된 목록 응답은 기존 상태를 보존한다',async()=>{
  let broken=false;
  const f=fixture({fetch:url=>url.endsWith(`/diaries/${diaryId}/invites?page=0&size=20`)?reply(broken?{available:false}:sentResult([{...sentRow('1'),recipientEmail:null}])):null});
  assert.equal((await f.runtime.getSharing(diaryId)).emailInvites[0].email,'탈퇴한 사용자');
  broken=true;await assert.rejects(f.runtime.getSharing(diaryId),{code:'INVALID_RESPONSE'});
  assert.equal(f.runtime.getSnapshot().diaries[0].emailInvites.length,1);
});

test('소유권 양도 성공 후 서버의 새 소유자와 기존 소유자의 편집 권한을 반영한다',async()=>{
  let transferred=false;
  const f=fixture({fetch:(url,init)=>{
    if(url.endsWith('/transfer-owner')){transferred=true;return reply(null,204)}
    if(url.endsWith('/members'))return reply({members:[{userId:'10',nickname:'나',role:transferred?'EDITOR':'OWNER',usingAccountPhoto:true},{userId:'20',nickname:'친구',role:transferred?'OWNER':'EDITOR',usingAccountPhoto:true}]});
  }});
  await f.runtime.getSharing(diaryId);assert.equal(f.runtime.getSnapshot().diaries[0].members[0].role,'OWNER');
  const d=await f.runtime.transferOwner(diaryId,'20');
  assert.deepEqual(d.members.map(m=>m.role),['EDITOR','OWNER']);
  assert.equal(f.calls.filter(c=>c.method==='DELETE').length,0);
});

test('서버 기본 크기와 무관하게 보낸 초대 첫 페이지와 다음 페이지를 20개씩 요청한다', async () => {
  const rows = Array.from({ length: 45 }, (_, i) => sentRow(String(i + 1)));
  const pages = [];
  const f = fixture({ fetch: (url, init) => {
    const target = new URL(url);
    if (init.method !== 'GET' || target.pathname !== `/api/v1/diaries/${diaryId}/invites`) return null;
    const page = Number(target.searchParams.get('page') || 0);
    const size = Number(target.searchParams.get('size') || 3); // Deliberately differs from the client size.
    pages.push({ page, size });
    return reply(sentResult(rows.slice(page * size, (page + 1) * size), page, (page + 1) * size < rows.length));
  } });
  await f.runtime.getSharing(diaryId);
  await f.runtime.loadMoreEmailInvites(diaryId);
  const diary = await f.runtime.loadMoreEmailInvites(diaryId);
  assert.deepEqual(pages, [{ page: 0, size: 20 }, { page: 1, size: 20 }, { page: 2, size: 20 }]);
  assert.deepEqual(diary.emailInvites.map(row => row.id), rows.map(row => row.inviteId));
  assert.equal(diary.emailNextPage, null);
});

test('참여자 사진마다 해당 URL로 인증 헤더를 만들고 다른 출처 사진에는 요청하지 않는다', async () => {
  const targets = [];
  const photos = ['10', '20'].map(id => `https://api.dio.test/api/v1/diaries/${diaryId}/members/${id}/profile-photo?v=${id}`);
  let external = false;
  const f = fixture({
    connection: () => ({ baseUrl: 'https://api.dio.test/api/v1', getAuthHeaders: (url, token) => {
      targets.push(url);
      return { 'X-DIO-Access-Token': token, ...(photos.includes(url) ? { Authorization: `Basic photo-${photos.indexOf(url)}` } : {}) };
    } }),
    fetch: (url, init) => {
      if (url.endsWith('/members')) return reply({ members: ['10', '20'].map((userId, i) => ({ userId, nickname: '회원', role: i ? 'EDITOR' : 'OWNER', usingAccountPhoto: false,
        profilePhotoUrl: external ? 'https://external.example/photo.png' : photos[i] })) });
      if (photos.includes(url)) {
        assert.equal(init.headers.Authorization, `Basic photo-${photos.indexOf(url)}`);
        return { ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer };
      }
    },
  });
  const diary = await f.runtime.getSharing(diaryId);
  assert.ok(diary.members.every(member => member.photoUri === 'data:image/png;base64,iVBORw=='));
  assert.ok(photos.every(url => targets.includes(url)));
  assert.ok(!targets.includes('https://api.dio.test/api/v1/diaries/'));
  external = true;
  await assert.rejects(f.runtime.getSharing(diaryId), { code: 'INVALID_RESPONSE' });
  assert.ok(!targets.some(url => url.startsWith('https://external.example')));
  assert.ok(!f.calls.some(call => call.url.startsWith('https://external.example')));
});

test('회원가입 계정 사진은 개발 게이트웨이 인증만 사용해 공유 참여자 이미지로 표시한다',async()=>{
  const photoUri='https://api.dio.test/api/v1/auth/profile-photos/12345678-1234-1234-1234-123456789abc';
  const photoAuth=createAuthApi({baseUrl:'https://api.dio.test/api/v1',allowDevelopmentAccess:true});
  photoAuth.verificationService.setDevelopmentAccess('tester','test-only');
  const f=fixture({photoSource:photoAuth.getProfilePhotoSource,fetch:(url,init)=>{
    if(url.endsWith('/members'))return reply({members:[{userId:'10',nickname:'계정사진',role:'OWNER',usingAccountPhoto:true,profilePhotoUrl:photoUri}]});
    if(url===photoUri){
      assert.match(init.headers.Authorization,/^Basic /);
      assert.equal(init.headers['X-DIO-Access-Token'],undefined);
      assert.equal(init.redirect,'error');
      return {ok:true,headers:new Headers({'content-type':'image/png'}),arrayBuffer:async()=>new Uint8Array([137,80,78,71]).buffer};
    }
  }});
  assert.equal((await f.runtime.getSharing(diaryId)).members[0].photoUri,'data:image/png;base64,iVBORw==');
});

test('공개 계정 사진은 회원 인증 fetch 없이 URL을 유지한다',async()=>{
  const photoUri='https://cdn.example.test/account.png';
  const f=fixture({photoSource:uri=>({uri}),fetch:url=>url.endsWith('/members')?reply({members:[{userId:'10',nickname:'계정사진',role:'OWNER',usingAccountPhoto:true,profilePhotoUrl:photoUri}]}):null});
  assert.equal((await f.runtime.getSharing(diaryId)).members[0].photoUri,photoUri);
  assert.ok(!f.calls.some(call=>call.url===photoUri));
});

test('사진 소스 제공자가 인증 헤더를 붙여도 외부 출처·잘못된 계정 사진 주소에는 요청하지 않는다',async()=>{
  const accountUri='https://api.dio.test/api/v1/auth/profile-photos/12345678-1234-1234-1234-123456789abc';
  for(const target of ['https://external.example/photo.png','http://api.dio.test/photo.png','https://api.dio.test:8443/photo.png','https://user:password@api.dio.test/photo.png','not-a-url']){
    const f=fixture({photoSource:()=>({uri:target,headers:{Authorization:'Basic test-only'}}),fetch:url=>url.endsWith('/members')?reply({members:[{userId:'10',nickname:'회원',role:'OWNER',usingAccountPhoto:true,profilePhotoUrl:accountUri}]}):null});
    assert.equal((await f.runtime.getSharing(diaryId)).members[0].photoUri,null);
    assert.equal(f.calls.length,3);
    assert.ok(f.calls.every(call=>call.url.startsWith('https://api.dio.test/api/v1/')));
  }
});


test('상대 초대 주소는 현재 HTTPS 서버의 절대 주소로 표시하고 복사할 수 있다', async () => {
  const f = fixture({ fetch: url => url.endsWith('/invites?page=0&size=20')
    ? reply({ available: true, inviteUrl: '/invite/signed-token', emailInvites: { items: [], page: 0, hasNext: false } }) : null });
  const diary = await f.runtime.getSharing(diaryId);
  assert.equal(diary.link, 'https://api.dio.test/invite/signed-token');
  assert.equal(f.runtime.getSnapshot().diaries[0].link, diary.link);
  await f.runtime.resolveLink(diary.link);
  assert.equal(f.calls.at(-1).url, 'https://api.dio.test/api/v1/invites/signed-token');
});

test('서버가 지정한 HTTPS 초대 화면 주소는 그대로 유지한다', async () => {
  const f = fixture({ fetch: url => url.endsWith('/invites?page=0&size=20')
    ? reply({ available: true, inviteUrl: 'https://invite.dio.test/invite/signed-token', emailInvites: { items: [], page: 0, hasNext: false } }) : null });
  assert.equal((await f.runtime.getSharing(diaryId)).link, 'https://invite.dio.test/invite/signed-token');
});

for (const email of ['legacy@[127.0.0.1]', 'legacy@old_domain.example', '"legacy.user"@example.com'])
 test(`기존 계정 주소도 기존 이메일 초대 API로 보낸다: ${email}`,async()=>{
  const f=fixture();
  await f.runtime.sendEmailInvite(diaryId,` ${email.toUpperCase()} `);
  const sent=f.calls.find(c=>c.method==='POST' && c.url.endsWith('/invites/email'));
  assert.equal(JSON.parse(sent.body).email,email);
 });
