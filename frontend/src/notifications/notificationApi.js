// 244 합의 전 제안 경계. 실제 서버에는 연결하지 않는다.
import { isInvitationNotification } from './notificationPresentation.js';
export class NotificationError extends Error {
  constructor(code, message, status = 0) { super(message); this.code = code; this.status = status; }
}
const invalid = () => new NotificationError('INVALID_RESPONSE', '알림 응답을 확인하지 못했어요. 다시 시도해 주세요.');
const id = value => typeof value === 'string' && value.length > 0;
export function toNotification(row) {
  if (!id(row?.notificationId) || !id(row?.type)) throw invalid();
  const invitation = isInvitationNotification({ notificationType: row.type });
  if (invitation && (!id(row?.invitation?.inviteId) || typeof row?.invitation?.status !== 'string')) throw invalid();
  return { id: row.notificationId, title: row.diary?.title || '사용할 수 없는 다이어리',
    notificationType: row.type, actor: typeof row.actor?.nickname === 'string' ? row.actor.nickname.trim() || null : null, inviteId: invitation ? row.invitation.inviteId : null,
    status: invitation ? row.invitation.status : null, readAt: row.readAt ?? null, createdAt: row.createdAt,
    actionable: invitation && row.action?.enabled === true && row.invitation.status === 'PENDING' };
}
export function createNotificationApi(transport) {
  return {
    async list({ cursor, signal } = {}) {
      const body = await transport({ path: '/notifications', signal, query: { type: 'DIARY_INVITED', cursor, limit: 20 } });
      if (!Array.isArray(body?.items) || typeof body.hasNext !== 'boolean' || (body.hasNext && !id(body.nextCursor))) throw invalid();
      return { items: body.items.map(toNotification), nextCursor: body.hasNext ? body.nextCursor : null, hasNext: body.hasNext };
    },
    async count({ signal } = {}) {
      const body = await transport({ path: '/notifications/unread-count', signal });
      if (!Number.isInteger(body?.actionableUnreadCount) || body.actionableUnreadCount < 0 || !Number.isInteger(body?.unreadCount) || body.unreadCount < body.actionableUnreadCount) throw invalid();
      return body;
    },
    read(notificationId, options) { return transport({ ...options, method: 'PATCH', path: `/notifications/${encodeURIComponent(notificationId)}` }); },
    readAll(throughNotificationId, options) { return transport({ ...options, method: 'POST', path: '/notifications/read-all', body: { type: 'DIARY_INVITED', throughNotificationId } }); },
    remove(notificationId, options) { return transport({ ...options, method: 'DELETE', path: `/notifications/${encodeURIComponent(notificationId)}` }); },
  };
}
// 수신자용 상세는 공유 담당의 게이트웨이. 수락·거절·닉네임 변경은 여기서 수행하지 않는다.
export function createInvitationGateway(getInvitation) {
  return { async get(inviteId, { signal } = {}) {
    const value = await getInvitation(inviteId, { signal });
    if (value?.inviteId !== inviteId || typeof value.status !== 'string' || typeof value.canOpen !== 'boolean') throw invalid();
    return value;
  } };
}
