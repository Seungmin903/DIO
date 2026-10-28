// Causal adaptive filter: stationary jitter is softened, fast motion and corners
// keep their position. No future/predicted point enters the saved document.
export function penEventTime(event, fallback = Date.now()) {
  return Number.isFinite(event?.timeStamp) ? event.timeStamp
    : Number.isFinite(event?.timestamp) ? event.timestamp : fallback
}

export function createPenMotion(first) {
  let raw = first, filtered = first, before = null
  return {
    sample(point, elapsed = 16, release = false) {
      const distance = Math.hypot(point.x - raw.x, point.y - raw.y)
      const speed = distance / Math.max(1, elapsed)
      let corner = false
      if (before) {
        const ax = raw.x - before.x, ay = raw.y - before.y
        const bx = point.x - raw.x, by = point.y - raw.y
        const product = Math.hypot(ax, ay) * Math.hypot(bx, by)
        corner = product > 0.25 && (ax * bx + ay * by) / product < 0.55
      }
      // A bounded (<1 page unit) correction avoids dragging the line behind the tip.
      const weight = release || corner ? 1 : 1 - Math.exp(-Math.max(1, elapsed) / (3 / (1 + speed * 3)))
      let x = filtered.x + (point.x - filtered.x) * weight
      let y = filtered.y + (point.y - filtered.y) * weight
      const lag = Math.hypot(point.x - x, point.y - y)
      if (lag > 0.8) { x = point.x + (x - point.x) * 0.8 / lag; y = point.y + (y - point.y) * 0.8 / lag }
      before = raw; raw = point
      filtered = { ...point, x, y }
      return filtered
    },
  }
}
