export const notificationPreferencesKey = (userId) => `dio:preferences:notifications:v1:${String(userId)}`;

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({ service: true, marketing: false });

export function normalizeNotificationPreferences(value) {
  return {
    service: typeof value?.service === 'boolean' ? value.service : DEFAULT_NOTIFICATION_PREFERENCES.service,
    marketing: typeof value?.marketing === 'boolean' ? value.marketing : DEFAULT_NOTIFICATION_PREFERENCES.marketing,
  };
}

export async function loadNotificationPreferences(storage, userId) {
  try {
    const raw = await storage.getItem(notificationPreferencesKey(userId));
    if (!raw) return { settings: DEFAULT_NOTIFICATION_PREFERENCES, error: null };
    return { settings: normalizeNotificationPreferences(JSON.parse(raw)), error: null };
  } catch {
    return { settings: DEFAULT_NOTIFICATION_PREFERENCES, error: '이 기기의 알림 설정을 불러오지 못했어요.' };
  }
}

export async function saveNotificationPreferences(storage, userId, settings) {
  await storage.setItem(notificationPreferencesKey(userId), JSON.stringify(normalizeNotificationPreferences(settings)));
}
