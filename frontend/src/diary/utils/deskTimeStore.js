import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { NOON_NO_WINDOW } from './deskLight'

const RECHECK_MS = 60 * 1000
const readClock = () => { const now = new Date(); return now.getHours() + now.getMinutes() / 60 }

// 책상 빛 모드: auto 는 지금 시각을 따라가고, noon 은 한낮에 고정하되 창으로 빛이 들지 않는다. 기기에 저장된다.
export const DESK_MODES = ['auto', 'noon']
const MODE_HOUR = { noon: NOON_NO_WINDOW }
const MODE_KEY = 'dio.desk.lightMode'

const listeners = new Set()
const notify = () => listeners.forEach(listener => listener())

let mode = 'auto'
// 지금 시각(소수). 구독자가 있을 때만 1분마다 다시 읽는다(표지 · 책상이 몇 개든 타이머는 하나).
let clock = readClock()
let timer = null
const tick = () => { const next = readClock(); if (next !== clock) { clock = next; if (mode === 'auto') notify() } }

const subscribe = listener => {
  listeners.add(listener)
  if (!timer) { clock = readClock(); timer = setInterval(tick, RECHECK_MS) }
  return () => { listeners.delete(listener); if (!listeners.size && timer) { clearInterval(timer); timer = null } }
}
const noopSubscribe = () => () => {}
const getHourNow = () => (mode === 'auto' ? clock : MODE_HOUR[mode])
const getModeNow = () => mode

// 저장된 모드를 한 번 읽어 온다. 읽기 전에 사용자가 이미 바꿨다면 그 선택을 둔다.
let touched = false
try {
  AsyncStorage.getItem(MODE_KEY).then(saved => {
    if (touched || !DESK_MODES.includes(saved) || saved === mode) return
    mode = saved
    notify()
  }).catch(() => {})
} catch { /* 저장소를 못 읽으면 auto */ }

/** 책상 빛 모드를 바꾸고 저장한다. */
export const setDeskMode = next => {
  if (!DESK_MODES.includes(next)) return
  touched = true
  if (next !== mode) { mode = next; notify() }
  try { AsyncStorage.setItem(MODE_KEY, next).catch(() => {}) } catch { /* 저장 실패는 이번 실행에서만 유지 */ }
}

/** 실시간 ↔ 한낮(창빛 없음)을 번갈아 바꾼다. */
export const cycleDeskMode = () => setDeskMode(DESK_MODES[(DESK_MODES.indexOf(mode) + 1) % DESK_MODES.length])

/** 책상에 보여 줄 시각(auto 면 지금 시각, noon 이면 창빛 없는 한낮). enabled 가 false 면 구독하지 않고 null. */
export const useDeskHour = (enabled = true) => useSyncExternalStore(enabled ? subscribe : noopSubscribe, enabled ? getHourNow : () => null, enabled ? getHourNow : () => null)

/** 현재 모드('auto' | 'noon'). */
export const useDeskMode = () => useSyncExternalStore(subscribe, getModeNow, getModeNow)
