const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const CROP_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export function handlePoint(rect, handle) {
  return { x: rect.x + rect.width * (handle.includes('w') ? 0 : handle.includes('e') ? 1 : 0.5),
    y: rect.y + rect.height * (handle.includes('n') ? 0 : handle.includes('s') ? 1 : 0.5) }
}
export function cropAction(point, rect, width, height, defined) {
  if (!defined) return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 ? 'create' : 'ignore'
  const nearest = CROP_HANDLES.map(handle => ({ handle, p: handlePoint(rect, handle) }))
    .map(({ handle, p }) => ({ handle, distance: Math.hypot((point.x - p.x) * width, (point.y - p.y) * height) }))
    .sort((a, b) => a.distance - b.distance)[0]
  if (nearest.distance <= 22) return nearest.handle
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height ? 'move' : 'ignore'
}
export function adjustCrop(rect, start, point, action, image) {
  const minW = Math.min(1, Math.max(0.005, 1 / image.width)), minH = Math.min(1, Math.max(0.005, 1 / image.height))
  const px = clamp(point.x, 0, 1), py = clamp(point.y, 0, 1)
  if (action === 'create') return { x: Math.min(start.x, px), y: Math.min(start.y, py), width: Math.abs(start.x - px), height: Math.abs(start.y - py) }
  if (point.x === start.x && point.y === start.y) return rect
  if (action === 'move') return { ...rect, x: clamp(rect.x + point.x - start.x, 0, 1 - rect.width), y: clamp(rect.y + point.y - start.y, 0, 1 - rect.height) }
  if (!CROP_HANDLES.includes(action)) return rect
  let left = rect.x, top = rect.y, right = rect.x + rect.width, bottom = rect.y + rect.height
  const deltaX = point.x - start.x, deltaY = point.y - start.y
  if (action.includes('w')) left = clamp(left + deltaX, 0, right - minW)
  if (action.includes('e')) right = clamp(right + deltaX, left + minW, 1)
  if (action.includes('n')) top = clamp(top + deltaY, 0, bottom - minH)
  if (action.includes('s')) bottom = clamp(bottom + deltaY, top + minH, 1)
  return { x: left, y: top, width: right - left, height: bottom - top }
}
