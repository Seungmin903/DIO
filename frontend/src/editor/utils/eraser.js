import { rotateVector } from './common.js'
import { createStroke, penContour, strokeOutline } from './strokes.js'

// 실행 목업의 기본 지름 24. 사용자 크기 설정은 페이지 좌표이며 화면에서는 zoom을 곱한다.
export const ERASER_RADIUS = 12
export const ERASER_MIN_SIZE = 8
export const ERASER_MAX_SIZE = 80
export const normalizeEraserSize = (value) => Number.isFinite(value)
  ? Math.max(ERASER_MIN_SIZE, Math.min(ERASER_MAX_SIZE, Math.round(value))) : ERASER_RADIUS * 2
// 획 지우기: 닿은 획을 통째로 지운다. 영역 지우기: 지우개가 지나간 부분만 지우고 남은 부분은 따로 남긴다.
export const ERASER_MODES = [{ id: 'stroke', label: '획 지우기' }, { id: 'area', label: '영역 지우기' }]

const distanceToSegment = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
const cross = (ax, ay, bx, by) => ax * by - ay * bx
function segmentDistance(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y
  const det = cross(rx, ry, sx, sy)
  if (Math.abs(det) > 1e-9) {
    const t = cross(c.x - a.x, c.y - a.y, sx, sy) / det
    const u = cross(c.x - a.x, c.y - a.y, rx, ry) / det
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0
  }
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b))
}
function inside(point, polygon) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}
const boundsOf = (points) => points.reduce((bounds, p) => ({
  left: Math.min(bounds.left, p.x), right: Math.max(bounds.right, p.x),
  top: Math.min(bounds.top, p.y), bottom: Math.max(bounds.bottom, p.y),
}), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity })
const overlaps = (a, b) => a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top

// 렌더러가 생성하는 M/L/Q/Z 펜 윤곽만 샘플링한다. 외부 SVG는 읽지 않는다.
function outlinePoints(path) {
  const points = []
  for (const command of path.match(/[MLQZ][^MLQZ]*/g) ?? []) {
    const numbers = command.slice(1).trim().split(/\s+/).map(Number)
    if (command[0] === 'M' || command[0] === 'L') points.push({ x: numbers[0], y: numbers[1] })
    if (command[0] === 'Q') {
      const a = points.at(-1), [cx, cy, x, y] = numbers
      for (let step = 1; step <= 6; step++) {
        const t = step / 6, u = 1 - t
        points.push({ x: u * u * a.x + 2 * u * t * cx + t * t * x, y: u * u * a.y + 2 * u * t * cy + t * t * y })
      }
    }
  }
  return points
}
function strokePolygons(object) {
  const { points, penKind: kind, strokeWidth: width } = object
  if (points.length > 1 && (kind === 'brush' || kind === 'fountain')) {
    return [outlinePoints(object.renderVersion === 2 ? penContour(points, width, kind) : strokeOutline(points, width))]
  }
  const half = width / 2 * (kind === 'highlighter' ? 1 : points.length === 1 ? points[0].pressure ?? 1 : kind === 'pencil' ? 0.85 : 1)
  const square = kind === 'highlighter' && object.lineCap === 'square'
  const samples = points.length === 1 && kind === 'highlighter' ? [points[0], { x: points[0].x + 0.01, y: points[0].y }] : points
  const shapes = []
  samples.forEach((p, i) => {
    if (!square || (i > 0 && i < samples.length - 1)) {
      shapes.push(Array.from({ length: 24 }, (_, n) => ({ x: p.x + half * Math.cos(n * Math.PI / 12), y: p.y + half * Math.sin(n * Math.PI / 12) })))
    }
    if (!i) return
    const a = samples[i - 1], length = Math.hypot(p.x - a.x, p.y - a.y)
    if (!length) return
    const tx = (p.x - a.x) / length, ty = (p.y - a.y) / length
    const before = square && i === 1 ? half : 0, after = square && i === samples.length - 1 ? half : 0
    shapes.push([
      { x: a.x - tx * before - ty * half, y: a.y - ty * before + tx * half },
      { x: p.x + tx * after - ty * half, y: p.y + ty * after + tx * half },
      { x: p.x + tx * after + ty * half, y: p.y + ty * after - tx * half },
      { x: a.x - tx * before + ty * half, y: a.y - ty * before - tx * half },
    ])
  })
  return shapes
}
function eraserTarget(object) {
  if (object.type !== 'stroke' || object.locked || object.hidden || !object.points?.length) return null
  if (![object.x, object.y, object.w, object.h, object.baseWidth, object.baseHeight, object.strokeWidth].every(Number.isFinite)
    || object.w <= 0 || object.h <= 0 || object.baseWidth <= 0 || object.baseHeight <= 0 || object.strokeWidth <= 0) return null
  if (object.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
  const project = (p) => {
    const local = rotateVector(
      (p.x / object.baseWidth - 0.5) * object.w * (object.flipX ? -1 : 1),
      (p.y / object.baseHeight - 0.5) * object.h * (object.flipY ? -1 : 1), object.rotation ?? 0,
    )
    return { x: object.x + object.w / 2 + local.x, y: object.y + object.h / 2 + local.y }
  }
  const polygons = strokePolygons(object).filter((shape) => shape.length >= 3).map((shape) => {
    const points = shape.map(project)
    return { points, bounds: boundsOf(points) }
  })
  return { id: object.id, object, project, polygons, bounds: boundsOf(polygons.flatMap((shape) => shape.points)) }
}

// 점 사이가 지우개보다 넓으면 그 사이를 그대로 건너뛰므로, 지우개 반지름의 절반 간격 이하로 점을 채운다.
function densify(points, step) {
  const result = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)
    for (let n = 1; n < count; n++) {
      const t = n / count
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ...(a.pressure != null && b.pressure != null && { pressure: a.pressure + (b.pressure - a.pressure) * t }) })
    }
    result.push(b)
  }
  return result
}

