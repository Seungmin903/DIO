import { useSyncExternalStore } from 'react'

// 내 속지 계정 동기화의 마지막 결과(실패 문구 · 다시 맞추는 중). 동기화(diary/components/StickerLibrarySyncHost.js)가 쓰고,
// 꾸미기 공방 속지 탭이 보여 주며 '다시 맞추기'를 누를 수 있게 한다. 스티커 보관함의 stickerLibrarySyncStatus.js 와 같은 모양이다
let status = { error: null, pending: false }
let retryHandler = null
const listeners = new Set()

export function setPaperSyncStatus(next) {
  const merged = { ...status, ...next }
  if (merged.error === status.error && merged.pending === status.pending) return
  status = merged
  listeners.forEach(listener => listener())
}
/** 지금 동기화가 있으면 다시 맞추는 함수를 건다(없으면 null) */
export function setPaperSyncRetry(handler) { retryHandler = handler }
export const paperSyncStatusSnapshot = () => status
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }

export function retryPaperLibrarySync() {
  if (!retryHandler || status.pending) return Promise.resolve()
  setPaperSyncStatus({ pending: true })
  return Promise.resolve(retryHandler()).catch(() => {}).finally(() => setPaperSyncStatus({ pending: false }))
}

/** { error, pending, retry }: 로그인하지 않았으면 error 는 늘 null */
export function usePaperLibrarySyncStatus() {
  const current = useSyncExternalStore(subscribe, paperSyncStatusSnapshot, paperSyncStatusSnapshot)
  return { ...current, retry: retryPaperLibrarySync }
}
