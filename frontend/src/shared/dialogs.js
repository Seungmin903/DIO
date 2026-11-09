import { Alert, Platform } from 'react-native';

// 확인 · 안내 창은 앱 안의 테마 창(DialogHost → ConfirmDialog)으로 띄운다. 호스트가 아직 없을 때만(테스트 · 앱 시작 직후) 기본 창을 쓴다.
// react-native-web의 Alert.alert는 아무것도 띄우지 않으므로 웹의 기본 창은 브라우저 confirm · alert 다.

let queue = [];
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
      if (hosts > 0 || !queue.length) return;
      // 마지막 호스트가 떨어지면 보이지 않게 된 확인 창을 모두 취소로 끝낸다(답을 기다리는 쪽이 영원히 멈추지 않게)
      const pending = queue;
      queue = [];
      emit();
      for (const request of pending) request.onCancel?.();
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

/** 확인·취소 창. 확인을 누르면 onConfirm, 취소(바깥 누르기 · 뒤로 가기 포함)면 onCancel 을 실행한다. danger 가 거짓이면 되돌릴 수 있는 동작이라 위험색 대신 주 버튼 색을 쓴다. */
export function confirmAction({ title, message, confirmLabel, cancelLabel = '취소', onConfirm, onCancel, danger = true }) {
  if (hosts > 0) { show({ kind: 'confirm', title, message, confirmLabel, cancelLabel, onConfirm, onCancel, danger }); return; }
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    else onCancel?.();
    return;
  }
  // 안드로이드 창이 버튼 없이 닫히면(바깥 누르기 · 뒤로 가기가 허용된 경우) 버튼 onPress 대신 onDismiss 만 불린다: 그때도 취소로 본다.
  // cancelable 은 바꾸지 않는다(기본 false: 다른 확인 창의 동작을 그대로 둔다)
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel', onPress: onCancel },
    { text: confirmLabel, style: danger ? 'destructive' : 'default', onPress: onConfirm },
  ], { onDismiss: onCancel });
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