// 남은 조각을 원래 획과 같은 모양의 획으로 만든다. 돌리거나 늘이지 않은 획은 조각 크기에 맞게 경계를 다시 잡는다.
function fragmentStroke(source, points, id) {
  const plain = !source.rotation && !source.flipX && !source.flipY && source.w === source.baseWidth && source.h === source.baseHeight
  if (!plain) return { ...source, id, points }
  const stroke = createStroke(points.map((p) => ({ ...p, x: p.x + source.x, y: p.y + source.y })), { id, color: source.color, width: source.strokeWidth, kind: source.penKind, lineCap: source.lineCap })
  return { ...source, ...stroke, renderVersion: source.renderVersion, name: source.name }
}

// 문서는 바꾸지 않고 후보만 누적하며, 확정 시 기존 단일 삭제 액션을 반환한다.
// mode 'area' 는 영역 지우기: 닿은 부분만 지우고, 확정 시 원래 획을 남은 조각들로 바꾸는 replaceObjects 한 번을 반환한다.
export function createEraserSession(objects, radius = ERASER_RADIUS, mode = 'stroke') {
  if (mode === 'area') return createAreaEraserSession(objects, radius)
  const targets = objects.map(eraserTarget).filter(Boolean), removed = new Set()
  let finished = false
  return {
    move(from, to = from) {
      if (finished || ![from.x, from.y, to.x, to.y, radius].every(Number.isFinite) || radius < 0) return [...removed]
      const sweep = { left: Math.min(from.x, to.x) - radius, right: Math.max(from.x, to.x) + radius, top: Math.min(from.y, to.y) - radius, bottom: Math.max(from.y, to.y) + radius }
      for (const target of targets) {
        if (removed.has(target.id) || !overlaps(sweep, target.bounds)) continue
        if (target.polygons.some(({ points, bounds }) => overlaps(sweep, bounds) && (inside(from, points) || inside(to, points)
          || points.some((p, i) => segmentDistance(from, to, p, points[(i + 1) % points.length]) <= radius)))) removed.add(target.id)
      }
      return [...removed]
    },
    finish(cancelled = false) {
      if (finished) return null
      finished = true
      return cancelled || !removed.size ? null : { type: 'removeObjects', ids: [...removed] }
    },
  }
}

function createAreaEraserSession(objects, radius) {
  const targets = objects.map(eraserTarget).filter(Boolean)
  const pieces = new Map() // 원래 획 id → 남은 조각들 [{ points(요소 좌표), page(페이지 좌표) }]
  let finished = false, serial = 0
  const piecesOf = (target) => {
    if (!pieces.has(target.id)) {
      const { object, project } = target
      const scale = Math.max(object.w / object.baseWidth, object.h / object.baseHeight) || 1
      const points = object.points.length > 1 ? densify(object.points, Math.max(0.5, radius / 2 / scale)) : object.points
      pieces.set(target.id, [{ points, page: points.map(project), reach: radius + object.strokeWidth * scale / 2 }])
    }
    return pieces.get(target.id)
  }
  return {
    move(from, to = from) {
      if (finished || ![from.x, from.y, to.x, to.y, radius].every(Number.isFinite) || radius < 0) return [...pieces.keys()]
      const sweep = { left: Math.min(from.x, to.x) - radius, right: Math.max(from.x, to.x) + radius, top: Math.min(from.y, to.y) - radius, bottom: Math.max(from.y, to.y) + radius }
      for (const target of targets) {
        if (!overlaps(sweep, target.bounds)) continue
        const before = pieces.get(target.id) ?? null
        const current = before ?? piecesOf(target)
        let changed = false
        const next = current.flatMap((piece) => {
          const hit = piece.page.map((p) => distanceToSegment(p, from, to) <= piece.reach)
          if (!hit.some(Boolean)) return [piece]
          changed = true
          // 지워지지 않은 점끼리 이어진 구간만 남긴다. 점 하나만 남은 구간은 버린다.
          const runs = []
          let start = -1
          hit.concat(true).forEach((erased, i) => {
            if (!erased && start < 0) start = i
            if (erased && start >= 0) { if (i - start > 1) runs.push([start, i]); start = -1 }
          })
          return runs.map(([a, b]) => ({ points: piece.points.slice(a, b), page: piece.page.slice(a, b), reach: piece.reach }))
        })
        if (changed) pieces.set(target.id, next)
        else if (!before) pieces.delete(target.id)
      }
      return [...pieces.keys()]
    },
    /** 미리보기·확정용: 원래 획 id → 남은 조각 획들 */
    replacements() {
      const result = {}
      for (const [id, list] of pieces) {
        const source = targets.find((t) => t.id === id).object
        result[id] = list.map((piece, i) => fragmentStroke(source, piece.points, `${id}-${i}-${serial}`))
      }
      return result
    },
    finish(cancelled = false) {
      if (finished) return null
      finished = true
      if (cancelled || !pieces.size) return null
      serial = Date.now().toString(36)
      return { type: 'replaceObjects', replacements: this.replacements() }
    },
  }
}
