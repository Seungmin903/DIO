import { useCallback, useEffect, useState } from 'react'
import { createId } from '../utils/common'
import { hydrateMedia } from '../services/mediaStore'
import { mediaId } from '../utils/mediaReferences.js'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../services/storage'

// folders: 사용자가 만든 스티커 폴더 [{ id, name, items: [스티커 정보] }] (보관함 분류 칩 옆에 보인다)
// favorites: 즐겨찾기한 스티커, categoryOrder: 분류 칩 순서(분류 id·'folder:폴더id'), hiddenCategories: 숨긴 기본 분류 id
const EMPTY = { stickers: [], tapes: [], recentStickers: [], folders: [], favorites: [], categoryOrder: [], hiddenCategories: [] }
// 최근 사용 스티커는 8개 (보관함 기본 폭 4칸 × 2줄)
export const RECENT_LIMIT = 8

/** 사용자가 직접 추가한 스티커·테이프 목록 + 최근 쓴 스티커 */
export function useCustomDecor() {
  const [items, setItems] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadJSON(STORAGE_KEYS.customDecor, EMPTY)
      .then(async (saved) => {
        await hydrateMedia(saved)
        if (cancelled) return
        const next = { ...EMPTY, ...saved }
        // 예전 '내 스티커'(폴더 없이 올린 스티커)는 '내 스티커' 폴더로 옮긴다.
        if (next.stickers.length) {
          next.folders = [{ id: createId(), name: '내 스티커', items: next.stickers.map(stickerRef) }, ...next.folders]
          next.stickers = []
        }
        setItems(next)
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (loaded) saveJSON(STORAGE_KEYS.customDecor, items)
  }, [items, loaded])

  const add = useCallback((kind, item) => {
    setItems((prev) => ({ ...prev, [kind]: [{ ...item, id: createId() }, ...prev[kind]] }))
  }, [])

  const remove = useCallback((kind, id) => {
    setItems((prev) => ({ ...prev, [kind]: prev[kind].filter((item) => item.id !== id) }))
  }, [])

  // 같은 스티커는 맨 앞으로 옮긴다.
  const markRecent = useCallback((sticker) => {
    const key = stickerKey(sticker)
    setItems((prev) => ({
      ...prev,
      recentStickers: [stickerRef(sticker), ...prev.recentStickers.filter((item) => stickerKey(item) !== key)].slice(0, RECENT_LIMIT),
    }))
  }, [])

  // 스티커 폴더
  const addFolder = useCallback((name) => {
    const id = createId()
    setItems((prev) => ({ ...prev, folders: [...prev.folders, { id, name, items: [] }] }))
    return id
  }, [])
  const renameFolder = useCallback((id, name) => {
    setItems((prev) => ({ ...prev, folders: prev.folders.map((f) => (f.id === id ? { ...f, name } : f)) }))
  }, [])
  const removeFolder = useCallback((id) => {
    setItems((prev) => ({ ...prev, folders: prev.folders.filter((f) => f.id !== id) }))
  }, [])
  // 같은 스티커는 한 번만 담는다. 새로 담은 것이 앞에 온다.
  const addToFolder = useCallback((id, stickers) => {
    setItems((prev) => ({
      ...prev,
      folders: prev.folders.map((f) => {
        if (f.id !== id) return f
        const adding = stickers.map(stickerRef)
        const keys = new Set(adding.map(stickerKey))
        return { ...f, items: [...adding, ...f.items.filter((item) => !keys.has(stickerKey(item)))] }
      }),
    }))
  }, [])
  const removeFromFolder = useCallback((id, sticker) => {
    const key = stickerKey(sticker)
    setItems((prev) => ({
      ...prev,
      folders: prev.folders.map((f) => (f.id === id ? { ...f, items: f.items.filter((item) => stickerKey(item) !== key) } : f)),
    }))
  }, [])

  // 즐겨찾기: 있으면 빼고, 없으면 맨 앞에 넣는다.
  const toggleFavorite = useCallback((sticker) => {
    const key = stickerKey(sticker)
    setItems((prev) => {
      const has = prev.favorites.some((item) => stickerKey(item) === key)
      return { ...prev, favorites: has ? prev.favorites.filter((item) => stickerKey(item) !== key) : [stickerRef(sticker), ...prev.favorites] }
    })
  }, [])

  // 분류 칩 순서·숨기기 (기본 분류는 지우지 않고 숨기기만)
  const setCategoryOrder = useCallback((order) => {
    setItems((prev) => ({ ...prev, categoryOrder: order }))
  }, [])
  const toggleHidden = useCallback((id) => {
    setItems((prev) => ({
      ...prev,
      hiddenCategories: prev.hiddenCategories.includes(id) ? prev.hiddenCategories.filter((x) => x !== id) : [...prev.hiddenCategories, id],
    }))
  }, [])

  return {
    items,
    add,
    remove,
    markRecent,
    addFolder,
    renameFolder,
    removeFolder,
    addToFolder,
    removeFromFolder,
    toggleFavorite,
    setCategoryOrder,
    toggleHidden,
  }
}

// 저장해 둘 스티커 정보만 골라 담는다 (최근 사용·폴더)
const stickerRef = (sticker) => ({
  asset: sticker.asset,
  emoji: sticker.emoji,
  src: sticker.src,
  mediaFileId: sticker.mediaFileId,
  poster: sticker.poster,
  name: sticker.name,
  aspect: sticker.aspect,
})

// 기본 스티커는 asset, 내 스티커는 src, 예전 문서의 이모지는 emoji 로 구분한다.
export const stickerKey = (sticker) => sticker.asset ?? mediaId(sticker) ?? sticker.src ?? sticker.emoji
