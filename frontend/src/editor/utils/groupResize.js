import { unionBounds } from './common.js'

// The server stores coordinates as numeric(12,3). Stay below its nine-digit limit.
const MAX_COORD = 999999999
const MIN_SIZE = 0.001
const axisLimit = (anchor, value) => {
  const delta = value - anchor
  return delta > 0 ? (MAX_COORD - anchor) / delta : delta < 0 ? (-MAX_COORD - anchor) / delta : Infinity
}

// Scale uniformly around the opposite corner, so rotated items keep their shape.
export function groupResizeStart(objects, sx, sy) {
  if (objects.length < 2 || objects.some(o => o.locked || ![o.x, o.y, o.w, o.h, o.rotation ?? 0].every(Number.isFinite) || o.w <= 0 || o.h <= 0 || (o.type === 'tape' && [o.segmentW, o.unitH].some(v => v != null && (!Number.isFinite(v) || v <= 0))))) return null
  const bounds = groupResizeBounds(objects)
  const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return null
  const anchor = { x: sx > 0 ? bounds.left : bounds.right, y: sy > 0 ? bounds.top : bounds.bottom }
  const maxScale = Math.max(1, Math.min(...objects.flatMap(o => [MAX_COORD / o.w, MAX_COORD / o.h, axisLimit(anchor.x, o.x), axisLimit(anchor.y, o.y)])))
  return { objects, sx, sy, width, height, anchor, maxScale,
    minScale: Math.min(1, Math.max(...objects.map(o => Math.max(MIN_SIZE / Math.min(o.w, o.h), Math.min(0.5, 20 / Math.min(o.w, o.h)))))),
  }
}

export const groupResizeBounds = objects => unionBounds(objects.map(o => o.rotation == null ? { ...o, rotation:0 } : o))

export function groupResizePatches(start, dx, dy) {
  if (!start || !Number.isFinite(dx) || !Number.isFinite(dy)) return null
  const { sx, sy, width, height, anchor, objects, minScale, maxScale } = start
  const scale = Math.min(maxScale, Math.max(minScale, 1 + (sx * dx * width + sy * dy * height) / (width * width + height * height)))
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 1e-8) return null
  return Object.fromEntries(objects.map(o => {
    const w = o.w * scale, h = o.h * scale
    const cx = anchor.x + (o.x + o.w / 2 - anchor.x) * scale
    const cy = anchor.y + (o.y + o.h / 2 - anchor.y) * scale
    const patch = { x: cx - w / 2, y: cy - h / 2, w, h }
    if (o.rotation == null) patch.rotation = 0
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
