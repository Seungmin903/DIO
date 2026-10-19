import { useCallback, useEffect, useState } from 'react'
import { createId } from '../utils/common'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../utils/storage'

const EMPTY = { stickers: [], tapes: [] }

/** 사용자가 직접 추가한 스티커·테이프 목록 */
export function useCustomDecor() {
  const [items, setItems] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadJSON(STORAGE_KEYS.customDecor, EMPTY).then((saved) => {
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

  return { items, add, remove }
}
