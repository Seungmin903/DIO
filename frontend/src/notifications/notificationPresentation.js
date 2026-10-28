// DIARY_INVITE는 현재 BE 종류, DIARY_INVITED는 기존 목의 호환 이름이다.
export const isInvitationNotification = row => ['DIARY_INVITE', 'DIARY_INVITED'].includes(row?.notificationType);

export function notificationPresentation(row) {
  const invitation = isInvitationNotification(row);
  return {
    invitation,
    title: invitation ? row.title || '다이어리 초대' : '알림',
    message: invitation ? row.actor && row.actor !== '다른 사용자' ? `${row.actor}님의 초대` : '다이어리 초대가 도착했어요.' : '새로운 알림이 도착했어요.',
    canInspectInvitation: invitation && typeof row.inviteId === 'string' && row.inviteId.length > 0,
  };
}
