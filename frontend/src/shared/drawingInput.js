import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// 캔버스에 무엇으로 그릴지(내 공간 → 편집 → 그리기 입력). 기기에 저장된다.
//  pen: 펜만 그린다. 손가락은 이동 · 확대 · 축소와 선택을 한다
//  any: 펜과 손가락 모두 그린다. 펜으로 그리는 중에 닿은 손바닥은 그대로 거른다
// 고른 적이 없으면 펜을 본 기기는 pen, 아직 못 본 기기는 any 가 골라져 있다(안드로이드는 펜 유무를 미리 믿을 만하게 알 수 없다).
export const DRAWING_INPUTS = [
  { id: 'pen', label: '펜만' },
  { id: 'any', label: '펜 · 손가락' },
]
const KEY = 'dio.drawing.input.v1'
const PEN_SEEN_ITEM = 'dio.drawing.pen-seen.v1'

const listeners = new Set()
let chosen = null // 사용자가 고른 값(예전 '자동'은 고르지 않은 것으로 읽는다)
let penSeen = false
let touched = false
const notify = () => listeners.forEach(listener => listener())

try {
  AsyncStorage.getItem(KEY).then(saved => {
    if (touched || !DRAWING_INPUTS.some(option => option.id === saved)) return
    chosen = saved
    notify()
  }).catch(() => {})
  AsyncStorage.getItem(PEN_SEEN_ITEM).then(saved => {
    if (saved !== '1' || penSeen) return
    penSeen = true
    notify()
  }).catch(() => {})
} catch { /* 저장소를 못 읽으면 고르지 않은 상태 */ }

const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }

/** 지금 그리기 입력(터치를 판정할 때 바로 읽는다). */
export const getDrawingInput = () => chosen ?? (penSeen ? 'pen' : 'any')

/** 펜이 실제로 닿았다. 고른 적이 없으면 이때부터 펜만 그린다. */
export const markPenSeen = () => {
  if (penSeen) return
  penSeen = true
  notify()
  try { AsyncStorage.setItem(PEN_SEEN_ITEM, '1').catch(() => {}) } catch { /* 이번 실행에서만 유지 */ }
}

export const setDrawingInput = next => {
  if (!DRAWING_INPUTS.some(option => option.id === next)) return
  touched = true
  chosen = next
  notify()
  try { AsyncStorage.setItem(KEY, next).catch(() => {}) } catch { /* 저장 실패는 이번 실행에서만 유지 */ }
}

export const useDrawingInput = () => useSyncExternalStore(subscribe, getDrawingInput, getDrawingInput)
