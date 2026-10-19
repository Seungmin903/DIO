import { useEffect, useReducer, useState } from 'react'
import { createDefaultDoc } from '../state/defaultDoc'
import { createInitialState, editorReducer } from '../state/editorReducer'
import { hydrateMedia } from '../utils/mediaStore'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../utils/storage'

const SAVE_DELAY_MS = 600

/** 편집기 상태 + 기기 저장소 자동 저장 */
export function useEditor(diary) {
  const storageKey = diary?.id ? `${STORAGE_KEYS.doc}:${diary.id}` : STORAGE_KEYS.doc
  const [state, dispatch] = useReducer(editorReducer, null, () => createInitialState(createDefaultDoc(diary)))
  const [loaded, setLoaded] = useState(false)
  const [lastSave, setLastSave] = useState({ doc: null, ok: true })
  const edited = state.past.length > 0 || state.future.length > 0

  // 다이어리마다 별도 저장소를 사용해 다른 표지의 작업이 섞이지 않게 한다.
  useEffect(() => {
    let cancelled = false
    // GIF 원본(보관소) 주소를 먼저 만들어 둔 뒤 문서를 불러온다.
    hydrateMedia()
      .then(() => loadJSON(storageKey, null))
      .then((saved) => {
        if (cancelled) return
        if (saved?.pages?.length) {
          // 표지에서 바꾼 제목·색상은 기존 페이지 작업을 유지한 채 편집기에도 반영한다.
          const restored = diary
            ? { ...saved, id: diary.id, title: diary.title, coverColor: diary.color }
            : saved
          dispatch({ type: 'load', doc: restored })
        }
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [diary, storageKey])

  useEffect(() => {
    if (!loaded || !edited) return undefined
    let cancelled = false
    const doc = state.doc
    const timer = setTimeout(() => {
      saveJSON(storageKey, doc).then((ok) => {
        if (!cancelled) setLastSave({ doc, ok })
      })
    }, SAVE_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [loaded, edited, state.doc, storageKey])

  let saveStatus = 'saved'
  if (lastSave.doc === state.doc) saveStatus = lastSave.ok ? 'saved' : 'error'
  else if (edited) saveStatus = 'saving'

  return { state, dispatch, saveStatus }
}
