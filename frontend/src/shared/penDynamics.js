import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// 펜이 필압 · 기울기를 따를지(내 공간 → 편집). 기기에 저장된다. 새로 쓰는 획부터 적용되고 이미 쓴 획은 그대로다.
const KEY = 'dio.pen.dynamics.v1'

const listeners = new Set()
let dynamics = { pressure: true, tilt: true }
let touched = false

try {
  AsyncStorage.getItem(KEY).then(saved => {
    if (touched || !saved) return
    const value = JSON.parse(saved)
    dynamics = { pressure: value?.pressure !== false, tilt: value?.tilt !== false }
    listeners.forEach(listener => listener())
  }).catch(() => {})
} catch { /* 저장소를 못 읽으면 둘 다 켬 */ }

const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }

/** 지금 값(획을 시작할 때 바로 읽는다). */
export const getPenDynamics = () => dynamics

export const setPenDynamics = patch => {
  touched = true
  dynamics = { ...dynamics, ...patch }
  listeners.forEach(listener => listener())
  try { AsyncStorage.setItem(KEY, JSON.stringify(dynamics)).catch(() => {}) } catch { /* 저장 실패는 이번 실행에서만 유지 */ }
}

export const usePenDynamics = () => useSyncExternalStore(subscribe, getPenDynamics, getPenDynamics)
