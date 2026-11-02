import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../../auth/authService'
import { createMemberDiaryApi } from '../services/memberDiaryApi.js'
import { createAuthenticatedMemberTransport } from '../services/memberTransport.js'
import { memberKeys } from '../services/memberStorage.js'
import { createGuestDiaryImporter, declineGuestImport, listGuestImportCandidates, withUploadRetry } from '../services/guestDiaryImport.js'
import { createCanvasApi } from '../../collaboration/canvasApi.js'
import { createCanvasMedia, createMediaRequest } from '../../collaboration/canvasMedia.js'
import { canvasMediaFiles } from '../../editor/services/canvasMediaFiles'
import { STORAGE_KEYS } from '../../editor/utils/storageContract.js'
import { createId } from '../../editor/utils/common.js'

/**
 * 로그인 직후 이 기기의 게스트 다이어리를 회원 보관함으로 가져올지 묻고 가져온다.
 * phase: null(물을 것 없음) · 'ask' · 'running' · 'done'. 실패한 다이어리는 done 에서 다시 시도할 수 있다.
 */
export function useGuestDiaryImport(accountId, { enabled = true, onImported } = {}) {
  const [state, setState] = useState({ phase: null, candidates: [], progress: null, imported: [], failed: [] })
  const [lookupAttempt, setLookupAttempt] = useState(0)
  const sessionKey = authService.getSessionKey()
  const context = useMemo(() => ({ active: true, checked: false }), [accountId, sessionKey])
  const running = useRef(false)
  const onImportedRef = useRef(onImported)
  onImportedRef.current = onImported
  const active = () => context.active && authService.getSessionKey() === sessionKey
  const importer = useMemo(() => {
    const active = () => context.active && authService.getSessionKey() === sessionKey
    const transport = createAuthenticatedMemberTransport({ auth: authService, accountId, baseUrl: apiBaseUrl, accessTokenHeader, fetchImpl: memberFetch })
    const request = withUploadRetry(createMediaRequest({ auth: authService, accountId, sessionKey, baseUrl: apiBaseUrl, fetchImpl: memberFetch }))
    return createGuestDiaryImporter({ accountId, storage: AsyncStorage, createId, transport, isActive: active,
      api: createMemberDiaryApi(transport),
      // 미디어를 넘기지 않아 응답의 사진을 다시 내려받지 않는다(원본은 이 기기에 있다).
      canvas: createCanvasApi(transport),
      // 편집기와 같은 기록 자리를 써서, 가져온 다이어리를 열 때 같은 사진을 다시 올리지 않는다.
      mediaFor: diaryId => createCanvasMedia({ request, files: canvasMediaFiles, storage: AsyncStorage, isActive: active,
        key: `${memberKeys(accountId).doc(diaryId)}:media-uploads:v1:${encodeURIComponent(apiBaseUrl)}` }),
      loadGuestDoc: async diary => {
        const raw = await AsyncStorage.getItem(`${STORAGE_KEYS.doc}:${diary.id}`)
        try { return raw ? JSON.parse(raw) : null } catch { throw Object.assign(new Error('기기의 다이어리 문서를 읽지 못했어요. 원본은 그대로 남아 있어요.'), { code: 'INVALID_LOCAL_DOCUMENT' }) }
      },
    })
  }, [accountId, sessionKey, context])

  useEffect(() => {
    context.active = true
    return () => { context.active = false }
  }, [context])

  useEffect(() => {
    let cancelled = false
    if (!enabled || context.checked) return

    ;(async () => {
      const [{ diaries, declined }, pending] = await Promise.all([listGuestImportCandidates(AsyncStorage, accountId), importer.pendingIds()])
      if (cancelled || !active()) return
      context.checked = true
      if (!diaries.length) return
      // 가져오지 않기로 한 계정도 끝나지 않은 가져오기가 있으면 다시 묻는다.
      const unfinished = diaries.filter(diary => pending.includes(diary.id))
      if (declined && !unfinished.length) return
      setState(current => current.phase ? current : { ...current, phase: 'ask', candidates: declined ? unfinished : diaries })
    })().catch(error => {
      if (cancelled || !active()) return
      context.checked = true
      const notice = Object.assign(new Error('이 기기의 가져오기 기록을 읽지 못했어요. 다시 시도해 주세요. 원본은 그대로 남아 있어요.'),
        { code: error?.code ?? 'GUEST_IMPORT_LOOKUP_FAILED' })
      setState(current => ({ ...current, phase: 'done', candidates: [], progress: null, failed: [{ lookup: true, error: notice }] }))
    })
    return () => { cancelled = true }
  }, [accountId, enabled, importer, lookupAttempt])

  const run = useCallback(async targets => {
    if (!enabled || running.current || !active() || !targets.length) return
    running.current = true
    try {
      setState(current => ({ ...current, phase: 'running', progress: { index: 0, count: targets.length, done: 0, total: 1, title: targets[0]?.title ?? '' }, failed: [] }))
      const result = await importer.run(targets, { onProgress: ({ guestDiaryId, done, total }) => {
        if (!active()) return
        const index = targets.findIndex(diary => diary.id === guestDiaryId)
        setState(current => ({ ...current, progress: { index, count: targets.length, done, total, title: targets[index]?.title ?? '' } }))
      } })
      if (!active()) return
      setState(current => ({ ...current, phase: 'done', progress: null, imported: [...current.imported, ...result.imported],
        failed: result.failed.map(row => ({ ...row, diary: targets.find(diary => diary.id === row.guestDiaryId) })) }))
      if (result.imported.length) onImportedRef.current?.()
    } finally { running.current = false }
  }, [importer, enabled, context, sessionKey])

  return {
    ...state,
    phase: enabled && active() ? state.phase : null,
    start: () => run(state.candidates),
    retry: () => {
      if (state.failed.some(row => row.lookup)) {
        if (!enabled || !active()) return
        context.checked = false
        setState(current => ({ ...current, phase: null, progress: null, candidates: [], failed: [] }))
        setLookupAttempt(attempt => attempt + 1)
        return
      }
      return run(state.failed.map(row => row.diary).filter(Boolean))
    },
    later: () => setState(current => ({ ...current, phase: null })),
    decline: () => { setState(current => ({ ...current, phase: null })); declineGuestImport(AsyncStorage, accountId).catch(() => {}) },
    close: () => setState(current => ({ ...current, phase: null })),
  }
}
