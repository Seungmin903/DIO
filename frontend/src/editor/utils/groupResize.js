import { unionBounds } from './common.js'

// Scale uniformly around the opposite corner, so rotated items keep their shape.
export function groupResizeStart(objects, sx, sy) {
  if (objects.length < 2 || objects.some(o => o.locked || ![o.x, o.y, o.w, o.h, o.rotation].every(Number.isFinite) || o.w <= 0 || o.h <= 0)) return null
  const bounds = unionBounds(objects)
  const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top
  if (!(width > 0 && height > 0)) return null
  return { objects, sx, sy, width, height,
    anchor: { x: sx > 0 ? bounds.left : bounds.right, y: sy > 0 ? bounds.top : bounds.bottom },
    minScale: Math.max(...objects.map(o => Math.min(0.5, 20 / Math.min(o.w, o.h)))),
  }
}

export function groupResizePatches(start, dx, dy) {
  if (!start || !Number.isFinite(dx) || !Number.isFinite(dy)) return null
  const { sx, sy, width, height, anchor, objects, minScale } = start
  const scale = Math.max(minScale, 1 + (sx * dx * width + sy * dy * height) / (width * width + height * height))
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 1e-8) return null
  return Object.fromEntries(objects.map(o => {
    const w = o.w * scale, h = o.h * scale
    const cx = anchor.x + (o.x + o.w / 2 - anchor.x) * scale
    const cy = anchor.y + (o.y + o.h / 2 - anchor.y) * scale
    const patch = { x: cx - w / 2, y: cy - h / 2, w, h }
    // Old text without a base width needs a stable coordinate system for font scaling.
    if (o.type === 'text' && !o.baseWidth) patch.baseWidth = o.w
    // Photo tape pieces retain their original proportions while the strip scales.
    if (o.type === 'tape') {
      if (o.segmentW != null) patch.segmentW = o.segmentW * scale
      if (o.unitH != null) patch.unitH = o.unitH * scale
    }
    return [o.id, patch]
  }))
}
