import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// 캔버스에 무엇으로 그릴지(내 공간 → 편집 → 그리기 입력). 기기에 저장된다.
// Apple PencilKit 의 drawingPolicy(default · pencilOnly · anyInput)와 삼성 노트의 '손가락으로 그리기'를 따른다.
//  auto: 펜이 한 번 보이면 그 뒤로는 펜만 그린다(펜이 없는 기기는 손가락으로 그린다)
//  pen:  처음부터 펜만 그린다. 손가락은 확대·축소·이동만 한다
//  any:  펜과 손가락 모두 그린다. 펜으로 그리는 중에 닿은 손바닥은 그대로 거른다
export const DRAWING_INPUTS = [
  { id: 'auto', label: '자동' },
  { id: 'pen', label: '펜만' },
  { id: 'any', label: '펜 · 손가락' },
]
const KEY = 'dio.drawing.input.v1'

const listeners = new Set()
let mode = 'auto'
let touched = false

try {
  AsyncStorage.getItem(KEY).then(saved => {
    if (touched || !DRAWING_INPUTS.some(option => option.id === saved)) return
    mode = saved
    listeners.forEach(listener => listener())
  }).catch(() => {})
} catch { /* 저장소를 못 읽으면 자동 */ }

const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }

/** 지금 그리기 입력(터치를 판정할 때 바로 읽는다). */
export const getDrawingInput = () => mode

export const setDrawingInput = next => {
  if (!DRAWING_INPUTS.some(option => option.id === next)) return
  touched = true
  mode = next
  listeners.forEach(listener => listener())
  try { AsyncStorage.setItem(KEY, next).catch(() => {}) } catch { /* 저장 실패는 이번 실행에서만 유지 */ }
}

export const useDrawingInput = () => useSyncExternalStore(subscribe, getDrawingInput, getDrawingInput)
