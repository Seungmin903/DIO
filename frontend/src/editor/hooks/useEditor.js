import { useEffect, useReducer, useState } from 'react'
import { createDefaultDoc } from '../state/defaultDoc'
import { createInitialState, editorReducer } from '../state/editorReducer'
import { hydrateMedia } from '../utils/mediaStore'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../utils/storage'

const SAVE_DELAY_MS = 600

/** 편집기 상태 + 기기 저장소 자동 저장 */
export function useEditor() {
  const [state, dispatch] = useReducer(editorReducer, null, () => createInitialState(createDefaultDoc()))
  const [loaded, setLoaded] = useState(false)
  const [lastSave, setLastSave] = useState({ doc: null, ok: true })
  const edited = state.past.length > 0 || state.future.length > 0

  // 저장된 문서가 있으면 불러온다. (AsyncStorage 는 비동기라 첫 화면은 데모로 그린 뒤 교체)
  useEffect(() => {
    let cancelled = false
    // 문서가 참조하는 ID만 먼저 연결한다. 일부 누락이 다른 페이지 복원을 막지 않는다.
    loadJSON(STORAGE_KEYS.doc, null)
      .then(async (saved) => {
        await hydrateMedia(saved)
        if (cancelled) return
        if (saved?.pages?.length) dispatch({ type: 'load', doc: saved })
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loaded || !edited) return undefined
    let cancelled = false
    const doc = state.doc
    const timer = setTimeout(() => {
      saveJSON(STORAGE_KEYS.doc, doc).then((ok) => {
        if (!cancelled) setLastSave({ doc, ok })
      })
    }, SAVE_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [loaded, edited, state.doc])

  let saveStatus = 'saved'
  if (lastSave.doc === state.doc) saveStatus = lastSave.ok ? 'saved' : 'error'
  else if (edited) saveStatus = 'saving'

  return { state, dispatch, saveStatus }
}
