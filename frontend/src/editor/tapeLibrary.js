import { RECENT_LIMIT, tapeKey } from './hooks/useCustomDecor'
import { TAPE_PATTERN_NAMES } from './constants'

// 기본 테이프 폴더: 처음부터 '무늬'(두 색 무늬 18종)와 '레이스'(구멍 뚫린 한 색 6종)가 있다. 지우지 않고 목록 편집에서 숨기기만 한다.
const isLace = (pattern) => pattern.startsWith('lace-')
const patternItems = (test) => Object.entries(TAPE_PATTERN_NAMES).filter(([pattern]) => test(pattern)).map(([pattern, name]) => ({ pattern, name }))
export const BASE_TAPE_FOLDERS = [
  { id: 'base:pattern', name: '무늬', items: patternItems((pattern) => !isLace(pattern)) },
  { id: 'base:lace', name: '레이스', items: patternItems(isLace) },
]
export const DEFAULT_TAPE_CATEGORY = BASE_TAPE_FOLDERS[0].id

/**
 * 테이프 보관함의 분류와 목록(스티커의 stickerLibrary 와 같은 모양).
 * 칩: 즐겨찾기 · 최근(있을 때) · 기본 폴더(무늬 · 레이스)와 내 폴더(사용자가 정한 순서, 숨긴 기본 폴더는 빼고).
 * items: useCustomDecor().items, category: 마지막으로 고른 칩, keyword: 검색어(앞뒤 공백 없이)
 */
export function tapeLibrary(items, category, keyword, palette) {
  const matches = (tape) => !keyword || tape.name?.includes(keyword)
  const userFolders = (items.tapeFolders ?? []).map((f) => ({ ...f, id: `folder:${f.id}`, folderId: f.id }))
  // 기본 폴더의 무늬는 지금 고른 색을 입혀 '완성된 테이프'로 다룬다(즐겨찾기에 그 색 그대로 담긴다)
  const base = BASE_TAPE_FOLDERS.map((f) => ({ ...f, items: f.items.map((item) => ({ ...item, palette })) }))
  const all = [...base, ...userFolders]
  const favorites = items.tapeFavorites ?? []
  const recents = (items.recentTapes ?? []).slice(0, RECENT_LIMIT)
  const favoriteKeys = new Set(favorites.map(tapeKey))
  const order = items.tapeCategoryOrder ?? []
  const rank = (item, index) => {
    const at = order.indexOf(item.id)
    return at >= 0 ? at : order.length + index
  }
  const sorted = all.map((item, index) => ({ item, r: rank(item, index) })).sort((a, b) => a.r - b.r).map((x) => ({ id: x.item.id, name: x.item.name, base: x.item.id.startsWith('base:') }))
  const hidden = new Set(items.hiddenTapeCategories ?? [])
  const chips = [
    { id: 'favorites', name: '즐겨찾기' },
    { id: 'recent', name: '최근' },
    ...sorted.filter((c) => !hidden.has(c.id)),
  ]
  // 기록이 없거나 마지막 칩이 지워졌거나 숨겨졌으면 보이는 첫 기본 폴더(보통 '무늬')로 돌아간다
  const fallback = chips.find((c) => c.id.startsWith('base:'))?.id ?? chips.find((c) => c.id !== 'favorites')?.id ?? 'favorites'
  const active = chips.some((c) => c.id === category) ? category : fallback
  const folder = !keyword ? all.find((f) => f.id === active) ?? null : null
  // 검색: 기본 무늬와 내 폴더의 테이프를 이름으로 찾는다
  const matchesAll = keyword ? all.flatMap((f) => f.items.filter(matches).map((item) => ({ ...item, folderId: f.folderId ?? null }))) : []
  return { favorites, recents, favoriteKeys, sorted, hidden, chips, active, folder, matches: matchesAll }
}
