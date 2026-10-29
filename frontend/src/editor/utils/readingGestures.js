// Coordinates and thresholds are viewport pixels/dp, independent of document zoom.
export const READER_SWIPE_DISTANCE = 48
export const READER_TAP_DISTANCE = 10
export const READER_TAP_MS = 350

export function readingGestureAction({ dx, dy, duration, scale, pinched, cancelled, x, width, maxDistance = Math.hypot(dx, dy) }) {
  if (cancelled || pinched) return null
  if (maxDistance <= READER_TAP_DISTANCE && duration <= READER_TAP_MS) {
    if (!(width > 0)) return null
    return x < width * 0.2 ? 'previous' : x > width * 0.8 ? 'next' : 'menu'
  }
  if (scale <= 1 && Math.abs(dx) >= READER_SWIPE_DISTANCE && Math.abs(dx) >= Math.abs(dy) * 1.5) {
    return dx < 0 ? 'next' : 'previous'
  }
  return null
}

export function pageFromProgress(x, width, count) {
  if (count <= 1 || width <= 0) return 0
  return Math.round(Math.max(0, Math.min(1, x / width)) * (count - 1))
}
