import { useSyncExternalStore } from 'react';

// 시작 화면(BootSplash)이 떠 있는 동안 앱 화면은 그 아래에서 미리 그려진다. 시작 화면은 일반 View 라서
// 네이티브 창으로 뜨는 것(Modal · Alert · OS 알림 권한 창)은 그 위로 올라와 로딩 화면을 가렸다.
// 그래서 그런 창은 이 문이 열릴 때(App.finishBoot)까지 기다린다. 시작 화면이 없는 곳(시험 · 웹 미리보기)은 열린 채로 둔다.
let booting = false;
const listeners = new Set();
const waiters = [];
// App 은 시작 화면을 8초 안에 반드시 내린다(SPLASH_LIMIT_MS). 그 타이머조차 돌지 못한 경우(App 이 효과 전에 멈춤 등)에도
// 모달 · 안내 창 · 푸시가 영영 막히지 않게 문 스스로 이 시간 뒤에는 연다
export const BOOT_GATE_LIMIT_MS = 12000;
let limitTimer = null;

export const isBooting = () => booting;

// App 의 첫 렌더(useState 초기화)에서 부른다. 효과에서 닫으면 자식 모달이 한 프레임 열렸다 닫힌다.
// 렌더 중이라 구독자에게 알리지 않는다: 이때는 구독한 컴포넌트가 없고(모두 App 아래에서 이제 그려진다),
// 새로 구독하는 컴포넌트는 useSyncExternalStore 가 구독할 때 값을 다시 확인한다. 여러 번 불러도(StrictMode) 결과가 같다
export function startBoot({ limitMs = BOOT_GATE_LIMIT_MS } = {}) {
  if (booting) return;
  booting = true;
  limitTimer = setTimeout(finishBoot, limitMs);
  limitTimer?.unref?.(); // 시험(node)에서 타이머 때문에 끝나지 않는 일이 없게
}

export function finishBoot() {
  if (!booting) return;
  booting = false;
  clearTimeout(limitTimer);
  limitTimer = null;
  listeners.forEach(listener => listener());
  // 하나가 던져도(예: 미뤄 둔 확인 창의 onConfirm) 뒤에 기다리는 창 · 푸시 시작은 계속 풀어 준다
  waiters.splice(0).forEach(run => {
    try { run(); } catch (error) { console.warn('시작 화면 뒤 작업 실패', error); }
  });
}

/** 시작 화면이 닫힌 뒤 풀리는 약속. 이미 닫혔으면 바로 풀린다. */
export const whenBooted = () => (booting ? new Promise(resolve => waiters.push(resolve)) : Promise.resolve());

/** 시작 화면이 닫힌 뒤 run 을 한 번 부른다(이미 닫혔으면 바로). */
export function afterBoot(run) {
  if (!booting) { run(); return; }
  waiters.push(run);
}

const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const useBooting = () => useSyncExternalStore(subscribe, isBooting, isBooting);
