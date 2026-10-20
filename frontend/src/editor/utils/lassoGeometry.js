import { centerOf, rotateVector } from './common.js'

const EPSILON = 1e-7
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
const edgeAt = (points, index) => points[(index + 1) % points.length]

function onSegment(point, a, b) {
  return Math.abs(cross(a, b, point)) <= EPSILON &&
    point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON
}

function edgesIntersect(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d)
  const cdA = cross(c, d, a), cdB = cross(c, d, b)
  return (abC * abD < 0 && cdA * cdB < 0) ||
    onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d)
}

// SVG fillRule="evenodd"와 동일한 내부 판정. 경계 접촉도 포함한다.
function containsPoint(points, point) {
  let inside = false
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = edgeAt(points, i)
    if (onSegment(point, a, b)) return true
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside
  }
  return inside
}

export function lassoPolygon(shape, start, points) {
  if (shape === 'freeform') return points
  const end = points[points.length - 1] ?? start
  const left = Math.min(start.x, end.x), right = Math.max(start.x, end.x)
  const top = Math.min(start.y, end.y), bottom = Math.max(start.y, end.y)
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]
}

// 부호 있는 면적만 쓰면 나비 모양의 유효한 자기 교차 경로도 0이 된다.
// 수평 구간별 짝홀 채움 폭을 확인해 직선·되짚은 경로는 무시한다.
export function hasLassoArea(points) {
  if (points.length < 3) return false
  const a = points[0], b = points.find(p => Math.hypot(p.x - a.x, p.y - a.y) > EPSILON)
  if (!b || !points.some(p => Math.abs(cross(a, b, p)) > EPSILON)) return false
  const levels = [...new Set(points.map(p => p.y))].sort((x, y) => x - y)
  const hasWidth = ys => {
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] - ys[i - 1] <= EPSILON) continue
      const y = (ys[i] + ys[i - 1]) / 2
      const xs = []
      for (let j = 0; j < points.length; j++) {
        const p = points[j], q = edgeAt(points, j)
        if ((p.y > y) !== (q.y > y)) xs.push(p.x + (y - p.y) * (q.x - p.x) / (q.y - p.y))
      }
      xs.sort((x, next) => x - next)
      for (let j = 1; j < xs.length; j += 2) if (xs[j] - xs[j - 1] > EPSILON) return true
    }
    return false
  }
  if (hasWidth(levels)) return true
  // 교차점이 수평 구간의 중간에 놓인 경우 구간을 나눠 다시 확인한다.
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = edgeAt(points, i)
    for (let j = i + 1; j < points.length; j++) {
      const r = points[j], s = edgeAt(points, j)
      const denominator = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x)
      if (Math.abs(denominator) <= EPSILON) continue
      const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / denominator
      const u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / denominator
      if (t > 0 && t < 1 && u > 0 && u < 1) levels.push(p.y + t * (q.y - p.y))
    }
  }
  return hasWidth([...new Set(levels)].sort((x, y) => x - y))
}

export function objectLassoCorners(object) {
  const center = centerOf(object)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
    const rotated = rotateVector(x * object.w / 2, y * object.h / 2, object.rotation ?? 0)
    return { x: center.x + rotated.x, y: center.y + rotated.y }
  })
}

function polygonsIntersect(a, b) {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (edgesIntersect(a[i], edgeAt(a, i), b[j], edgeAt(b, j))) return true
    }
  }
  return a.some(p => containsPoint(b, p)) || b.some(p => containsPoint(a, p))
}

export function lassoHitIds(objects, polygon) {
  const visible = objects.filter(object => !object.hidden)
  const hits = visible.filter(object => polygonsIntersect(polygon, objectLassoCorners(object)))
  const ids = new Set(hits.map(object => object.id))
  const groups = new Set(hits.filter(object => object.groupId).map(object => object.groupId))
  return visible.filter(object => ids.has(object.id) || (object.groupId && groups.has(object.groupId))).map(object => object.id)
}

export function applyLassoSelection(objects, selectedIds, hitIds, mode) {
  const result = new Set(mode === 'replace' ? [] : selectedIds)
  for (const id of hitIds) {
    if (mode === 'subtract') result.delete(id)
    else result.add(id)
  }
  return objects.filter(object => !object.hidden && result.has(object.id)).map(object => object.id)
}
