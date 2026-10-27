import { useMemo } from 'react';
import { createServerNotificationSession } from './serverNotificationApi.js';
import { useNotifications } from './useNotifications.js';

// 상위 로그인 세션에서 한 번 호출해 보관함·편집기·패널에 같은 model을 전달한다.
// getAccessToken은 매 요청 최신 값을 반환하는 안정된 함수로 전달한다.
export function useServerNotifications({ sessionKey, baseUrl, getAccessToken, invitations, fetchImpl }) {
  const session = useMemo(() => createServerNotificationSession({ baseUrl, getAccessToken, invitations, fetchImpl }),
    [sessionKey, baseUrl, getAccessToken, invitations, fetchImpl]);
  return useNotifications(session.api, session.invitations);
}
