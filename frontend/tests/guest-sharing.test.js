import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createGuestSharing, GUEST_REJECTED_ACTIONS, GUEST_SNAPSHOT } from '../src/sharing/guestSharing.js';
import { createSharingGate } from '../src/sharing/sharingGate.js';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
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

// 실제 useLoginGate(로그인 확인)와 공유 입구를 함께 돌린다. 안내 창(confirmAction)은 기록만 한다.
function entry({ authenticated, beforeOpen }) {
  const { code } = expo('@babel/core').transformSync(source('../src/auth/loginGate.js'), { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] });
  const dialogs = [], logins = [], opened = [];
  const react = { createContext: value => value, createElement() {}, useMemo: f => f(), useCallback: f => f,
    useContext: () => ({ authenticated, onLogin: request => logins.push(request) }) };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => ({ react, '../shared/dialogs': { confirmAction: value => dialogs.push(value) } })[id], mod, mod.exports);
  const sharing = createSharingGate({ authenticated, loginGate: mod.exports.useLoginGate(), open: request => opened.push(request), beforeOpen });
  return { sharing, dialogs, logins, opened };
}

test('게스트는 공유 버튼 · 받은 초대 · 초대 푸시로 공유 화면을 열지 못하고 로그인 안내를 먼저 본다', () => {
  const { sharing, dialogs, logins, opened } = entry({ authenticated: false });
  const diary = { id: 'd-1' };
  sharing.share(diary);
  sharing.invitations();
  sharing.pushInvitation('invite-1');
  assert.deepEqual(opened, []);
  assert.deepEqual(dialogs.map(value => value.title), ['로그인이 필요해요', '로그인이 필요해요']);
  assert.match(dialogs[0].message, /^다이어리 공유는 /);
  assert.match(dialogs[1].message, /^받은 초대는 /);
  // 안내 창에서 로그인을 고르면 로그인 화면을 띄울 뿐 공유 화면은 열지 않는다
  dialogs[0].onConfirm();
  assert.equal(logins[0].feature, '다이어리 공유');
  assert.deepEqual(opened, []);
  sharing.share(null);
  assert.equal(dialogs.length, 2);
});

test('로그인한 사용자는 공유 화면을 바로 열고, 받은 초대 · 초대 푸시는 지금 화면을 떠나도 되는지 먼저 묻는다', () => {
  const asked = [];
  const { sharing, dialogs, opened } = entry({ authenticated: true, beforeOpen: run => { asked.push(run); } });
  const diary = { id: 'd-1' };
  sharing.share(diary);
  assert.deepEqual(opened, [{ diary }]);
  sharing.invitations();
  sharing.pushInvitation('invite-1');
  assert.equal(opened.length, 1, '떠나기 확인 전에는 열지 않는다');
  asked.forEach(run => run());
  assert.deepEqual(opened, [{ diary }, { mode: 'notifications' }, { mode: 'invitation', inviteId: 'invite-1' }]);
  assert.deepEqual(dialogs, []);
});
