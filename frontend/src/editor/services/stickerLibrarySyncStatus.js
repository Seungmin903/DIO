import { useSyncExternalStore } from 'react'

// 스티커 보관함 계정 동기화의 마지막 결과(실패 문구 · 다시 맞추는 중). 동기화(diary/components/StickerLibrarySyncHost.js)가 쓰고,
// 꾸미기 공방 스티커 탭이 보여 주며 '다시 맞추기'를 누를 수 있게 한다(운영 빌드에서도 실패가 드러나게). 네트워크 의존성이 없어 화면 · 테스트가 가볍게 쓴다
let status = { error: null, pending: false }
let retryHandler = null
const listeners = new Set()

export function setStickerSyncStatus(next) {
  const merged = { ...status, ...next }
  if (merged.error === status.error && merged.pending === status.pending) return
  status = merged
  listeners.forEach(listener => listener())
}
/** 지금 동기화가 있으면 다시 맞추는 함수를 건다(없으면 null) */
export function setStickerSyncRetry(handler) { retryHandler = handler }
export const stickerSyncStatusSnapshot = () => status
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }

export function retryStickerLibrarySync() {
  if (!retryHandler || status.pending) return Promise.resolve()
  setStickerSyncStatus({ pending: true })
  return Promise.resolve(retryHandler()).catch(() => {}).finally(() => setStickerSyncStatus({ pending: false }))
}

/** { error, pending, retry }: 로그인하지 않았으면 error 는 늘 null */
export function useStickerLibrarySyncStatus() {
  const current = useSyncExternalStore(subscribe, stickerSyncStatusSnapshot, stickerSyncStatusSnapshot)
  return { ...current, retry: retryStickerLibrarySync }
}
