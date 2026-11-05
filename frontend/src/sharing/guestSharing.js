import { SharingError } from './sharingContracts.js';

// useSyncExternalStore는 같은 스냅샷 참조를 돌려받아야 다시 그리기를 멈춘다.
export const GUEST_SNAPSHOT = Object.freeze({ diaries: [], joined: [], library: [] });

// 서버 공유 런타임(createSharingApi)에서 화면이 부르는 비동기 동작. 게스트는 모두 로그인 필요 오류로 거절한다.
export const GUEST_REJECTED_ACTIONS = Object.freeze([
  'getSharing', 'createLink', 'resolveLink', 'accept', 'decline', 'leave', 'removeMember', 'transferOwner',
  'updateProfile', 'sendEmailInvite', 'cancelEmailInvite', 'loadMoreEmailInvites', 'toggleFavorite',
]);

// 게스트는 공유 데이터를 만들거나 가짜 초대를 받지 않는다. 공유 진입(공유 버튼 · 받은 초대)은 LoginGate가 로그인으로 안내하고,
// 초대 푸시는 로그인한 사용자만 연결한다. 그래도 화면이 동작을 부르면 TypeError 대신 로그인 필요 오류를 돌려준다.
export function createGuestSharing(user = {}) {
  const self = { id: null, nickname: user.nickname || '방문자', photoUri: user.photoUri || null };
  const emptyPage = async () => ({ items: [], hasNext: false, nextCursor: null });
  const unavailable = async () => { throw new SharingError('LOGIN_REQUIRED', '로그인이 필요해요.'); };
  return {
    self, server: false, supportsReadState: false, supportsExportSettings: false, canOpenDiary: false,
    notificationApi: { list: emptyPage, count: async () => ({ unreadCount: 0, actionableUnreadCount: 0 }), read: unavailable, readAll: unavailable, remove: unavailable },
    invitationGateway: { get: unavailable },
    ...Object.fromEntries(GUEST_REJECTED_ACTIONS.map(name => [name, unavailable])),
    // 동기 조회는 공유되지 않은 상태로 답한다
    registerDiary: source => ({ ...source, members: [] }),
    hasMembership: () => false,
    getSnapshot: () => GUEST_SNAPSHOT,
    subscribe: () => () => {}, activate() {}, dispose() {},
    watchDiary: () => () => {}, setWatchingActive() {},
    setAccountProfile(value = {}) { self.nickname = value.nickname || '방문자'; self.photoUri = value.photoUri || null; },
  };
}
