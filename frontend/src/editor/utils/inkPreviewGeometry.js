// Display-only reduction for uncached ink. Original samples remain the restore source.
export function simplifyInkPreview(points, width, tolerance = 0.12) {
  if (points.length < 3) return points
  const keep = new Set([0, points.length - 1]), pending = [[0, points.length - 1]]
  while (pending.length) {
    const [first, last] = pending.pop()
    if (last - first < 2) continue
    const a = points[first], b = points[last], dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy
    let largest = 1, split = -1
    for (let i = first + 1; i < last; i++) {
      const p = points[i], t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0
      let error = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) / tolerance
      error = Math.max(error, Math.abs((p.pressure ?? 1) - ((a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * t)) * width / 2 / tolerance)
      for (const [key, delta] of [['force', 0.02], ['speed', 0.05]]) {
        const values = [a[key], b[key], p[key]]
        if (values.every(Number.isFinite)) error = Math.max(error, Math.abs(values[2] - (values[0] + (values[1] - values[0]) * t)) / delta)
        else if (values.some(Number.isFinite)) error = Infinity
      }
      if (error > largest) { largest = error; split = i }
    }
    // Keep short segments so transient distance-based ink does not flatten long tails.
    if (split < 0 && length2 > 36) split = (first + last) >> 1
    if (split >= 0) { keep.add(split); pending.push([first, split], [split, last]) }
  }
  return [...keep].sort((a, b) => a - b).map(index => points[index])
}
