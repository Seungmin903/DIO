import { isTastingId, tastingMarks } from './tastingGeometry.js'
import { createId } from '../utils/common.js'

// Each page/mark pair gets one stable UUID, so concurrent first fills target
// the same server element rather than creating competing overlays.
export function tastingElementId(pageId, markId, assetId) {
  const index = tastingMarks(assetId).findIndex(mark => mark.id === markId)
  if (index < 0) throw Error('테이스팅 노트 표시 ID를 만들 수 없어요.')
  // Shared/server pages use UUIDs and therefore deterministic IDs across devices.
  // Old local pages may have arbitrary IDs; they are personal-only, so assign a
  // UUID once and keep it on the created canvas object.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pageId ?? '')) return createId()
  const suffix = (Number.parseInt(pageId.slice(-8), 16) ^ (0x74610000 + index)) >>> 0
  return pageId.slice(0, -8) + suffix.toString(16).padStart(8, '0')
}

// Existing planner records remain readable; new pages keep their marks as canvas elements.
// An ID-conflict recovery can leave two elements with one tastingMark. Reading uses the
// first one (the same element updateTastingElements looks up) and fills update all of
// them, so the shown value and the next fill or erase stay in agreement.
export function tastingElementValue(page) {
  if (!isTastingId(page.backgroundAssetId)) return page.planner
  const fills = { ...(page.planner?.fills ?? {}) }, seen = new Set()
  for (const object of page.objects ?? []) {
    if (!object.tastingMark || seen.has(object.tastingMark)) continue
    seen.add(object.tastingMark)
    if (object.fill === 'none') delete fills[object.tastingMark]
    else fills[object.tastingMark] = object.fill
  }
  return { ...(page.planner ?? {}), fills }
}

export function updateTastingElements(page, planner) {
  const before = tastingElementValue(page).fills, after = planner?.fills ?? {}
  let objects = page.objects
  for (const mark of tastingMarks(page.backgroundAssetId)) {
    if ((before[mark.id] ?? null) === (after[mark.id] ?? null)) continue
    const existing = objects.find(o => o.tastingMark === mark.id)
    const fill = after[mark.id] ?? 'none'
    objects = existing
      ? objects.map(o => o.tastingMark === mark.id ? { ...o, fill } : o)
      : [...objects, { id: tastingElementId(page.id, mark.id, page.backgroundAssetId), type: 'shape', shape: 'rect', x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1, hidden: true, locked: true, tastingMark: mark.id, fill }]
  }
  return objects
}
