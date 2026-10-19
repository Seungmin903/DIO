import { useEffect, useSyncExternalStore } from 'react'
import { mediaId } from '../utils/mediaReferences.js'
import { mediaService, mediaUri, mediaRegistry } from '../utils/mediaStore'

/** 화면 구독 수로 표시 URL 수명을 관리한다. 원본 파일은 삭제하지 않는다. */
export function useMediaUri(item, options) {
  const id = mediaId(item)
  useSyncExternalStore(mediaRegistry.subscribe, mediaRegistry.getRevision, mediaRegistry.getRevision)
  useEffect(() => {
    const release = mediaRegistry.retain(id)
    if (id) mediaService.resolveDisplay(id).catch(() => {})
    return release
  }, [id])
  return mediaUri(item, options)
}
