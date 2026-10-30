// Coordinates and thresholds are viewport pixels/dp, independent of document zoom.
export const READER_SWIPE_DISTANCE = 48
export const READER_TAP_DISTANCE = 10
export const READER_TAP_MS = 350
export const READER_ZOOM_SWIPE_MS = 250
export const READER_ZOOM_SWIPE_SPEED = 0.5 // viewport dp/ms

const horizontal = (dx, dy) => Math.abs(dx) >= Math.abs(dy) * 1.5
const quick = (dx, duration) => duration >= 0 && duration <= READER_ZOOM_SWIPE_MS && Math.abs(dx) / Math.max(1, duration) >= READER_ZOOM_SWIPE_SPEED

// Once a zoomed gesture becomes a drag, a fast finish must not turn the page.
export function readingDragLocked({ dx, dy, duration, scale, dragged = false }) {
  if (scale <= 1) return false
  if (dragged) return true
  if (Math.hypot(dx, dy) <= READER_TAP_DISTANCE) return false
  return duration > READER_ZOOM_SWIPE_MS ||
    (Math.abs(dy) >= 24 && !horizontal(dx, dy)) ||
    (Math.abs(dx) >= READER_SWIPE_DISTANCE && !quick(dx, duration))
}

export function readingGestureAction({ dx, dy, duration, scale, pinched, cancelled, dragged = false, x, width, maxDistance = Math.hypot(dx, dy) }) {
  if (cancelled || pinched) return null
  if (maxDistance <= READER_TAP_DISTANCE && duration <= READER_TAP_MS) {
    if (!(width > 0)) return null
    return x < width * 0.2 ? 'previous' : x > width * 0.8 ? 'next' : 'menu'
  }
  if (Math.abs(dx) >= READER_SWIPE_DISTANCE && horizontal(dx, dy) &&
    (scale <= 1 || (!dragged && quick(dx, duration)))) {
    return dx < 0 ? 'next' : 'previous'
  }
  return null
}

export function pageFromProgress(x, width, count) {
  if (count <= 1 || width <= 0) return 0
  return Math.round(Math.max(0, Math.min(1, x / width)) * (count - 1))
}
