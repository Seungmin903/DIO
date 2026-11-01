import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// 알림 설정(내 공간 → 알림). 기기에 저장된다. 푸시 기기 등록(PUT /api/v1/push/installations/{id})이 앱에 연결되면
// 이 값을 함께 보낸다. 서버 발송은 아직 연결 전이라(docs/push-device-isolated.md) 지금은 선택만 기억한다.
// enabled: 알림 자체를 받을지(끄면 아래 셋도 모두 꺼지고, 켜면 끄기 직전의 세부 설정이 돌아온다. 끈 동안은 last 에 그 설정을 따로 둔다), invite: 다이어리 초대를 받았을 때, activity: 공유된 다이어리에 친구가 남겼을 때, reminder: 매일 기록 알림, reminderTime: 'HH:MM'
export const REMINDER_TIMES = ['09:00', '13:00', '18:00', '21:00', '23:00']
export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({ enabled: true, invite: true, activity: true, reminder: false, reminderTime: '21:00' })
const KEY = 'dio.notifications.settings.v1'

const listeners = new Set()
let settings = DEFAULT_NOTIFICATION_SETTINGS
let touched = false

const DETAILS = ['invite', 'activity', 'reminder']
const normalize = value => {
  const next = { ...DEFAULT_NOTIFICATION_SETTINGS }
  if (value && typeof value === 'object') {
    for (const key of ['enabled', ...DETAILS]) if (typeof value[key] === 'boolean') next[key] = value[key]
    if (REMINDER_TIMES.includes(value.reminderTime)) next.reminderTime = value.reminderTime
  }
  if (!next.enabled) {
    // 끈 상태: 세부 설정은 모두 끄고, 끄기 직전의 값은 last 에 둔다(예전에 저장된 값은 세부 설정 자리에 남아 있어 거기서 가져온다)
    const kept = value?.last && typeof value.last === 'object' ? value.last : next
    next.last = Object.fromEntries(DETAILS.map(key => [key, typeof kept[key] === 'boolean' ? kept[key] : DEFAULT_NOTIFICATION_SETTINGS[key]]))
    for (const key of DETAILS) next[key] = false
  }
  return Object.freeze(next)
}

// 저장된 값을 한 번 읽어 온다. 읽기 전에 사용자가 이미 바꿨다면 그 선택을 둔다.
try {
  AsyncStorage.getItem(KEY).then(saved => {
    if (touched || !saved) return
    settings = normalize(JSON.parse(saved))
    listeners.forEach(listener => listener())
  }).catch(() => {})
} catch { /* 저장소를 못 읽으면 기본값 */ }

const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }
const getSettings = () => settings

/** 알림 설정 일부를 바꾸고 저장한다. */
export const setNotificationSettings = patch => {
  touched = true
  // 다시 켤 때는 끄기 직전의 세부 설정을 되살린다
  if (patch.enabled === true && !settings.enabled && settings.last) patch = { ...settings.last, ...patch }
  settings = normalize({ ...settings, ...patch })
  listeners.forEach(listener => listener())
  try { AsyncStorage.setItem(KEY, JSON.stringify(settings)).catch(() => {}) } catch { /* 저장 실패는 이번 실행에서만 유지 */ }
}

/** 지금 알림 설정. */
export const useNotificationSettings = () => useSyncExternalStore(subscribe, getSettings, getSettings)

/** 'HH:MM' → '오후 9시' */
export const reminderTimeLabel = time => {
  const hour = Number(time.slice(0, 2))
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}시`
}
