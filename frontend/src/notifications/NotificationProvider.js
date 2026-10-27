import { createContext, createElement, useContext } from 'react';
import { useNotifications } from './useNotifications.js';
import { useServerNotifications } from './useServerNotifications.js';

const NotificationContext = createContext(null);

// 테스트/목과 서버 모두 같은 소비자 경계를 사용한다. 세션 상위 한 곳에 배치한다.
export function NotificationProvider({ api, invitations, children }) {
  const model = useNotifications(api, invitations);
  return createElement(NotificationContext.Provider, { value: model }, children);
}

export function ServerNotificationProvider({ children, ...options }) {
  // 로그아웃/계정 교체 시 소비자 컴포넌트의 열림 상태도 함께 초기화한다.
  return createElement(ServerSession, { ...options, key: options.sessionKey }, children);
}
function ServerSession({ children, ...options }) {
  const model = useServerNotifications(options);
  return createElement(NotificationContext.Provider, { value: model }, children);
}
export function useSharedNotifications() {
  const model = useContext(NotificationContext);
  if (!model) throw new Error('NotificationProvider 안에서 사용해 주세요.');
  return model;
}
