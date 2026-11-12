/** 보관소 참조가 없는 예전 이미지 주소가 GIF 인지 (data URI 또는 .gif 파일). SVG 이미지에 GIF 를 넘기지 않으려고 쓴다 */
export function isGifUri(uri) {
  if (typeof uri !== 'string') return false
  return /^data:image\/gif[;,]/i.test(uri) || /\.gif(?:[?#].*)?$/i.test(uri)
}
