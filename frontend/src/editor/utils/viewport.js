import { clamp } from './common.js'

export const PAGE_TURN_PAN_THRESHOLD = 72
export const PAGE_VISIBLE_EDGE = 80

// 페이지를 위로 끝까지 밀어 아래쪽 끝 80px 정도만 남았을 때 다음 페이지로 넘긴다.
// panY는 콘텐츠가 움직인 거리라 다음 페이지 방향은 음수다.
export function shouldTurnToNextPage({ panY = 0, zoomed = false, cancelled = false }, view, stage, pageHeight, bottomPadding = 0) {
  if (cancelled || zoomed || !stage || !view || panY > -PAGE_TURN_PAN_THRESHOLD) return false
  const pageBottom = view.y + pageHeight * view.zoom
  return pageBottom <= Math.max(PAGE_VISIBLE_EDGE, bottomPadding) + 1
}

// 페이지를 아래로 끝까지 밀어 위쪽 끝 80px 정도만 남았을 때 이전 페이지로 돌아간다.
export function shouldTurnToPreviousPage({ panY = 0, zoomed = false, cancelled = false }, view, stage) {
  if (cancelled || zoomed || !stage || !view || panY < PAGE_TURN_PAN_THRESHOLD) return false
  return view.y >= stage.height - PAGE_VISIBLE_EDGE - 1
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
  const keep = PAGE_VISIBLE_EDGE
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
