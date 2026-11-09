import { Alert, Platform } from 'react-native';

// 확인 · 안내 창은 앱 안의 테마 창(DialogHost → ConfirmDialog)으로 띄운다. 호스트가 아직 없을 때만(테스트 · 앱 시작 직후) 기본 창을 쓴다.
// react-native-web의 Alert.alert는 아무것도 띄우지 않으므로 웹의 기본 창은 브라우저 confirm · alert 다.

let queue = [];
// 마지막 호스트가 떨어진 뒤 다시 붙기를 기다리는 시간
const HOST_GRACE_MS = 1000;
let hosts = 0;
const listeners = new Set();
const emit = () => listeners.forEach(listener => listener());

/** DialogHost 가 쓰는 저장소. 맨 앞 요청이 지금 보이는 창이다. */
export const dialogStore = {
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot: () => queue[0] ?? null,
  /** 호스트가 붙고 떨어질 때 센다. 하나라도 붙어 있어야 앱 창을 쓴다. */
  attach() {
    hosts += 1;
    return () => {
      hosts -= 1;
      if (hosts > 0) return;
      // 마지막 호스트가 떨어지면: 레이아웃 전환 · 재마운트로 잠깐 떨어진 것일 수 있어 조금 기다린다.
      // 그래도 호스트가 없으면 onAbort 를 준 창(답을 기다리는 질문)만 끝낸다. 다른 창은 예전처럼 큐에 남아 호스트가 다시 붙으면 보인다
      setTimeout(() => {
        if (hosts > 0) return;
        const aborted = queue.filter(request => request.onAbort);
        if (!aborted.length) return;
        queue = queue.filter(request => !request.onAbort);
        emit();
        for (const request of aborted) request.onAbort();
      }, HOST_GRACE_MS);
    };
  },
  /** 맨 앞 창을 닫는다. 확인이면 닫은 뒤에 onConfirm 을 실행해(그 안에서 새 창을 띄워도 되게) 순서가 꼬이지 않는다. */
  settle(confirmed) {
    const [front, ...rest] = queue;
    queue = rest;
    emit();
    if (confirmed) front?.onConfirm?.();
    else front?.onCancel?.();
  },
};

const show = request => { queue = [...queue, request]; emit(); };

/**
 * 확인·취소 창. 확인을 누르면 onConfirm, 취소(앱 창의 취소 · 바깥 누르기 · 뒤로 가기)면 onCancel 을 실행한다. danger 가 거짓이면 되돌릴 수 있는 동작이라 위험색 대신 주 버튼 색을 쓴다.
 * onAbort: 사용자가 고르지 않았는데 창이 닫혔을 때(앱 창 호스트가 사라짐 · 시스템 창이 버튼 없이 닫힘). 없으면 onCancel 을 부른다.
 * 답을 저장하는 질문(예: 폰트 공유 동의)은 onAbort 를 따로 줘 '거부'로 저장하지 않게 한다.
 */
export function confirmAction({ title, message, confirmLabel, cancelLabel = '취소', onConfirm, onCancel, onAbort, danger = true }) {
  if (hosts > 0) { show({ kind: 'confirm', title, message, confirmLabel, cancelLabel, onConfirm, onCancel, onAbort, danger }); return; }
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    else onCancel?.();
    return;
  }
  // 안드로이드 창이 버튼 없이 닫히면 버튼 onPress 대신 onDismiss 만 불린다: 고른 것이 아니므로 onAbort(없으면 onCancel)
  // cancelable 은 바꾸지 않는다(기본 false: 다른 확인 창의 동작을 그대로 둔다)
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel', onPress: onCancel },
    { text: confirmLabel, style: danger ? 'destructive' : 'default', onPress: onConfirm },
  ], { onDismiss: onAbort ?? onCancel });
}

/** 확인 버튼만 있는 안내 창 */
export function notify(title, message) {
  if (hosts > 0) { show({ kind: 'notify', title, message }); return; }
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
