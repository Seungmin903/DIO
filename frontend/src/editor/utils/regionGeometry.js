export const REGION_MIN = 32
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
export function validRegion(r, page) {
  return !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.x >= 0 && r.y >= 0 && r.width >= REGION_MIN && r.height >= REGION_MIN && r.x + r.width <= page.width + 1e-6 && r.y + r.height <= page.height + 1e-6
}
export function moveRegion(r, dx, dy, page) {
  return { ...r, x: clamp(r.x + dx, 0, page.width - r.width), y: clamp(r.y + dy, 0, page.height - r.height) }
}
export function regionFromDrag(start, end, page) {
  const x = clamp(start.x, 0, page.width), y = clamp(start.y, 0, page.height)
  const ex = clamp(end.x, 0, page.width), ey = clamp(end.y, 0, page.height)
  return { x: Math.min(x, ex), y: Math.min(y, ey), width: Math.abs(ex - x), height: Math.abs(ey - y) }
}
export function resizeRegion(r, corner, dx, dy, page) {
  const left = corner.includes('w'), top = corner.includes('n')
  const anchor = { x: left ? r.x + r.width : r.x, y: top ? r.y + r.height : r.y }
  const maxW = left ? anchor.x : page.width - anchor.x, maxH = top ? anchor.y : page.height - anchor.y
  const width = clamp(r.width + (left ? -dx : dx), Math.min(REGION_MIN, maxW), maxW)
  const height = clamp(r.height + (top ? -dy : dy), Math.min(REGION_MIN, maxH), maxH)
  return { x: left ? anchor.x - width : anchor.x, y: top ? anchor.y - height : anchor.y, width, height }
}

/** 새 드래그가 취소되거나 유효하지 않으면 기존 유효 영역을 보존한다. */
export function finishRegionDrag(previous, draft, { cancelled, moved, page, ratio }) {
  return cancelled || !moved || !validRegion(draft, page, ratio) ? previous : draft
}
