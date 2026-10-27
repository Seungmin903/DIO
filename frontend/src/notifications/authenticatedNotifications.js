import { createServerNotificationSession } from './serverNotificationApi.js';

// 생성 당시 계정·로그인 세션에 묶는다. 계정 교체 뒤 옛 호출자가 새 계정 토큰을 받지 않는다.
export function createAuthenticatedNotificationSession({ auth, userId, invitations, fetchImpl }) {
  const sessionKey = auth.getSessionKey();
  return createServerNotificationSession({ ...auth.getConnectionOptions(), invitations, fetchImpl,
    getAccessToken: () => auth.getAccessToken({ userId, sessionKey }) });
}
