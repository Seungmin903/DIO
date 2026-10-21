import { AppState, InteractionManager } from 'react-native'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createDefaultDoc, migrateUntouchedAnnualDoc } from '../state/defaultDoc'
import { createInitialState, editorReducer } from '../state/editorReducer'
import { hydrateMedia } from '../services/mediaStore'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../services/storage'

const SAVE_DELAY_MS = 1200
const SAVE_MAX_DELAY_MS = 5000
// 열린 제스처 핸들이 남아 있으면 runAfterInteractions가 끝내 실행되지 않을 수 있어 이만큼만 기다린다.
const SAVE_INTERACTION_WAIT_MS = 1000

/** 편집기 상태 + 기기 저장소 자동 저장 */
export function useEditor(diary) {
  const storageKey = diary?.id ? `${STORAGE_KEYS.doc}:${diary.id}` : STORAGE_KEYS.doc
  const [state, dispatch] = useReducer(editorReducer, null, () => createInitialState(createDefaultDoc(diary)))
  const [loaded, setLoaded] = useState(false)
  const [lastSave, setLastSave] = useState({ doc: null, ok: true })
  const pendingSave = useRef(null)
  const saveTimer = useRef(null)
  const interaction = useRef(null)
  const saving = useRef(false)
  const dirtySince = useRef(null)
  const currentKey = useRef(storageKey)
  const edited = state.past.length > 0 || state.future.length > 0
  currentKey.current = storageKey

  const clearSchedule = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    interaction.current?.cancel?.()
    interaction.current = null
  }, [])

  const flushSave = useCallback(() => {
    clearSchedule()
    const target = pendingSave.current
    if (!target || saving.current) return
    pendingSave.current = null
    saving.current = true
    saveJSON(target.key, target.doc).then((ok) => {
      if (target.key === currentKey.current) setLastSave({ doc: target.doc, ok })
    }).finally(() => {
      saving.current = false
      dirtySince.current = pendingSave.current ? dirtySince.current : null
      if (pendingSave.current) flushSave()
    })
  }, [clearSchedule])

  // 다이어리마다 별도 저장소를 사용해 다른 표지의 작업이 섞이지 않게 한다.
  useEffect(() => {
    let cancelled = false
    // 문서가 참조하는 ID만 먼저 연결한다. 일부 누락이 다른 페이지 복원을 막지 않는다.
    loadJSON(storageKey, null)
      .then(async (saved) => {
        const migrated = migrateUntouchedAnnualDoc(saved, diary)
        // 내용 없는 예전 연간 기본 문서는 한 페이지로 정리해 다음 실행부터도
        // 불필요한 78개 속지를 다시 불러오지 않는다. 저장은 화면 표시를 기다리게 하지 않는다.
        if (migrated !== saved) saveJSON(storageKey, migrated)
        // 사진·GIF 연결은 화면을 먼저 띄운 뒤 진행한다. 각 요소는 준비되는 대로 표시된다(useMediaUri 구독).
        hydrateMedia(migrated).catch(() => {})
        if (cancelled) return
        if (migrated?.pages?.length) {
          // 표지에서 바꾼 제목·색상은 기존 페이지 작업을 유지한 채 편집기에도 반영한다.
          const restored = diary
            ? { ...migrated, id: diary.id, title: diary.title, coverColor: diary.color }
            : migrated
          dispatch({ type: 'load', doc: restored })
        }
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [diary, storageKey])

  // 연속 입력은 마지막 변경 1.2초 뒤에 합쳐 저장한다. 편집이 계속되더라도 5초 안에는
  // 한 번 저장하며, 저장 작업은 제스처·애니메이션이 끝난 뒤로 미룬다.
  useEffect(() => {
    if (!loaded || !edited) return undefined
    pendingSave.current = { key: storageKey, doc: state.doc }
    if (!dirtySince.current) dirtySince.current = Date.now()
    clearSchedule()
    const elapsed = Date.now() - dirtySince.current
    const delay = Math.max(0, Math.min(SAVE_DELAY_MS, SAVE_MAX_DELAY_MS - elapsed))
    saveTimer.current = setTimeout(() => {
      interaction.current = InteractionManager.runAfterInteractions(flushSave)
      saveTimer.current = setTimeout(flushSave, SAVE_INTERACTION_WAIT_MS)
    }, delay)
    return clearSchedule
  }, [clearSchedule, edited, flushSave, loaded, state.doc, storageKey])

  // 화면 이동·문서 전환·앱 백그라운드에서도 마지막 편집을 잃지 않는다.
  useEffect(() => () => flushSave(), [flushSave, storageKey])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'inactive' || next === 'background') flushSave()
    })
    return () => subscription.remove()
  }, [flushSave])

  let saveStatus = 'saved'
  if (lastSave.doc === state.doc) saveStatus = lastSave.ok ? 'saved' : 'error'
  else if (edited) saveStatus = 'saving'

  return { state, dispatch, saveStatus, loaded }
}
