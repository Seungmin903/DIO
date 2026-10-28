import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharingApi } from '../src/sharing/sharingApi.js';

const diaryId = '11111111-1111-4111-8111-111111111111';
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
function fixture(overrides = {}) {
  const calls = [], uploaded = [];
  let available = true;
  const auth = {
    getConnectionOptions: () => ({ baseUrl: 'https://api.dio.test/api/v1', accessTokenHeader: 'X-DIO-Access-Token' }),
    getSessionKey: () => 'session-1',
    async getAccessToken(context) { assert.deepEqual(context, { userId: 10, sessionKey: 'session-1' }); if (!available) throw Object.assign(new Error('로그인 필요'), { status: 401 }); return 'test-token'; },
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init });
    assert.equal(init.headers['X-DIO-Access-Token'], 'test-token');
    if (overrides.fetch) { const response = await overrides.fetch(url, init); if (response) return response; }
    if (url.endsWith('/members')) return reply({ members: [{ userId: '10', nickname: '기본이름', role: 'EDITOR', usingAccountPhoto: true, profilePhotoUrl: null }], currentMembers: 2, maxMembers: 4 });
    if (url.endsWith('/invites')) return reply({ available: true, inviteUrl: 'https://dio.test/invite/token' });
    if (url.endsWith(`/diaries/${diaryId}`)) return reply({ diary: { diaryTitle: '우리 기록', coverColor: '#FFFFFF' } });
    if (url.endsWith('/accept')) return reply({ diaryId });
    if (url.includes('/me/invites?')) return reply({ items: [{ inviteId: '123', token: 'private-token', diaryId, diaryTitle: '우리 기록', inviterNickname: '친구', status: 'PENDING', createdAt: '2026-10-28T00:00:00Z' }], hasNext: false });
    if (url.includes('/invites/')) return reply({ diaryId, title: '우리 기록', status: 'PENDING', inviteType: 'LINK' });
    return reply(null, 204);
  };
  const runtime = createSharingApi({ user: { userId: 10, nickname: '기본이름', photoUri: 'https://api.dio.test/account.png' }, auth, fetchImpl,
    buildPhotoBody: async (body, photo, part) => { uploaded.push({ body, photo, part }); return { body: 'multipart', dispose() { uploaded.push('disposed'); } }; } });
  return { runtime, calls, uploaded, logout() { available = false; } };
}

test('서버 공유 조회는 실제 사용자 ID와 권한을 사용하며 로컬 ID는 요청하지 않는다', async () => {
  const f = fixture();
  assert.throws(() => f.runtime.registerDiary({ id: 'local-only' }), { code: 'LOCAL_DIARY' });
  assert.equal(f.calls.length, 0);
  const diary = await f.runtime.getSharing(diaryId);
  assert.equal(diary.members[0].id, f.runtime.self.id);
  assert.equal(diary.members[0].presence, '편집자');
  assert.deepEqual(f.runtime.getSnapshot().library, []); // 서버 문서를 로컬 빈 사본으로 열지 않는다.
  assert.equal(f.runtime.supportsExportSettings, false);
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
