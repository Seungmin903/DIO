import { lassoHitIds } from './lassoGeometry.js'

const close = (a, b) => Math.abs(a - b) < 1e-6

// 윤곽은 문서가 아닌 선택 UI 상태다. 같은 선택의 공통 평행 이동만 따라간다.
export function resolveLassoOutline(outline, pageId, ids, objects) {
  if (!outline || outline.pageId !== pageId || !ids.length || ids.length !== outline.ids.length) return null
  const selected = new Set(ids)
  if (!outline.ids.every(id => selected.has(id))) return null
  const byId = new Map(objects.map(object => [object.id, object]))
  let dx, dy
  for (const original of outline.objects) {
    const current = byId.get(original.id)
    if (!current || current.hidden || current.w !== original.w || current.h !== original.h ||
        current.rotation !== original.rotation || current.flipX !== original.flipX || current.flipY !== original.flipY) return null
    const x = current.x - original.x, y = current.y - original.y
    if (dx == null) { dx = x; dy = y }
    if (!close(x, dx) || !close(y, dy)) return null
  }
  return outline.paths.map(path => ({ ...path, points: path.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }))
}

export function createLassoOutline(previous, pageId, baseIds, ids, objects, polygon, mode) {
  if (!ids.length || polygon.length < 3) return null
  const selected = new Set(ids)
  const members = objects.filter(object => selected.has(object.id) && !object.hidden)
  if (members.length !== ids.length) return null
  const prior = mode === 'replace' ? [] : resolveLassoOutline(previous, pageId, baseIds, objects) ?? []
  // 제외 경로는 선택 범위가 아니므로 그리지 않는다. 남은 선택 요소와 겹치지 않게 된 이전 경로도 버린다.
  const candidates = mode === 'subtract' ? prior : [...prior, { mode, points: polygon.map(p => ({ ...p })) }]
  const paths = candidates.filter(path => lassoHitIds(members, path.points).length > 0)
  if (!paths.length) return null
  return {
    pageId, ids: [...ids],
    objects: members.map(({ id, x, y, w, h, rotation, flipX, flipY }) => ({ id, x, y, w, h, rotation, flipX, flipY })),
    paths,
  }
}
