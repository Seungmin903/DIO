import { useCallback, useEffect, useState } from 'react'
import { createId } from '../utils/common'
import { hydrateMedia } from '../services/mediaStore'
import { mediaId } from '../utils/mediaReferences.js'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../services/storage'

// folders: 사용자가 만든 스티커 폴더 [{ id, name, items: [스티커 정보] }] (보관함 분류 칩 옆에 보인다)
// favorites: 즐겨찾기한 스티커, categoryOrder: 분류 칩 순서(분류 id·'folder:폴더id'), hiddenCategories: 숨긴 기본 분류 id
const EMPTY = { stickers: [], tapes: [], recentStickers: [], folders: [], favorites: [], categoryOrder: [], hiddenCategories: [], lastStickerCategory: null }
// 최근 사용 스티커는 8개 (보관함 기본 폭 4칸 × 2줄)
export const RECENT_LIMIT = 8

// 한 번 읽은 목록은 메모리에 두고 보관함을 다시 열 때 바로 쓴다 (열 때마다 빈 목록 → 저장소 읽기로 화면이 바뀌지 않게)
let cached = null
let cachedCategory = null
let categorySaving = Promise.resolve()
function persistCategory(category) {
  categorySaving = categorySaving.catch(() => {}).then(() => saveJSON(STORAGE_KEYS.stickerCategory, { category })).then(result => result !== false, () => false)
  return categorySaving
}
// Serialize writes so a prior effect cannot overwrite a confirmed generated folder.
let saving = Promise.resolve()
// 보관함을 닫아도 실패 상태와 최신 편집 내용은 다음 진입까지 유지한다.
let saveState = { error: null, pending: false }
let saveRevision = 0
let latestSave = Promise.resolve(true)
const saveListeners = new Set()
const SAVE_FAILURE_MESSAGE = '꾸미기 보관함 변경사항을 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.'
function notifySave(next) {
  saveState = next
  for (const listener of saveListeners) listener(next)
}
function persist(next) {
  const write = saving.catch(() => {}).then(async () => {
    if (!await saveJSON(STORAGE_KEYS.customDecor, next)) throw new Error(SAVE_FAILURE_MESSAGE)
  })
  saving = write
  return write
}
function persistVisible(next) {
  const revision = ++saveRevision
  notifySave({ ...saveState, pending: true })
  latestSave = persist(next).then(() => {
    if (revision === saveRevision) notifySave({ error: null, pending: false })
    return true
  }, () => {
    // 이전 요청의 실패·성공이 더 최신 요청의 상태를 덮지 않게 한다.
    if (revision === saveRevision) notifySave({ error: SAVE_FAILURE_MESSAGE, pending: false })
    return false
  })
  return latestSave
}

/** 사용자가 직접 추가한 스티커·테이프 목록 + 최근 쓴 스티커 */
export function useCustomDecor() {
  const [items, setItems] = useState(() => cached ?? EMPTY)
  const [loaded, setLoaded] = useState(cached != null)
  const [lastStickerCategory, setLastStickerCategory] = useState(cachedCategory)
  const [saveStatus, setSaveStatus] = useState(() => saveState)

  useEffect(() => {
    saveListeners.add(setSaveStatus)
    setSaveStatus(saveState)
    return () => { saveListeners.delete(setSaveStatus) }
  }, [])

  useEffect(() => {
    if (cached) return undefined
    let cancelled = false
    Promise.all([loadJSON(STORAGE_KEYS.customDecor, EMPTY), loadJSON(STORAGE_KEYS.stickerCategory, null)])
      .then(async ([saved, preference]) => {
        await hydrateMedia(saved)
        if (cancelled) return
        const next = { ...EMPTY, ...saved }
        // 구형 보관함의 필드는 읽기 호환용으로 남기고 새 선택은 별도 키에만 쓴다.
        const category = preference && Object.hasOwn(preference, 'category') ? preference.category : next.lastStickerCategory
        cachedCategory = typeof category === 'string' ? category : null
        setLastStickerCategory(cachedCategory)
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
    if (!loaded) return
    cached = items
    persistVisible(items)
  }, [items, loaded])

  const retrySave = useCallback(() => {
    if (!cached) return Promise.resolve(false)
    if (saveState.pending) return latestSave
    // 실패 당시 복사본이 아니라, 이후 추가·삭제·이름 변경까지 포함한 현재 내용을 저장한다.
    return persistVisible(cached)
  }, [])

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

  // The generator modal blocks other drawer edits. Publish only after persistence succeeds.
  const saveGenerated = useCallback(async (folderId, name, stickers) => {
    if (!loaded) throw new Error('보관함을 읽은 뒤 다시 시도해 주세요.')
    const current = cached ?? items
    const cleanName = name.trim()
    if (!cleanName) throw new Error('폴더 이름을 입력해 주세요.')
    const id = folderId ?? createId()
    if (folderId && !current.folders.some(f => f.id === folderId)) throw new Error('폴더가 없어졌어요. 새 폴더로 다시 저장해 주세요.')
    if (!folderId && current.folders.some(f => f.name === cleanName)) throw new Error('같은 이름의 폴더가 있어요.')
    const adding = stickers.map(stickerRef)
    const next = { ...current, folders: folderId
      ? current.folders.map(f => f.id === id ? { ...f, items: [...adding, ...f.items] } : f)
      : [...current.folders, { id, name: cleanName, items: adding }] }
    await persist(next)
    cached = next
    setItems(next)
    return id
  }, [items, loaded])
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
  const setStickerCategory = useCallback((id) => {
    if (!loaded) return
    cachedCategory = typeof id === 'string' ? id : null
    setLastStickerCategory(cachedCategory)
    // 설정 저장 실패는 보관함 내용의 저장 실패로 표시하지 않는다. 다음 선택 시 재시도한다.
    persistCategory(cachedCategory)
  }, [loaded])
  const toggleHidden = useCallback((id) => {
    setItems((prev) => ({
      ...prev,
      hiddenCategories: prev.hiddenCategories.includes(id) ? prev.hiddenCategories.filter((x) => x !== id) : [...prev.hiddenCategories, id],
    }))
  }, [])

  return {
    items,
    loaded,
    lastStickerCategory,
    saveError: saveStatus.error,
    savePending: saveStatus.pending,
    retrySave,
    add,
    remove,
    markRecent,
    addFolder,
    renameFolder,
    removeFolder,
    addToFolder,
    saveGenerated,
    removeFromFolder,
    toggleFavorite,
    setCategoryOrder,
    setStickerCategory,
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
