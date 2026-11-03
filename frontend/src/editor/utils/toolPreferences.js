import { useCallback, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { normalizeEraserSize } from './eraser.js'
import { GRID_SPACINGS } from './pageGrid.js'
import { sanitizeTextDefaults } from './text.js'
import { sanitizeHighlighterSettings, sanitizePenKinds, sanitizePenSettings } from './penSettings.js'

// 펜 · 형광펜 · 지우개 설정(고른 종류, 굵기, 색, 불투명도 등). 기기에 저장되어 다이어리를 다시 열거나 앱을 껐다 켜도 그대로다.
const KEY = 'dio.editor.tools.v1'
const SAVE_DELAY_MS = 200

// 저장값이 손상됐거나 예전 형식이면 그 항목만 버린다
const SANITIZE = {
  pen: sanitizePenSettings,
  penKinds: sanitizePenKinds,
  highlighter: sanitizeHighlighterSettings,
  textDefaults: sanitizeTextDefaults,
  lassoShape: value => ['rectangle', 'freeform'].includes(value) ? value : undefined,
  guides: value => value && typeof value === 'object' ? {
    grid: value.grid === 'lines' ? 'lines' : 'none',
    spacing: GRID_SPACINGS.some(item => item.id === value.spacing) ? value.spacing : 'normal',
    center: value.center === true, thirds: value.thirds === true, margin: value.margin === true,
  } : undefined,
  straightAssist: value => typeof value === 'boolean' ? value : undefined,
  eraserSize: value => Number.isFinite(value) ? normalizeEraserSize(value) : undefined,
  eraserMode: value => ['stroke', 'area'].includes(value) ? value : undefined,
  eraserTarget: value => ['all', 'pen', 'highlighter'].includes(value) ? value : undefined,
}
export function sanitizeToolPreferences(saved) {
  const result = {}
  for (const [key, sanitize] of Object.entries(SANITIZE)) {
    const value = saved?.[key] == null ? undefined : sanitize(saved[key])
    if (value !== undefined) result[key] = value
  }
  return result
}

const listeners = new Set()
let preferences = {}
let touched = false
let timer = null

try {
  AsyncStorage.getItem(KEY).then(saved => {
    if (touched || !saved) return
    preferences = sanitizeToolPreferences(JSON.parse(saved))
    listeners.forEach(listener => listener())
  }).catch(() => {})
} catch { /* 저장소를 못 읽으면 기본값 */ }

const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }

// 막대를 끄는 동안 매번 쓰지 않게 잠잠해지면 저장한다
const save = () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    try { AsyncStorage.setItem(KEY, JSON.stringify(preferences)).catch(() => {}) } catch { /* 저장 실패는 이번 실행에서만 유지 */ }
  }, SAVE_DELAY_MS)
}

/** useState 처럼 [값, 바꾸기]. 저장값이 없으면 fallback */
export function useToolPreference(key, fallback) {
  const read = () => preferences[key] ?? fallback
  const value = useSyncExternalStore(subscribe, read, read)
  const set = useCallback(next => {
    touched = true
    // setState 처럼 이전 값을 받는 함수도 쓸 수 있다
    preferences = { ...preferences, [key]: typeof next === 'function' ? next(preferences[key] ?? fallback) : next }
    listeners.forEach(listener => listener())
    save()
  }, [key, fallback])
  return [value, set]
}
