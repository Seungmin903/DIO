import { canOpenInvitation } from './invitationAccess.js';

// 수락 화면으로 이동할 수 있는 초대의 중간 조회는 목록을 유지한다.
// 끝난 초대와 조회 오류만 홈 안의 상세 화면에 남긴다.
export function showNotificationDetail(invitation, forwardToSharing) {
  if (invitation.status === 'idle') return false;
  if (!forwardToSharing) return true;
  if (invitation.status === 'loading') return false;
  return invitation.status !== 'success' || !canOpenInvitation(invitation.data);
}
