import { useCallback, useEffect, useState } from 'react'
import { createId } from '../utils/common'
import { hydrateMedia } from '../services/mediaStore'
import { mediaId } from '../utils/mediaReferences.js'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../services/storage'

// folders: 사용자가 만든 스티커 폴더 [{ id, name, items: [스티커 정보] }] (보관함 분류 칩 옆에 보인다)
// tapeFolders: 내 테이프 폴더 [{ id, name, items: [테이프 정보] }]. 꾸미기 공방 '테이프' 탭과 편집기 보관함 테이프 칸(스티커 칸과 같은 칩 · 목록 편집)에서 관리한다.
// tapeFavorites · recentTapes: 테이프 즐겨찾기 · 최근(기본 무늬는 { pattern }, 사진 테이프는 테이프 정보), tapeCategoryOrder · hiddenTapeCategories · lastTapeCategory: 테이프 칩 순서 · 숨긴 기본 폴더 · 마지막 칩
// favorites: 즐겨찾기한 스티커, categoryOrder: 분류 칩 순서(분류 id·'folder:폴더id'), hiddenCategories: 숨긴 기본 분류 id
const EMPTY = { widgetFavorites: [], recentWidgets: [], stickers: [], tapes: [], tapeFolders: [], tapeFavorites: [], recentTapes: [], tapeCategoryOrder: [], hiddenTapeCategories: [], lastTapeCategory: null, recentStickers: [], folders: [], favorites: [], categoryOrder: [], hiddenCategories: [], lastStickerCategory: null }
export const DEFAULT_TAPE_FOLDER = '내 테이프'
// 최근은 스티커 · 위젯 · 테이프 모두 12개까지(보관함 기본 폭 4칸 × 3줄). 새로 쓴 것이 맨 앞, 13번째로 밀리면 사라진다
export const RECENT_LIMIT = 12

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
        // 예전 '내 테이프'(폴더 없이 쌓인 테이프)는 '내 테이프' 폴더로 옮긴다.
        if (next.tapes.length) {
          next.tapeFolders = [{ id: createId(), name: DEFAULT_TAPE_FOLDER, items: next.tapes }, ...next.tapeFolders]
          next.tapes = []
        }
        // 사진 파일 이름(IMG_2031.jpg 등)으로 저장된 테이프는 폴더 안 순서대로 '테이프 n' 으로 바꾼다(코덱스 2026-11-02)
        next.tapeFolders = next.tapeFolders.map((f) => ({ ...f, items: nameFileTapes(f.items) }))
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

  // 테이프 폴더. 폴더 id 는 미리 만들어 돌려준다(만든 폴더를 바로 열 수 있게).
  const addTapeFolder = useCallback((name) => {
    const id = createId()
    setItems((prev) => ({ ...prev, tapeFolders: [...prev.tapeFolders, { id, name, items: [] }] }))
    return id
  }, [])
  const renameTapeFolder = useCallback((id, name) => {
    setItems((prev) => ({ ...prev, tapeFolders: prev.tapeFolders.map((f) => (f.id === id ? { ...f, name } : f)) }))
  }, [])
  const removeTapeFolder = useCallback((id) => {
    setItems((prev) => ({ ...prev, tapeFolders: prev.tapeFolders.filter((f) => f.id !== id) }))
  }, [])
  // 새 테이프는 폴더 맨 앞에 담는다. 폴더를 주지 않았거나 없어졌으면 첫 폴더, 폴더가 하나도 없으면 '내 테이프' 폴더를 만든다.
  // 실제로 담은 폴더 id 를 돌려준다.
  const addTape = useCallback((folderId, tape) => {
    const current = cached ?? items
    const target = current.tapeFolders.find((f) => f.id === folderId) ?? current.tapeFolders[0]
    const id = target?.id ?? createId()
    // 이름은 묻지 않고 폴더 안에서 '테이프 n' 으로 붙인다(나중에 꾸미기 공방에서 고친다)
    const entry = { ...tape, id: createId(), name: nextTapeName(target?.items ?? []) }
    setItems((prev) => {
      const exists = prev.tapeFolders.some((f) => f.id === id)
      return {
        ...prev,
        tapeFolders: exists
          ? prev.tapeFolders.map((f) => (f.id === id ? { ...f, items: [entry, ...f.items] } : f))
          : [...prev.tapeFolders, { id, name: DEFAULT_TAPE_FOLDER, items: [entry] }],
      }
    })
    return id
  }, [items])
  const removeTape = useCallback((folderId, tapeId) => {
    setItems((prev) => ({
      ...prev,
      tapeFolders: prev.tapeFolders.map((f) => (f.id === folderId ? { ...f, items: f.items.filter((item) => item.id !== tapeId) } : f)),
    }))
  }, [])
  // 테이프 이름 바꾸기: 즐겨찾기 · 최근에 담긴 같은 테이프 이름도 함께 바꾼다
  const renameTape = useCallback((folderId, tapeId, name) => {
    setItems((prev) => {
      const tape = prev.tapeFolders.find((f) => f.id === folderId)?.items.find((item) => item.id === tapeId)
      if (!tape) return prev
      const key = tapeKey(tape)
      const rename = (list) => list.map((item) => (tapeKey(item) === key ? { ...item, name } : item))
      return {
        ...prev,
        tapeFolders: prev.tapeFolders.map((f) => (f.id === folderId ? { ...f, items: f.items.map((item) => (item.id === tapeId ? { ...item, name } : item)) } : f)),
        tapeFavorites: rename(prev.tapeFavorites),
        recentTapes: rename(prev.recentTapes),
      }
    })
  }, [])
  // 같은 테이프는 맨 앞으로 옮긴다(스티커 최근과 같다)
  const markRecentTape = useCallback((tape) => {
    const key = tapeKey(tape)
    setItems((prev) => ({ ...prev, recentTapes: [tapeRef(tape), ...prev.recentTapes.filter((item) => tapeKey(item) !== key)].slice(0, RECENT_LIMIT) }))
  }, [])
  const toggleTapeFavorite = useCallback((tape) => {
    const key = tapeKey(tape)
    setItems((prev) => {
      const has = prev.tapeFavorites.some((item) => tapeKey(item) === key)
      return { ...prev, tapeFavorites: has ? prev.tapeFavorites.filter((item) => tapeKey(item) !== key) : [tapeRef(tape), ...prev.tapeFavorites] }
    })
  }, [])
  const setTapeCategoryOrder = useCallback((order) => {
    setItems((prev) => ({ ...prev, tapeCategoryOrder: order }))
  }, [])
  const toggleTapeHidden = useCallback((id) => {
    setItems((prev) => ({
      ...prev,
      hiddenTapeCategories: prev.hiddenTapeCategories.includes(id) ? prev.hiddenTapeCategories.filter((x) => x !== id) : [...prev.hiddenTapeCategories, id],
    }))
  }, [])
  const setTapeCategory = useCallback((id) => {
    setItems((prev) => (prev.lastTapeCategory === id ? prev : { ...prev, lastTapeCategory: id }))
  }, [])

  // 위젯(메모지 · 디데이 · 사진 틀) 최근 · 즐겨찾기. 스티커 · 테이프와 같은 규칙
  const markRecentWidget = useCallback((widget) => {
    const key = widgetKey(widget)
    setItems((prev) => ({ ...prev, recentWidgets: [widgetRef(widget), ...prev.recentWidgets.filter((item) => widgetKey(item) !== key)].slice(0, RECENT_LIMIT) }))
  }, [])
  const toggleWidgetFavorite = useCallback((widget) => {
    const key = widgetKey(widget)
    setItems((prev) => {
      const has = prev.widgetFavorites.some((item) => widgetKey(item) === key)
      return { ...prev, widgetFavorites: has ? prev.widgetFavorites.filter((item) => widgetKey(item) !== key) : [widgetRef(widget), ...prev.widgetFavorites] }
    })
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
    addTapeFolder,
    renameTapeFolder,
    removeTapeFolder,
    addTape,
    removeTape,
    renameTape,
    markRecentTape,
    markRecentWidget,
    toggleWidgetFavorite,
    toggleTapeFavorite,
    setTapeCategoryOrder,
    toggleTapeHidden,
    setTapeCategory,
    toggleFavorite,
    setCategoryOrder,
    setStickerCategory,
    toggleHidden,
  }
}

