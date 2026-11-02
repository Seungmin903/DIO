import { createContext, createElement, useCallback, useContext, useMemo } from 'react';
import { confirmAction } from '../shared/dialogs';

// 로그인한 사용자만 쓰는 기능(내 폰트 만들기 · 사진 속 대상 오리기 · 스티커 시트 분리)의 입구를 지킨다.
// 게스트(둘러보기)가 누르면 기능 대신 앱 안내 창을 띄운다. 창 바깥을 누르면 닫히고, 뒤 화면은 창이 덮고 있어 눌리지 않는다(ConfirmDialog).
// 제공자가 없는 곳(테스트 · 개발 화면)은 통과시킨다.
const LoginGateContext = createContext({ authenticated: true, onLogin: null });

/**
 * authenticated: 회원가입 후 로그인한 사용자인지.
 * onLogin({ feature, action }): 안내 창의 `로그인 · 회원가입`을 눌렀을 때. 앱은 로그인 화면을 지금 화면 위에 띄운다.
 */
export function LoginGateProvider({ authenticated, onLogin, children }) {
  const value = useMemo(() => ({ authenticated, onLogin }), [authenticated, onLogin]);
  return createElement(LoginGateContext.Provider, { value }, children);
}

// 받침 있는 말은 `은`, 없는 말은 `는`
const topic = name => {
  const code = name.charCodeAt(name.length - 1) - 0xAC00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '은' : '는';
};

/** 안내 창 문구. 이유(누가 쓰는 기능인지)를 한 문장으로 말하고 버튼은 다음 행동을 이름으로 쓴다(해요체, 사용법 설명 없음) */
export const loginGateCopy = feature => ({
  title: '로그인이 필요해요',
  message: `${feature}${topic(feature)} 회원가입하고 로그인한 사용자만 쓸 수 있어요.`,
  confirmLabel: '로그인 · 회원가입',
  cancelLabel: '나중에',
});

/** open() — 안내 창 없이 로그인 화면을 바로 띄운다(내 공간의 `로그인 · 회원가입` 버튼). 회원가입은 로그인 화면에서 이어 간다 */
export function useLoginEntry() {
  const { onLogin } = useContext(LoginGateContext);
  return useCallback(() => onLogin?.({}), [onLogin]);
}

/** guard(기능 이름, 동작) — 로그인한 사용자면 동작을 실행하고, 아니면 안내 창을 띄운다 */
export function useLoginGate() {
  const { authenticated, onLogin } = useContext(LoginGateContext);
  return useCallback((feature, action) => {
    if (authenticated) { action?.(); return; }
    confirmAction({ ...loginGateCopy(feature), danger: false, onConfirm: () => onLogin?.({ feature, action }) });
  }, [authenticated, onLogin]);
}
