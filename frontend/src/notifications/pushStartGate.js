import { whenBooted as defaultWhenBooted } from '../shared/bootGate.js';

/**
 * 시작 화면이 닫힐 때까지 기다린 뒤 푸시를 시작해도 되는지 답한다.
 * 기다리는 사이 호출 측이 그만뒀거나(isActive 거짓) 로그아웃 · 계정 전환으로 세션이 바뀌었으면 false:
 * 그때는 OS 알림 권한을 묻지도, 알림 연결을 만들지도 않는다.
 */
export async function waitToStartPush({ auth, isActive = () => true, whenBooted = defaultWhenBooted }) {
  const sessionKey = auth.getSessionKey();
  await whenBooted();
  return Boolean(sessionKey) && isActive() && auth.getSessionKey() === sessionKey;
}
