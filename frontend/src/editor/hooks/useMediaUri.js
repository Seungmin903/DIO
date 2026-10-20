import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { mediaId } from '../utils/mediaReferences.js'
import { mediaService, mediaUri, mediaRegistry } from '../services/mediaStore'

/** 화면 구독 수로 표시 URL 수명을 관리한다. 원본 파일은 삭제하지 않는다. */
export function useMediaUri(item, options) {
  const id = mediaId(item)
  // 다른 ID의 알림이 와도 같은 스냅샷이면 React가 다시 렌더링하지 않는다.
  const getSnapshot = useCallback(() => mediaRegistry.get(id), [id])
  useSyncExternalStore(mediaRegistry.subscribe, getSnapshot, getSnapshot)
  useEffect(() => {
    const release = mediaRegistry.retain(id)
    if (id) mediaService.resolveDisplay(id).catch(() => {})
    return release
  }, [id])
  return mediaUri(item, options)
}
