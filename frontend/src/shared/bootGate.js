import { useSyncExternalStore } from 'react';

// 시작 화면(BootSplash)이 떠 있는 동안 앱 화면은 그 아래에서 미리 그려진다. 시작 화면은 일반 View 라서
// 네이티브 창으로 뜨는 것(Modal · Alert · OS 알림 권한 창)은 그 위로 올라와 로딩 화면을 가렸다.
// 그래서 그런 창은 이 문이 열릴 때(App.finishBoot)까지 기다린다. 시작 화면이 없는 곳(시험 · 웹 미리보기)은 열린 채로 둔다.
let booting = false;
const listeners = new Set();
const waiters = [];

export const isBooting = () => booting;

export function startBoot() { booting = true; listeners.forEach(listener => listener()); }

export function finishBoot() {
  if (!booting) return;
  booting = false;
  listeners.forEach(listener => listener());
  waiters.splice(0).forEach(resolve => resolve());
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
