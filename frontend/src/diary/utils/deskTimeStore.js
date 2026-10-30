import { useSyncExternalStore } from 'react'

const RECHECK_MS = 60 * 1000
const readClock = () => { const now = new Date(); return now.getHours() + now.getMinutes() / 60 }

const listeners = new Set()

// 지금 시각(소수). 구독자가 있을 때만 1분마다 다시 읽는다(표지 · 책상이 몇 개든 타이머는 하나).
let clock = readClock()
let timer = null
const tick = () => { const next = readClock(); if (next !== clock) { clock = next; listeners.forEach(listener => listener()) } }

const subscribe = listener => {
  listeners.add(listener)
  if (!timer) { clock = readClock(); timer = setInterval(tick, RECHECK_MS) }
  return () => { listeners.delete(listener); if (!listeners.size && timer) { clearInterval(timer); timer = null } }
}
const noopSubscribe = () => () => {}
const getHourNow = () => clock

/** 책상에 보여 줄 시각(지금 시각). enabled 가 false 면 구독하지 않고 null. */
export const useDeskHour = (enabled = true) => useSyncExternalStore(enabled ? subscribe : noopSubscribe, enabled ? getHourNow : () => null, enabled ? getHourNow : () => null)