// 저장해 둘 스티커 정보만 골라 담는다 (최근 사용·폴더)
const stickerRef = (sticker) => ({
  asset: sticker.asset,
  widget: sticker.widget,
  style: sticker.style,
  emoji: sticker.emoji,
  src: sticker.src,
  mediaFileId: sticker.mediaFileId,
  poster: sticker.poster,
  name: sticker.name,
  aspect: sticker.aspect,
})

// 저장해 둘 위젯 정보(즐겨찾기 · 최근): 메모지는 종류, 디데이는 모양, 사진 틀은 틀 id
const widgetRef = (widget) => (widget.kind === 'frame'
  ? { kind: 'frame', frame: widget.frame, name: widget.name }
  : widget.kind === 'memo' ? { kind: 'memo', memo: widget.memo, name: widget.name } : { kind: 'sticker', widget: widget.widget, style: widget.style, name: widget.name })

/** 위젯 하나를 가리키는 키 */
export const widgetKey = (widget) => (widget.kind === 'frame' ? `frame:${widget.frame}` : widget.kind === 'memo' ? `memo:${widget.memo}` : `widget:${widget.widget}:${widget.style}`)

// 저장해 둘 테이프 정보(즐겨찾기 · 최근)는 '완성된 테이프'다: 기본 무늬는 무늬 + 그때 고른 색, 사진 테이프는 다시 붙일 수 있게 자른 자리까지 담는다.
// (색 없이 무늬만 담으면 나중에 고른 색으로 모습이 바뀌어 즐겨찾기끼리 섞여 보였다)
const tapeRef = (tape) => (tape.src || tape.mediaFileId
  ? { id: tape.id, src: tape.src, mediaFileId: tape.mediaFileId, poster: tape.poster, name: tape.name, imageWidth: tape.imageWidth, imageHeight: tape.imageHeight, crop: tape.crop, size: tape.size, pieceRatio: tape.pieceRatio }
  : { pattern: tape.pattern, palette: tape.palette, name: tape.name })

