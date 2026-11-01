import { useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { dateKey, todayParts } from './dday'

// 앱을 켜 둔 채 자정이 지나면 디데이를 다시 그리게 하는 오늘 날짜 저장소. 위젯마다 타이머를 두지 않고 하나를 나눠 쓴다.
const listeners = new Set()
let timer = null
let appStateSubscription = null

const todayKey = () => dateKey(todayParts())
const notify = () => listeners.forEach((listener) => listener())

function scheduleMidnight() {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  timer = setTimeout(() => { notify(); scheduleMidnight() }, next - now)
}

function subscribe(listener) {
  listeners.add(listener)
  if (listeners.size === 1) {
    scheduleMidnight()
    // 잠자기·백그라운드 동안 타이머가 멈췄을 수 있어 앞으로 돌아올 때도 다시 확인한다
    appStateSubscription = AppState.addEventListener('change', (state) => { if (state === 'active') notify() })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearTimeout(timer)
      appStateSubscription?.remove?.()
      timer = null
      appStateSubscription = null
    }
  }
}

/** 오늘 날짜 { y, m, d }. 자정이 지나거나 앱이 앞으로 돌아오면 날짜가 바뀐 경우에만 다시 그린다. */
export function useToday() {
  const key = useSyncExternalStore(subscribe, todayKey, todayKey)
  const [y, m, d] = key.split('-').map(Number)
  return { y, m, d }
}
