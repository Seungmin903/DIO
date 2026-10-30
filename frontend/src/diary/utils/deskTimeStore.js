import { useSyncExternalStore } from 'react'

// 게스트 슬라이더로 고정한 책상 시각 (null = 지금). 슬라이더를 끌 때마다 앱 전체가 아니라 책상 바탕과 슬라이더만 다시 그리도록 앱 밖에 둔다.
let hour = null
const listeners = new Set()

export const getDeskHour = () => hour

export function setDeskHour(next) {
  const value = next == null ? null : Number(next)
  if (value === hour) return
  hour = value
  listeners.forEach(listener => listener())
}

const subscribe = listener => { listeners.add(listener); return () => { listeners.delete(listener) } }

export const useDeskHourOverride = () => useSyncExternalStore(subscribe, getDeskHour, getDeskHour)

// 책상 장식 소품(폴라로이드 · 테이프 · 클립 …)을 보일지. 시각과 같은 이유로 앱 밖에 둔다. 기본은 켬.
let decorOn = true
const decorListeners = new Set()

export const getDeskDecorOn = () => decorOn

export function setDeskDecorOn(next) {
  const value = Boolean(next)
  if (value === decorOn) return
  decorOn = value
  decorListeners.forEach(listener => listener())
}

const subscribeDecor = listener => { decorListeners.add(listener); return () => { decorListeners.delete(listener) } }

export const useDeskDecorOn = () => useSyncExternalStore(subscribeDecor, getDeskDecorOn, getDeskDecorOn)
