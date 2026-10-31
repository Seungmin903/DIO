import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { TAPE_PALETTES } from '../constants'
import { EDITOR_COLORS, HIGHLIGHTER_COLORS, normalizeHex } from '../utils/penSettings'
import { TEXT_COLORS } from '../utils/text'

// 도구별 색 프리셋: 편집기 도구가 한 줄로 보여 주는 색 목록. 꾸미기 공방 '내 프리셋'에서 바꾸고, 편집기 색 줄이 그대로 따른다.
// 바꾸기 전에는 기본 색(아래 DEFAULTS)이다. 이미 칠한 내용은 색 값을 따로 들고 있어 프리셋을 바꿔도 그대로다.
// 펜 · 형광펜 · 글자는 '#RRGGBB', 마스킹 테이프는 테이프 색 값(기본 색 id 'pink' 등, 또는 'custom:#바탕:#무늬')을 담는다.
export const PALETTE_SCOPES = ['pen', 'highlighter', 'tape', 'text']
const DEFAULTS = {
  pen: EDITOR_COLORS,
  highlighter: HIGHLIGHTER_COLORS,
  text: TEXT_COLORS,
  tape: TAPE_PALETTES.filter((color) => !color.hidden).map((color) => color.id),
}
export const MAX_PALETTE = 12
const keyOf = (scope) => `dio-editor-palette-v1:${scope}`

/** 테이프 색 값 → { bg, fg } (기본 색 id 또는 'custom:#바탕:#무늬') */
export function tapeColors(entry) {
  if (typeof entry === 'string' && entry.startsWith('custom:')) {
    const [, bg, fg] = entry.split(':')
    return { bg, fg }
  }
  const found = TAPE_PALETTES.find((color) => color.id === entry) ?? TAPE_PALETTES[0]
  return { bg: found.bg, fg: found.fg }
}

const normalize = (scope, value) => {
  if (typeof value !== 'string') return null
  if (scope !== 'tape') return normalizeHex(value)
  if (TAPE_PALETTES.some((color) => color.id === value)) return value
  const [kind, bg, fg] = value.split(':')
  return kind === 'custom' && normalizeHex(bg) && normalizeHex(fg) ? `custom:${normalizeHex(bg)}:${normalizeHex(fg)}` : null
}

const stores = {}
const storeOf = (scope) => (stores[scope] ??= { cache: null, listeners: new Set(), loading: null })
const publish = (store, next) => {
  store.cache = next
  store.listeners.forEach((listener) => listener(next))
}
function load(scope) {
  const store = storeOf(scope)
  store.loading ??= AsyncStorage.getItem(keyOf(scope))
    .then((raw) => {
      const stored = raw ? JSON.parse(raw) : null
      const list = Array.isArray(stored) ? [...new Set(stored.map((value) => normalize(scope, value)).filter(Boolean))].slice(0, MAX_PALETTE) : null
      publish(store, list && list.length ? list : null)
    })
    .catch(() => publish(store, null))
  return store.loading
}

/**
 * scope(pen · highlighter · tape · text)의 색 프리셋.
 * colors: 지금 목록(바꾼 적 없으면 기본 색), edited: 바꾼 적 있는지, save(list): 통째로 저장, reset(): 기본 색으로 되돌리기
 */
export function usePalette(scope) {
  const store = storeOf(scope)
  const [custom, setCustom] = useState(store.cache)
  useEffect(() => {
    setCustom(store.cache)
    store.listeners.add(setCustom)
    if (store.cache === null && !store.loading) load(scope)
    return () => store.listeners.delete(setCustom)
  }, [scope, store])
  const save = (list) => {
    const next = [...new Set(list.map((value) => normalize(scope, value)).filter(Boolean))].slice(0, MAX_PALETTE)
    publish(store, next.length ? next : null)
    AsyncStorage.setItem(keyOf(scope), JSON.stringify(next)).catch(() => {})
  }
  return {
    colors: custom ?? DEFAULTS[scope],
    edited: Boolean(custom),
    save,
    reset: () => {
      publish(store, null)
      AsyncStorage.removeItem(keyOf(scope)).catch(() => {})
    },
  }
}
