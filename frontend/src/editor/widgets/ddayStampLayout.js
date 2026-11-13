// 긴 한글 이름도 브라우저의 최소 글자 크기에 걸리지 않는 크기로 배치한 뒤 전체를 축소한다.
export const STAMP_RENDER_SIZE = 336

export function stampLayout(width, height, title) {
  const size = STAMP_RENDER_SIZE
  // normalizeWidget과 같은 정책으로, 직접 호출해도 문자열이 아닌 이름은 비워 둔다.
  const name = typeof title === 'string' ? title : ''
  return {
    size,
    scale: Math.min(width, height) / size,
    left: (width - size) / 2,
    top: (height - size) / 2,
    // 한글·넓은 영문도 한 줄 안에 들어오도록 글자당 1.1em을 확보한다.
    titleFontSize: Math.min(size * 0.1, size * 0.6 / (Math.max(name.length, 1) * 1.1)),
  }
}
