import { createId } from '../utils/common.js'
import { packingLayout } from './packingLayout.js'

export function packingColorAction(region, color, objects) {
  if (!['case-0', 'case-1', 'interior-0', 'interior-1', 'mesh'].includes(region) || typeof color !== 'string') return null
  const existing = objects.find(o => o.packingColorRegion === region)
  if (existing && existing.fill?.toLowerCase() === color.toLowerCase()) return { type: 'removeObjects', ids: [existing.id] }
  if (existing) return { type: 'updateObject', id: existing.id, record: true, patch: { fill: color } }
  return { type: 'addObjects', select: false, objects: [{ id: createId(), type: 'shape', shape: 'rect', name: '캐리어 색상', x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1, locked: true, fill: color, packingColorRegion: region }] }
}

export function packingSlotPatch(assetId, object, slot) {
  const layout = packingLayout(assetId)
  if (!layout || !object || (slot !== null && slot !== 0 && slot !== 1)) return null
  // Explicit removal must survive updateObjects' position-based slot recalculation.
  // Keep the object detached until it is dragged outside the carrier case.
  if (slot === null) return { packingSlot: null, packingSlotDetached: true }
  const box = layout.interiors[slot]
  return { packingSlot: slot, x: layout.origin.x + box.x * (layout.scaleX ?? 1) + (box.width * (layout.scaleX ?? 1) - object.w) / 2, y: layout.origin.y + box.y * (layout.scaleY ?? 1) + (box.height * (layout.scaleY ?? 1) - object.h) / 2 }
}


// 기존 캐리어 페이지도 별도 바 없이 같은 방식으로 편집한다.
const autoPacking = id => Boolean(packingLayout(id))
const insideRounded = (box, point) => {
  if (point.x < box.x || point.y < box.y || point.x > box.x + box.width || point.y > box.y + box.height) return false
  const r = Math.min(box.rx ?? 0, box.width / 2, box.height / 2)
  const x = Math.max(box.x + r, Math.min(point.x, box.x + box.width - r))
  const y = Math.max(box.y + r, Math.min(point.y, box.y + box.height - r))
  return (point.x - x) ** 2 + (point.y - y) ** 2 <= r ** 2
}
const localPoint = (layout, point) => ({ x: (point.x - layout.origin.x) / (layout.scaleX ?? 1), y: (point.y - layout.origin.y) / (layout.scaleY ?? 1) })

export function packingDropPatch(assetId, object) {
  if (!autoPacking(assetId) || !object || !['photo', 'sticker'].includes(object.type) || object.widget || object.locked) return null
  const layout = packingLayout(assetId)
  const center = localPoint(layout, { x: object.x + object.w / 2, y: object.y + object.h / 2 })
  const index = layout.interiors.findIndex(box => insideRounded(box, center))
  if (object.packingSlotDetached) {
    const insideCase = layout.cases.some(box => insideRounded(box, center))
    return insideCase ? null : { packingSlot: null, packingSlotDetached: false }
  }
  const next = index < 0 ? null : index
  return (object.packingSlot ?? null) === next ? null : { packingSlot: next }
}

export function packingTapColor(assetId, points, objects, color, zoom = 1) {
  if (!autoPacking(assetId) || !points?.length || !/^#[0-9a-f]{6}$/i.test(color ?? '')) return null
  const first = points[0]
  if (!Number.isFinite(first.x) || !Number.isFinite(first.y) || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.hypot(p.x - first.x, p.y - first.y) * zoom > 5)) return null
  const layout = packingLayout(assetId), point = localPoint(layout, first)
  const index = layout.cases.findIndex(box => insideRounded(box, point))
  if (index < 0) return null
  const region = `${insideRounded(layout.interiors[index], point) ? 'interior' : 'case'}-${index}`
  return packingColorAction(region, color, objects)
}
