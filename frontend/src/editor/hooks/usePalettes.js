import { useEffect, useSyncExternalStore } from 'react'
import { createPalettePreference } from '../utils/palettePreference.js'
import { PAPER_BACKGROUNDS, PAPER_LAYOUTS } from '../templates/appearance.js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { TAPE_PALETTES } from '../constants'
import { EDITOR_COLORS, HIGHLIGHTER_COLORS, normalizeHex } from '../utils/penSettings'
import { TEXT_COLORS } from '../utils/text'

// 도구별 고정 칸 팔레트. 편집 화면과 꾸미기 공방에서 같은 저장값을 편집한다.
// 바꾸기 전에는 기본 색(아래 DEFAULTS)이다. 이미 칠한 내용은 색 값을 따로 들고 있어 프리셋을 바꿔도 그대로다.
// 펜 · 형광펜 · 글자는 '#RRGGBB', 마스킹 테이프는 테이프 색 값(기본 색 id 'pink' 등, 또는 'custom:#바탕:#무늬')을 담는다.
export const PALETTE_SCOPES = ['pen', 'glass', 'highlighter', 'tape', 'text', 'paper', 'paperLine']
const DEFAULTS = {
  paper: PAPER_BACKGROUNDS.map(([, color]) => color),
  paperLine: PAPER_LAYOUTS.map(([, color]) => color),
  pen: EDITOR_COLORS,
  // 유리펜은 한 칸에 색 셋을 담는다(마스킹 테이프가 바탕 · 무늬 둘을 담는 것과 같은 방식):
  // '잉크:글리터:테'. 글리터 · 테가 'auto' 면 펜 색에서 자동 계산한 색을 쓴다.
  glass: EDITOR_COLORS.map(color => `${color}:auto:auto`),
  highlighter: HIGHLIGHTER_COLORS,
  text: TEXT_COLORS,
  tape: TAPE_PALETTES.filter((color) => !color.hidden).map((color) => color.id),
}
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

/** 유리펜 색 값 → { ink, glitter, sheen } ('auto' 는 null = 펜 색에서 자동 계산) */
export function glassColors(entry) {
  const [ink, glitter, sheen] = String(entry ?? '').split(':')
  const one = part => part && part !== 'auto' ? normalizeHex(part) : null
  return { ink: normalizeHex(ink ?? '') ?? EDITOR_COLORS[0], glitter: one(glitter), sheen: one(sheen) }
}
/** { ink, glitter, sheen } → 저장 값 */
export const glassEntry = ({ ink, glitter, sheen }) => `${ink}:${glitter ?? 'auto'}:${sheen ?? 'auto'}`

export const normalizePaletteEntry = (scope, value) => {
  if (typeof value !== 'string') return null
  if (scope === 'glass') {
    const [ink, glitter, sheen] = value.split(':')
    const part = one => one === 'auto' || one == null ? 'auto' : normalizeHex(one)
    return normalizeHex(ink ?? '') && part(glitter) && part(sheen) ? `${normalizeHex(ink)}:${part(glitter)}:${part(sheen)}` : null
  }
  if (scope !== 'tape') return normalizeHex(value)
  if (TAPE_PALETTES.some((color) => color.id === value)) return value
  const [kind, bg, fg] = value.split(':')
  return kind === 'custom' && normalizeHex(bg) && normalizeHex(fg) ? `custom:${normalizeHex(bg)}:${normalizeHex(fg)}` : null
}

const stores = {}
/** 도구별 팔레트 저장소(화면 · 계정 동기화가 같은 것을 쓴다) */
export function paletteStore(scope) {
  if (!DEFAULTS[scope]) throw Error('알 수 없는 팔레트예요.')
  return stores[scope] ??= createPalettePreference(AsyncStorage, keyOf(scope), DEFAULTS[scope], value => normalizePaletteEntry(scope, value))
}
export const paletteDefaults = scope => DEFAULTS[scope]

export function usePalette(scope) {
  const store = paletteStore(scope)
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => { store.load().catch(() => console.warn('팔레트를 불러오지 못했어요. 다시 시도해 주세요.')) }, [store])
  return { ...snapshot, defaults: DEFAULTS[scope], replace: store.replace, reset: store.reset, retry: store.load }
}
