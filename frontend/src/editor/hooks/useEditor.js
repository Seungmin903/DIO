import { AppState } from 'react-native'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createDefaultDoc } from '../state/defaultDoc'
import { createInitialState, editorReducer } from '../state/editorReducer'
import { editorDocKey, loadEditorDoc, peekEditorDoc, rememberEditorDoc, saveEditorDoc } from '../services/editorDocs'
import { hydrateMedia } from '../services/mediaStore'
import { scheduleIdleTask } from '../utils/idleTask'
import { loadViewedPage, peekViewedPage, rememberViewedPage } from '../services/editorViewState'

const SAVE_DELAY_MS = 1200
const SAVE_MAX_DELAY_MS = 5000
// 메인 스레드가 바빠도 자동 저장을 무한히 미루지 않는다.
const SAVE_INTERACTION_WAIT_MS = 1000

// 표지에서 바꾼 제목·색상은 기존 페이지 작업을 유지한 채 편집기에도 반영한다.
const withDiary = (doc, diary) => (diary ? {
  ...doc,
  id: diary.id,
  ...(diary.createdAt ? { createdAt: diary.createdAt } : {}),
  title: diary.title,
  coverColor: diary.color,
} : doc)

/** 편집기 상태 + 기기 저장소 자동 저장 */
export function useEditor(diary) {
  const storageKey = editorDocKey(diary)
  // 홈에서 미리 읽어 둔 문서가 있으면 첫 렌더부터 그 문서로 시작한다. (로딩 단계 없음)
  const [initial] = useState(() => peekEditorDoc(storageKey))
  const [initialPage] = useState(() => peekViewedPage(storageKey))
  const [state, dispatch] = useReducer(editorReducer, null, () => createInitialState(
    initial?.doc ? withDiary(initial.doc, diary) : createDefaultDoc(diary),
    initialPage,
  ))
  const [loaded, setLoaded] = useState(initial !== null && initialPage !== undefined)
  // 저장 문서를 읽지 못했으면 기존 문서를 빈 문서로 덮어쓰지 않도록 이번에는 저장하지 않는다.
  const [writable, setWritable] = useState(true)
  const diaryRef = useRef(diary)
  diaryRef.current = diary
  const [lastSave, setLastSave] = useState({ doc: null, ok: true })
  const pendingSave = useRef(null)
  const saveTimer = useRef(null)
  const interaction = useRef(null)
  const saving = useRef(false)
  const dirtySince = useRef(null)
  const currentKey = useRef(storageKey)
  const edited = state.past.length > 0 || state.future.length > 0 || state.externalDirty === true
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
    saveEditorDoc(target.key, target.doc).then((ok) => {
      if (target.key === currentKey.current) setLastSave({ doc: target.source ?? target.doc, ok })
    }).finally(() => {
      saving.current = false
      dirtySince.current = pendingSave.current ? dirtySince.current : null
      if (pendingSave.current) flushSave()
    })
  }, [clearSchedule])

  // 다이어리마다 별도 저장소를 사용해 다른 표지의 작업이 섞이지 않게 한다.
  useEffect(() => {
    if (initial && initialPage !== undefined) {
      // 사진·GIF는 진입 전에 대부분 준비된다. 남은 것은 준비되는 대로 표시된다(useMediaUri 구독).
      if (initial.doc) hydrateMedia(initial.doc).catch(() => {})
      return undefined
    }
    let cancelled = false
    Promise.all([
      initial ? Promise.resolve(initial.doc) : loadEditorDoc(diaryRef.current),
      loadViewedPage(storageKey).catch(() => null),
    ]).then(([saved, pageId]) => {
      if (saved) hydrateMedia(saved).catch(() => {})
      if (cancelled) return
      if (saved) dispatch({ type: 'load', doc: withDiary(saved, diaryRef.current), pageId })
      setLoaded(true)
    }, () => {
      if (cancelled) return
      setWritable(false)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [initial, initialPage, storageKey])

  // 페이지를 보기만 해도 위치를 기억하되 문서 저장·수정 시각에는 영향을 주지 않는다.
  const viewedPageId = (state.doc.pages.find((item) => item.id === state.pageId) ?? state.doc.pages[0])?.id
  useEffect(() => {
    if (!loaded || !writable) return
    if (viewedPageId) rememberViewedPage(storageKey, viewedPageId)
  }, [loaded, writable, viewedPageId, storageKey])

  // 연속 입력은 마지막 변경 1.2초 뒤에 합쳐 저장한다. 편집이 계속되더라도 5초 안에는
  // 한 번 저장을 예약하며, 저장 작업은 메인 스레드의 유휴 시간으로 미룬다.
  useEffect(() => {
    if (!loaded || !edited || !writable) return undefined
    const snapshot = { ...state.doc, updatedAt: new Date().toISOString() }
    rememberEditorDoc(storageKey, snapshot)
    pendingSave.current = { key: storageKey, doc: snapshot, source: state.doc }
    if (!dirtySince.current) dirtySince.current = Date.now()
    clearSchedule()
    const elapsed = Date.now() - dirtySince.current
    const delay = Math.max(0, Math.min(SAVE_DELAY_MS, SAVE_MAX_DELAY_MS - elapsed))
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      interaction.current = scheduleIdleTask(flushSave, SAVE_INTERACTION_WAIT_MS)
    }, delay)
    return clearSchedule
  }, [clearSchedule, edited, flushSave, loaded, state.doc, storageKey, writable])

  // 화면 이동·문서 전환·앱 백그라운드에서도 마지막 편집을 잃지 않는다.
  useEffect(() => () => flushSave(), [flushSave, storageKey])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'inactive' || next === 'background') flushSave()
    })
    return () => subscription.remove()
  }, [flushSave])

  let saveStatus = 'saved'
  if (!writable && edited) saveStatus = 'load-error'
  else if (lastSave.doc === state.doc) saveStatus = lastSave.ok ? 'saved' : 'error'
  else if (edited) saveStatus = 'saving'

  return { state, dispatch, saveStatus, loaded }
}
