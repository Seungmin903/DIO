// 스티커 이미지 소스. 외부 출처 기본 스티커는 없앴고, 사용자가 넣은 스티커만 이미지로 그린다.
// 예전 문서에 남은 외부 출처 스티커(asset id)는 그리지도 내보내지도 않는다. 앱 기본 도트 스티커(builtin)는 SVG 로 따로 그린다(BuiltinStickerArt).

import { mediaRegistry, mediaUri } from './services/mediaStore'
import { mediaId } from './utils/mediaReferences.js'

/** 없앤 기본 스티커인지 (예전 문서에 asset id 로만 남아 있다) */
export const isRetiredSticker = (object) => object?.type === 'sticker' && Boolean(object.asset) && !object.widget

/** 움직이는 GIF 인지: 가져온 파일이 GIF 일 때 */
export function isAnimatedMedia(item) {
  if (item?.asset) return false
  const id = mediaId(item)
  return Boolean(id && mediaRegistry.get(id)?.media?.extension === 'gif')
}

/**
 * 스티커 이미지 소스: 사용자 스티커는 src(data URI 또는 보관소 참조).
 * still 이면 GIF 대신 첫 장면(poster)을 쓴다. (썸네일·목록용)
 */
export function stickerSource(item, still = false, resolvedUri) {
  if (item.asset) return null
  const uri = resolvedUri === undefined ? mediaUri(item, { still }) : resolvedUri
  return uri ? { uri } : null
}
