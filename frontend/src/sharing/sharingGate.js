// 공유 화면(SharingHub · 받은 알림)을 여는 입구. 게스트는 로그인 안내(loginGate)를 먼저 보고, 초대 푸시는 로그인한 사용자만 연다.
// open(request): 앱의 공유 요청 상태를 바꾼다. beforeOpen(run): 지금 화면을 떠나도 되는지 묻는다(프로필 수정 중 등).
export function createSharingGate({ authenticated, loginGate, open, beforeOpen = run => run() }) {
  const leaveThenOpen = request => () => beforeOpen(() => open(request));
  return {
    share(diary) { if (diary) loginGate('다이어리 공유', () => open({ diary })); },
    // 게스트는 초대를 받을 계정이 없다: 공유 버튼처럼 로그인 안내부터 띄운다
    invitations() { loginGate('받은 초대', leaveThenOpen({ mode: authenticated ? 'notifications' : 'invitations' })); },
    pushInvitation(inviteId) { if (authenticated) leaveThenOpen({ mode: 'invitation', inviteId })(); },
  };
}
