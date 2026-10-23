import { Alert, Platform } from 'react-native';

// react-native-web의 Alert.alert는 아무것도 띄우지 않으므로 웹에서는 브라우저 기본 창을 쓴다.

/** 확인·취소 창. 확인을 누르면 onConfirm을 실행한다. */
export function confirmAction({ title, message, confirmLabel, onConfirm }) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

/** 확인 버튼만 있는 안내 창 */
export function notify(title, message) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
