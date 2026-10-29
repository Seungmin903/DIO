import { STICKER_GROUPS } from './stickerAssets'
import { RECENT_LIMIT, stickerKey } from './hooks/useCustomDecor'

// 기본 스티커는 출처별로 묶는다. 저장된 asset ID와 표시 순서는 유지한다.
// Noto의 기존 motion ID는 분류 숨김·순서 설정 호환을 위해 유지한다.
export const BASE_GROUPS = [
  {
    id: 'fluent-emoji',
    title: 'Fluent Emoji',
    name: 'Fluent Emoji',
    items: STICKER_GROUPS.filter((g) => !g.id.startsWith('motion') && g.id !== 'twemoji').flatMap((g) => g.items),
  },
  {
    id: 'motion',
    title: 'Noto Animated Emoji',
    name: 'Noto Animated Emoji',
    badge: 'GIF',
    items: STICKER_GROUPS.filter((g) => g.id.startsWith('motion')).flatMap((g) => g.items),
  },
  {
    id: 'twemoji',
    title: 'Twemoji',
    name: 'Twemoji',
    items: STICKER_GROUPS.find((g) => g.id === 'twemoji').items,
  },
]

/**
 * 스티커 보관함의 분류와 목록. 편집기 보관함과 표지 스티커가 같은 즐겨찾기 · 최근 · 내 폴더 · 분류 순서를 쓴다.
 * items: useCustomDecor().items, category: 마지막으로 고른 칩, keyword: 검색어(앞뒤 공백 없이)
 */
export function stickerLibrary(items, category, keyword) {
  const matches = (sticker) => !keyword || sticker.name?.includes(keyword) || sticker.emoji === keyword
  const folders = items.folders
  const favorites = items.favorites
  // 예전에 12개까지 저장된 기록도 8개만 보여 준다
  const recents = items.recentStickers.slice(0, RECENT_LIMIT)
  const favoriteKeys = new Set(favorites.map(stickerKey))
  const orderable = [
    ...BASE_GROUPS.map((g) => ({ id: g.id, name: g.name, base: true })),
    ...folders.map((f) => ({ id: `folder:${f.id}`, name: f.name })),
  ]
  const order = items.categoryOrder
  const rank = (item, index) => {
    const at = order.indexOf(item.id)
    return at >= 0 ? at : order.length + index
  }
  const sorted = orderable.map((item, index) => ({ item, r: rank(item, index) })).sort((a, b) => a.r - b.r).map((x) => x.item)
  const hidden = new Set(items.hiddenCategories)
  // 기록이 없거나 마지막 칩이 삭제·숨김 상태이면 즐겨찾기 → 최근 → 첫 분류 중 비어 있지 않은 칩으로 돌아간다.
  const chips = [
    { id: 'favorites', name: '즐겨찾기' },
    ...(recents.length ? [{ id: 'recent', name: '최근' }] : []),
    ...sorted.filter((c) => !hidden.has(c.id)),
  ]
  const fallback = favorites.length ? 'favorites' : recents.length ? 'recent' : chips.find((c) => c.id !== 'favorites')?.id ?? 'favorites'
  const active = chips.some((c) => c.id === category) ? category : fallback
  const folder = !keyword && active?.startsWith('folder:') ? folders.find((f) => `folder:${f.id}` === active) : null
  // 검색: 출처별 기본 분류 전체 + 폴더. 스티커 이름과 출처 이름으로 찾는다.
  const groups = keyword
    ? BASE_GROUPS.map((group) => ({
        ...group,
        items: group.title.includes(keyword) ? group.items : group.items.filter(matches),
      })).filter((g) => g.items.length)
    : BASE_GROUPS.filter((g) => g.id === active)
  const folderMatches = keyword
    ? folders.flatMap((f) => f.items.filter(matches).map((item) => ({ ...item, folderId: f.id })))
    : []
  return { folders, favorites, recents, favoriteKeys, orderable, sorted, hidden, chips, active, folder, groups, folderMatches }
}
