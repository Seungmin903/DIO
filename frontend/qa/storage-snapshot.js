import { sameQASnapshot } from './snapshot-equality.js'

// Only the autosave timestamp is excluded. Geometry, sensors, material and page
// metadata are compared in full; summaries are never used as equality checks.
export function sameStoredDocument(a, b) {
  if (!a || !b) return false
  const { updatedAt: ignoredA, ...left } = a
  const { updatedAt: ignoredB, ...right } = b
  return sameQASnapshot(left, right)
}

export function storageSummary(doc) {
  const kinds = {}
  for (const object of doc?.pages?.flatMap(page => page.objects) ?? []) {
    if (object.type !== 'stroke') continue
    const kind = object.penKind ?? 'ball'
    const item = kinds[kind] ??= { strokes: 0, points: 0, sensedPoints: 0, forceMin: null, forceMax: null, versions: {}, seededStrokes: 0 }
    item.strokes++
    item.versions[object.renderVersion ?? 1] = (item.versions[object.renderVersion ?? 1] ?? 0) + 1
    if (Number.isFinite(object.materialSeed)) item.seededStrokes++
    for (const point of object.points ?? []) {
      item.points++
      if (Number.isFinite(point.force)) {
        item.sensedPoints++
        item.forceMin = Math.min(item.forceMin ?? point.force, point.force)
        item.forceMax = Math.max(item.forceMax ?? point.force, point.force)
      }
    }
  }
  return { pages: doc?.pages?.length ?? 0, objects: doc?.pages?.reduce((n, page) => n + page.objects.length, 0) ?? 0, kinds }
}
