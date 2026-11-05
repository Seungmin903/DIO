import * as Notifications from 'expo-notifications';

/** 푸시를 쓰는 빌드에서 OS 알림 권한이 꺼져 있으면 true. 읽지 못하면 안내하지 않는다. */
export async function notificationsBlocked() {
  if (process.env.EXPO_PUBLIC_PUSH_ENABLED !== 'true') return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'denied';
  } catch { return false; }
}
