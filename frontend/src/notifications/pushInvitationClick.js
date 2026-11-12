import { pushInvitationId } from './pushInstallationApi.js';

/** 클릭 데이터는 신뢰하지 않는다. 인증 세션과 초대 현재 상태를 재확인한다. */
export async function resolvePushInvitation({ data, auth, invitations }) {
  const inviteId = pushInvitationId(data), sessionKey = auth.getSessionKey();
  if (!inviteId || !sessionKey) return null;
  const invitation = await invitations.get(inviteId);
  if (auth.getSessionKey() !== sessionKey) return null;
  if (String(invitation?.inviteId) !== inviteId || invitation.status !== 'PENDING' || invitation.canOpen !== true) return null;
  return { inviteId };
}
