import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { mediaId } from '../utils/mediaReferences.js'
import { mediaService, mediaUri, mediaRegistry } from '../utils/mediaStore'

/** ID만 있는 요소나 늦게 조회된 원본도 다시 그린다. 조회 실패 안내는 70의 책임이다. */
export function useMediaUri(item, options) {
  const id = mediaId(item)
  // 다른 ID의 알림이 와도 같은 스냅샷이면 React가 다시 렌더링하지 않는다.
  const getSnapshot = useCallback(() => mediaRegistry.get(id), [id])
  useSyncExternalStore(mediaRegistry.subscribe, getSnapshot, getSnapshot)
  useEffect(() => {
    if (id) mediaService.resolveDisplay(id).catch(() => {})
  }, [id])
  return mediaUri(item, options)
}