/** 테이프 하나를 가리키는 키: 기본 무늬는 'pattern:무늬:색', 사진 테이프는 미디어 id(없으면 src) */
export const tapeKey = (tape) => (tape.src || tape.mediaFileId ? mediaId(tape) ?? tape.src : `pattern:${tape.pattern}:${tape.palette ?? ''}`)

// 이미지 확장자로만 판별한다(사용자가 지은 'v1.20' 같은 이름을 열 때마다 '테이프 n' 으로 덮지 않게)
const isFileName = (name) => !name || /\.(jpe?g|png|gif|webp|heic|heif|bmp|svg)$/i.test(name)
/** 폴더 안 다음 자동 이름: '테이프 n'(이미 있는 가장 큰 n 다음) */
// 파일 이름인 테이프에 오래된 것(목록 끝)부터 '테이프 n' 을 차례로 붙인다(새 테이프는 앞에 쌓인다)
function nameFileTapes(items) {
  const out = items.map((item) => ({ ...item }))
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (isFileName(out[i].name)) out[i].name = nextTapeName(out.filter((item, j) => j !== i && !isFileName(item.name)))
  }
  return out
}
export const nextTapeName = (items) => `테이프 ${items.reduce((max, item) => Math.max(max, Number(/^테이프 (\d+)$/.exec(item.name ?? '')?.[1] ?? 0)), 0) + 1}`

// 기본 스티커는 asset, 내 스티커는 src, 예전 문서의 이모지는 emoji 로 구분한다.
export const stickerKey = (sticker) => sticker.asset ?? (sticker.widget ? `widget:${sticker.widget}:${sticker.style}` : null) ?? mediaId(sticker) ?? sticker.src ?? sticker.emoji
