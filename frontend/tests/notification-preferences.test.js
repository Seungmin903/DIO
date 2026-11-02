import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  notificationPreferencesKey,
  saveNotificationPreferences,
} from '../src/diary/services/notificationPreferences.js';

test('알림 설정은 사용자별 키에만 저장한다', async () => {
  const values = new Map();
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
  };
  await saveNotificationPreferences(storage, '101', { service: false, marketing: true });
  await saveNotificationPreferences(storage, '202', { service: true, marketing: false });
  assert.deepEqual(JSON.parse(values.get(notificationPreferencesKey('101'))), { service: false, marketing: true });
  assert.deepEqual((await loadNotificationPreferences(storage, '202')).settings, { service: true, marketing: false });
});

test('손상된 알림 설정과 읽기 실패는 기본값과 오류를 반환한다', async () => {
  const broken = { getItem: async () => '{', setItem: async () => {} };
  const unreadable = { getItem: async () => { throw new Error('offline'); }, setItem: async () => {} };
  for (const storage of [broken, unreadable]) {
    const result = await loadNotificationPreferences(storage, '101');
    assert.deepEqual(result.settings, DEFAULT_NOTIFICATION_PREFERENCES);
    assert.equal(result.error, '이 기기의 알림 설정을 불러오지 못했어요.');
  }
});

test('알림 설정 저장 실패는 호출자에게 전달한다', async () => {
  await assert.rejects(
    saveNotificationPreferences({ setItem: async () => { throw new Error('full'); } }, '101', DEFAULT_NOTIFICATION_PREFERENCES),
    /full/,
  );
});
