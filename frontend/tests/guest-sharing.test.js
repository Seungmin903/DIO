import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGuestSharing, GUEST_REJECTED_ACTIONS, GUEST_SNAPSHOT } from '../src/sharing/guestSharing.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('게스트 공유 스냅샷은 항상 같은 참조라 다시 그리기를 반복하지 않는다', () => {
  const runtime = createGuestSharing({ nickname: '소연' });
  const first = runtime.getSnapshot();
  assert.equal(runtime.getSnapshot(), first);
  assert.equal(createGuestSharing().getSnapshot(), first);
  assert.equal(first, GUEST_SNAPSHOT);
  assert.ok(Object.isFrozen(first));
  assert.deepEqual(first, { diaries: [], joined: [], library: [] });
  const unsubscribe = runtime.subscribe(() => assert.fail('게스트 스냅샷은 바뀌지 않는다'));
  runtime.activate(); runtime.setAccountProfile({ nickname: '바뀜' }); runtime.dispose(); unsubscribe();
  assert.equal(runtime.getSnapshot(), first);
});

test('게스트 알림은 빈 목록이고 초대 조회와 읽음 처리는 로그인 필요 오류로 거절한다', async () => {
  const runtime = createGuestSharing();
  assert.deepEqual(await runtime.notificationApi.list(), { items: [], hasNext: false, nextCursor: null });
  assert.deepEqual(await runtime.notificationApi.count(), { unreadCount: 0, actionableUnreadCount: 0 });
  const loginRequired = { code: 'LOGIN_REQUIRED', message: '로그인이 필요해요.' };
  await assert.rejects(runtime.invitationGateway.get('invite-1'), loginRequired);
  for (const name of ['read', 'readAll', 'remove']) await assert.rejects(runtime.notificationApi[name]('n-1'), loginRequired);
});

test('게스트 프로필 변경은 self 에 반영되고 비우면 방문자로 돌아간다', () => {
  const runtime = createGuestSharing({ nickname: '소연', photoUri: 'file:///a.png' });
  assert.deepEqual(runtime.self, { id: null, nickname: '소연', photoUri: 'file:///a.png' });
  runtime.setAccountProfile({ nickname: '민지', photoUri: 'file:///b.png' });
  assert.deepEqual(runtime.self, { id: null, nickname: '민지', photoUri: 'file:///b.png' });
  runtime.setAccountProfile();
  assert.deepEqual(runtime.self, { id: null, nickname: '방문자', photoUri: null });
});

test('공유 화면 · 앱이 부르는 런타임 동작은 게스트에도 모두 있어 TypeError 없이 로그인 필요로 거절된다', async () => {
  const runtime = createGuestSharing();
  const used = new Set([...`${source('../src/sharing/SharingHub.js')}\n${source('../App.js')}`.matchAll(/runtime\.([A-Za-z]+)/g)].map(m => m[1]));
  // createPersonalCopy 는 미리보기 전용이라 SharingHub 가 있을 때만 버튼을 그린다(typeof 확인)
  used.delete('createPersonalCopy');
  for (const name of used) assert.ok(name in runtime, `게스트 런타임에 ${name} 이 있다`);
  for (const name of GUEST_REJECTED_ACTIONS) await assert.rejects(runtime[name]('x'), { code: 'LOGIN_REQUIRED' }, name);
  assert.equal(runtime.hasMembership('invite-1'), false);
  assert.deepEqual(runtime.registerDiary({ id: 'd-1', title: '내 다이어리' }), { id: 'd-1', title: '내 다이어리', members: [] });
  assert.equal(runtime.server, false);
  assert.equal(runtime.canOpenDiary, false);
});

test('게스트는 공유 버튼 · 받은 초대로 공유 화면을 열지 못하고 로그인 안내를 먼저 본다', () => {
  const app = source('../App.js');
  // 공유 화면(SharingHub)을 여는 setSharingRequest 는 로그인 확인(loginGate) 안이나 로그인한 사용자 전용 푸시 효과 안에서만 부른다
  assert.match(app, /const shareDiary = useCallback\(diary => \{ if \(diary\) loginGate\('다이어리 공유', \(\) => setSharingRequest\(\{ diary \}\)\); \}/);
  assert.match(app, /const openInvitations = useCallback\(\(\) => \{[\s\S]{0,400}?loginGate\('받은 초대', go\);/);
  assert.match(app, /if \(previewUser\.mode !== 'authenticated'\) return;[\s\S]{0,1200}?setSharingRequest\(\{ mode: 'invitation', inviteId \}\)/);
});
