import { shortKey } from './svgStillCache.js'

/** 보관소 참조가 없는 예전 이미지 주소가 GIF 인지 (data URI 또는 .gif 파일). SVG 이미지에 GIF 를 넘기지 않으려고 쓴다 */
export function isGifUri(uri) {
  if (typeof uri !== 'string') return false
  return /^data:image\/gif[;,]/i.test(uri) || /\.gif(?:[?#].*)?$/i.test(uri)
}

/**
 * SVG 이미지로 그릴 주소를 첫 장면 PNG 로 바꿔야 하면 보관소 키, 아니면 null.
 * 기기에서 GIF 일 때만 바꾼다(웹 브라우저는 SVG 안 GIF 도 잘 그린다). enabled: 실제로 SVG 이미지로 그릴 때만 true
 * id·extension: 보관소 미디어 ID 와 확장자(확장자 정보가 없으면 주소 …/id.gif 로 본다)
 */
export function svgStillKey({ platform, enabled, uri, id, extension }) {
  if (!enabled || platform === 'web' || !uri) return null
  if (id) return extension === 'gif' || (!extension && isGifUri(uri)) ? `media:${id}` : null
  // 예전 주소는 큰 data URI 일 수 있어 줄인 키를 쓴다
  return isGifUri(uri) ? `legacy:${shortKey(uri)}` : null
}
