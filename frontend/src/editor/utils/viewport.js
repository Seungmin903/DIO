import { clamp } from './common.js'

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
