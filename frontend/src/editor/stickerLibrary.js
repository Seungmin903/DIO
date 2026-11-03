import { BUILTIN_PACK, BUILTIN_STICKERS } from './builtinStickers'
import { RECENT_LIMIT, stickerKey } from './hooks/useCustomDecor'

/**
 * 스티커 보관함의 분류와 목록. 편집기 보관함과 표지 스티커가 같은 즐겨찾기 · 최근 · 기본 분류(디오&모아) · 내 폴더 · 분류 순서를 쓴다.
 * items: useCustomDecor().items, category: 마지막으로 고른 칩, keyword: 검색어(앞뒤 공백 없이)
 * 외부 출처 기본 스티커는 없앴고 위젯(디데이)은 위젯 칸으로 옮겼다. 예전 즐겨찾기 · 최근 · 폴더에 남은 둘은 보여 주지 않는다.
 */
export function stickerLibrary(items, category, keyword) {
  const plain = (list) => list.filter((item) => !item.widget && !item.asset)
  const matches = (sticker) => !keyword || sticker.name?.includes(keyword) || sticker.emoji === keyword
  const folders = items.folders.map((f) => ({ ...f, items: plain(f.items) }))
  const favorites = plain(items.favorites)
  const recents = plain(items.recentStickers).slice(0, RECENT_LIMIT)
  const favoriteKeys = new Set(favorites.map(stickerKey))
  // base: 지우지 못하고 숨기기만 하는 기본 분류
  const orderable = [{ id: BUILTIN_PACK.id, name: BUILTIN_PACK.name, base: true }, ...folders.map((f) => ({ id: `folder:${f.id}`, name: f.name }))]
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
    { id: 'recent', name: '최근' },
    ...sorted.filter((c) => !hidden.has(c.id)),
  ]
  const fallback = favorites.length ? 'favorites' : recents.length ? 'recent' : chips.find((c) => c.id !== 'favorites' && c.id !== 'recent')?.id ?? 'favorites'
  const active = chips.some((c) => c.id === category) ? category : fallback
  const folder = !keyword && active?.startsWith('folder:') ? folders.find((f) => `folder:${f.id}` === active) : null
  const pack = !keyword && active === BUILTIN_PACK.id ? { ...BUILTIN_PACK, items: BUILTIN_STICKERS } : null
  // 검색: 기본 스티커와 폴더 안 스티커를 이름으로 찾는다
  const packMatches = keyword ? BUILTIN_STICKERS.filter(matches) : []
  const folderMatches = keyword
    ? folders.flatMap((f) => f.items.filter(matches).map((item) => ({ ...item, folderId: f.id })))
    : []
  return { folders, favorites, recents, favoriteKeys, orderable, sorted, hidden, chips, active, folder, pack, packMatches, folderMatches }
}
