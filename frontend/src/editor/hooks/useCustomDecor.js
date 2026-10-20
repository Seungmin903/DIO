import { useCallback, useEffect, useState } from 'react'
import { createId } from '../utils/common'
import { hydrateMedia } from '../services/mediaStore'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../services/storage'

const EMPTY = { stickers: [], tapes: [], recentStickers: [] }
const RECENT_LIMIT = 12

/** 사용자가 직접 추가한 스티커·테이프 목록 + 최근 쓴 스티커 */
export function useCustomDecor() {
  const [items, setItems] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    hydrateMedia()
      .then(() => loadJSON(STORAGE_KEYS.customDecor, EMPTY))
      .then((saved) => {
        setItems({ ...EMPTY, ...saved })
        setLoaded(true)
      })
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
      recentStickers: [
        {
          asset: sticker.asset,
          emoji: sticker.emoji,
          src: sticker.src,
          poster: sticker.poster,
          name: sticker.name,
          aspect: sticker.aspect,
        },
        ...prev.recentStickers.filter((item) => stickerKey(item) !== key),
      ].slice(0, RECENT_LIMIT),
    }))
  }, [])

  return { items, add, remove, markRecent }
}

// 기본 스티커는 asset, 내 스티커는 src, 예전 문서의 이모지는 emoji 로 구분한다.
export const stickerKey = (sticker) => sticker.asset ?? sticker.src ?? sticker.emoji
