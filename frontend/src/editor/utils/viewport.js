import { clamp } from './common.js'

export const PAGE_TURN_PAN_THRESHOLD = 72

// 페이지 하단이 보이는 상태에서 충분히 아래로 스크롤했을 때만 다음 페이지로 넘긴다.
// panY는 콘텐츠가 움직인 거리라 아래로 읽는 스크롤은 음수다.
export function shouldTurnToNextPage({ panY = 0, zoomed = false, cancelled = false }, view, stage, pageHeight, bottomPadding = 0) {
  if (cancelled || zoomed || !stage || !view || panY > -PAGE_TURN_PAN_THRESHOLD) return false
  const pageBottom = view.y + pageHeight * view.zoom
  const viewportBottom = stage.height - bottomPadding
  return pageBottom <= viewportBottom + 1
}

export function centeredOffset(stage, zoom, pageWidth, pageHeight, padding) {
  if (!stage) return { x: padding.side, y: padding.top }
  return {
    x: (stage.width - pageWidth * zoom) / 2,
    y: padding.top + (stage.height - padding.top - padding.bottom - pageHeight * zoom) / 2,
  }
}

export function clampOffset(next, zoom, stage, pageWidth, pageHeight) {
  if (!stage) return next
  const keep = 80
  return {
    x: clamp(next.x, keep - pageWidth * zoom, stage.width - keep),
    y: clamp(next.y, keep - pageHeight * zoom, stage.height - keep),
  }
}

// 렌더링 사이에 들어온 모든 이동량을 최신 상태에 누적한다.
export function panView(previous, dx, dy, fitZoom, stage, pageWidth, pageHeight, padding) {
  const zoom = previous.zoom ?? fitZoom * previous.scale
  const offset = previous.x == null
    ? centeredOffset(stage, zoom, pageWidth, pageHeight, padding)
    : previous
  return {
    scale: previous.scale,
    ...clampOffset({ x: offset.x + dx, y: offset.y + dy }, zoom, stage, pageWidth, pageHeight),
  }
}
