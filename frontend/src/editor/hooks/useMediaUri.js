import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { mediaId } from '../utils/mediaReferences.js'
import { mediaService, mediaRegistry } from '../services/mediaStore'

/**
 * 레지스트리 항목(상태 · 오류)을 구독해 읽는다. 렌더 중에 mediaRegistry.get(id) 를 바로 부르면
 * React Compiler 가 id 기준으로 기억해 둬 상태가 바뀌어도 처음 값에 머문다. 화면에서는 이 훅으로 읽는다.
 */
export function useMediaEntry(id) {
  const getSnapshot = useCallback(() => (id ? mediaRegistry.get(id) : undefined), [id])
  return useSyncExternalStore(mediaRegistry.subscribe, getSnapshot, getSnapshot)
}

/** 화면 구독 수로 표시 URL 수명을 관리한다. 원본 파일은 삭제하지 않는다. */
export function useMediaUri(item, { still = false } = {}) {
  const source = still && item?.poster ? item.poster : item
  const id = mediaId(source)
  // 주소는 반드시 구독한 스냅샷에서 꺼낸다. 예전에는 스냅샷을 버리고 mediaUri(item) 로 레지스트리를 다시 읽었는데,
  // React Compiler 가 그 호출을 item 기준으로 기억해 두어 읽기가 끝난 뒤에도 처음 값(null)을 돌려줬다(들어가자마자 표지 사진이 안 뜸).
  // 다른 ID의 알림이 와도 같은 스냅샷이면 React가 다시 렌더링하지 않는다.
  const entry = useMediaEntry(id)
  useEffect(() => {
    const release = mediaRegistry.retain(id)
    if (id) mediaService.resolveDisplay(id).catch(() => {})
    return release
  }, [id])
  if (id) return entry?.status === 'ready' ? entry.uri : null
  return typeof source === 'string' ? source : source?.src ?? null
}
