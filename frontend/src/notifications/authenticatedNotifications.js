import { createServerNotificationSession } from './serverNotificationApi.js';
import { NotificationError } from './notificationApi.js';

// 생성 당시 계정·로그인 세션에 묶는다. 계정 교체 뒤 옛 호출자가 새 계정 토큰을 받지 않는다.
export function createAuthenticatedNotificationSession({ auth, userId, invitations, createInvitations, fetchImpl }) {
  const sessionKey = auth.getSessionKey();
  const session = createServerNotificationSession({ ...auth.getConnectionOptions(), invitations, createInvitations, fetchImpl,
    getAccessToken: () => auth.getAccessToken({ userId, sessionKey }) });
  const gateway = session.invitations;
  const check = signal => {
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    if (auth.getSessionKey() !== sessionKey) throw new NotificationError('AUTHENTICATION_REQUIRED', '로그인이 필요해요.', 401);
  };
  return { ...session, invitations: { async get(inviteId, options = {}) {
    check(options.signal);
    const detail = await gateway.get(inviteId, options);
    check(options.signal);
    return detail;
  } } };
}
