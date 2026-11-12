import { createId, rotateVector } from './common.js'
import { isDashedKind, dashedObjectContour, dashedObjectSamples } from './dashedStroke.js'
import { createStroke, penContour, strokeOutline, samplePenCurve, glassOrigin, GLASS_BLEED } from './strokes.js'
import { isNibKind, nibContour, nibCurve, withDistances, withTaper } from './nibStroke.js'
import { createBoxIndex, queryBoxIndex } from './boxIndex.js'

// 실행 목업의 기본 지름 24. 사용자 크기 설정은 페이지 좌표이며 화면에서는 zoom을 곱한다.
export const ERASER_RADIUS = 12
export const ERASER_MIN_SIZE = 8
export const ERASER_MAX_SIZE = 80
export const normalizeEraserSize = (value) => Number.isFinite(value)
  ? Math.max(ERASER_MIN_SIZE, Math.min(ERASER_MAX_SIZE, Math.round(value))) : ERASER_RADIUS * 2
// 획 지우기: 닿은 획을 통째로 지운다. 영역 지우기: 지우개가 지나간 부분만 지우고 남은 부분은 따로 남긴다.
export const ERASER_MODES = [{ id: 'stroke', label: '획 전체' }, { id: 'area', label: '닿은 부분' }]
export const ERASER_TARGETS = [{ id: 'all', label: '전체' }, { id: 'pen', label: '펜' }, { id: 'highlighter', label: '형광펜' }]
export const matchesEraserTarget = (object, target = 'all') => target === 'highlighter'
  ? object.penKind === 'highlighter' : target === 'pen' ? object.penKind !== 'highlighter' : true

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
function outlinePolygons(path) {
  const polygons = []
  let points = []
  for (const command of path.match(/[MLQZ][^MLQZ]*/g) ?? []) {
    const numbers = command.slice(1).trim().split(/\s+/).map(Number)
    if (command[0] === 'M' && points.length) { polygons.push(points); points = [] }
    if (command[0] === 'M' || command[0] === 'L') points.push({ x: numbers[0], y: numbers[1] })
    if (command[0] === 'Q') {
      const a = points.at(-1), [cx, cy, x, y] = numbers
      for (let step = 1; step <= 6; step++) {
        const t = step / 6, u = 1 - t
        points.push({ x: u * u * a.x + 2 * u * t * cx + t * t * x, y: u * u * a.y + 2 * u * t * cy + t * t * y })
      }
    }
  }
  if (points.length) polygons.push(points)
  return polygons
}
function strokePolygons(object) {
  const { points, penKind: kind, strokeWidth: width } = object
  // 번진 자리는 **페이지 좌표로 고정**이다(화면 3px). 여기 값은 요소 좌표라 투영에서 요소 크기만큼
  // 늘어난다 — 미리 나눠 둬야 확대한 획에서도 1.5 가 되고, 영역 지우개(createAreaEraserSession)의
  // 판정과 어긋나지 않는다(코드리뷰 2026-11-13).
  const bleed = kind === 'glass'
    ? GLASS_BLEED / Math.max(1e-6, Math.max((object.w ?? 0) / (object.baseWidth || 1), (object.h ?? 0) / (object.baseHeight || 1)))
    : 0
  if (isDashedKind(kind)) return outlinePolygons(dashedObjectContour(object))
  if (isNibKind(kind)) return outlinePolygons(nibContour(object))
  if (kind === 'felt' && [2, 3].includes(object.renderVersion)) return outlinePolygons(penContour(points, width, kind))
  if (points.length > 1 && (kind === 'brush' || kind === 'fountain')) {
    return outlinePolygons([2, 3].includes(object.renderVersion) ? penContour(points, width, kind) : strokeOutline(points, width, object.eraserCaps))
  }
  // 유리펜은 실루엣 밖으로 번진 자리까지가 획이다 — 보이는 잉크에 지우개를 대면 지워져야 한다
  const half = width / 2 * (kind === 'highlighter' ? 1 : points.length === 1 ? points[0].pressure ?? 1 : kind === 'pencil' ? 0.85 : 1) + bleed
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
  // 대략의 범위: 요소 상자 네 모서리(회전 반영)에 획 굵기만큼 여유. 정확한 도형(polygons)은 이 범위에 지우개가 닿을 때 만든다.
  const pad = object.strokeWidth * object.points.reduce((max, p) => Math.max(max, p.pressure ?? 1), 1) * Math.max(object.w / object.baseWidth, object.h / object.baseHeight)
    + (object.penKind === 'glass' ? GLASS_BLEED : 0)
  const corners = [[0, 0], [object.baseWidth, 0], [0, object.baseHeight], [object.baseWidth, object.baseHeight]].map(([x, y]) => project({ x, y }))
  const box = boundsOf(corners)
  let polygons = null
  return {
    id: object.id, object, project,
    bounds: { left: box.left - pad, right: box.right + pad, top: box.top - pad, bottom: box.bottom + pad },
    get polygons() {
      polygons ??= shapesOf(object).map((shape) => {
        const points = shape.map(project)
        return { points, bounds: boundsOf(points) }
      })
      return polygons
    },
  }
}

// 획의 정확한 도형(요소 좌표)은 지우개가 상자에 닿는 **그 순간** 만들어진다. 그런데 제스처가 끝나면
// 버려져서, 같은 획을 다시 지우려 하면 또 만들었다 — 붓펜 · 만년필처럼 외곽선이 비싼 펜은 그때마다
// 눈에 띄게 걸린다. 획은 불변이므로 모양은 한 번만 만들면 된다.
// 열쇠는 **자리(x·y·회전 등)를 뺀 모양 값**이다: 획을 옮기기만 하면 점 배열은 그대로 쓰이므로
// 옮긴 뒤에도 그대로 쓴다. 자리 바꾸기(project)는 싸서 제스처마다 다시 해도 된다.
const shapeCache = new WeakMap()
// 유리펜만 **지금 크기**(w · h)에 걸린다 — 번진 자리를 요소 좌표로 되돌릴 때 크기로 나누기
// 때문이다(strokePolygons). 열쇠에 없으면 늘린 획이 옛 여유를 그대로 써서, 4배로 늘린 획이
// 1.5 가 아니라 6 단위 밖에서도 지워진다(코드리뷰 2026-11-13). 다른 펜은 크기와 무관하므로
// 넣지 않는다 — 넣으면 크기만 바꿔도 모든 펜의 도형을 다시 만든다.
const shapeKey = (object) => [object.penKind, object.strokeWidth, object.renderVersion, object.lineCap,
  object.eraserCaps, object.sampled, object.taperBaked, object.inkStartDistance,
  object.baseWidth, object.baseHeight, object.dashLength, object.dashGap,
  object.penKind === 'glass' ? `${object.w}|${object.h}` : ''].join('|')
function shapesOf(object) {
  const key = shapeKey(object)
  let entry = shapeCache.get(object.points)
  if (entry?.key !== key) {
    entry = { key, shapes: strokePolygons(object).filter((shape) => shape.length >= 3) }
    shapeCache.set(object.points, entry)
  }
  return entry.shapes
}

// 점 사이가 지우개보다 넓으면 그 사이를 그대로 건너뛰므로, 지우개 반지름의 절반 간격 이하로 점을 채운다.
function densify(points, step) {
  const result = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)
    for (let n = 1; n < count; n++) {
      const t = n / count
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
        ...Object.fromEntries(['force', 'time', 'speed', 'tiltX', 'tiltY', 'inkDistance'].filter(key => a[key] != null && b[key] != null)
          .map(key => [key, a[key] + (b[key] - a[key]) * t])),
        ...(a.pressure != null && b.pressure != null && { pressure: a.pressure + (b.pressure - a.pressure) * t }) })
    }
    result.push(b)
  }
  return result
}

// 남은 조각을 원래 획과 같은 모양의 획으로 만든다. 돌리거나 늘이지 않은 획은 조각 크기에 맞게 경계를 다시 잡는다.
function fragmentStroke(source, points, id, caps) {
  const legacy = ![2, 3].includes(source.renderVersion) && ['brush', 'fountain'].includes(source.penKind)
  const tail = { eraserFragment: true, ...(legacy ? { eraserCaps: caps } : {}) }
  const ink = points[0]?.inkDistance != null ? { inkStartDistance: points[0].inkDistance } : {}
  points = source.renderVersion === 3 ? points : points.map(({ inkDistance, ...point }) => point)
  if (!['brush', 'fountain', 'felt'].includes(source.penKind)) tail.sampled = true
  // 붓펜 조각은 원래 획의 테이퍼 굵기를 점에 새긴다. 잘린 끝이 다시 뾰족해지지 않는다.
  if (source.penKind === 'taperBrush') tail.taperBaked = true
  const plain = !source.rotation && !source.flipX && !source.flipY && source.w === source.baseWidth && source.h === source.baseHeight
  // 연필 결은 원래 획의 첫 점에 맞춰져 있다(PencilStrokeContent). 조각도 같은 자리에 맞춰 결이 움직이지 않게 한다.
  const grain = source.penKind === 'pencil' ? source.grainOrigin ?? source.points[0] : null
  // 돌리거나 늘인 획은 상자를 그대로 쓴다. 그래도 **옛 획**은 밀어주기를 적어 줘야 한다 —
  // 조각은 점 배열이 새것이라 glassOrigin 의 대신 값을 새로 잡고, 원본을 옮긴 뒤였다면
  // 그 자리가 기준이 되어 무늬가 튄다(코드리뷰 2026-11-13).
  if (!plain) return { ...source, ...ink, ...tail, id, points,
    ...(source.penKind === 'glass' && { inkOrigin: glassOrigin(source) }),
    ...(grain && { grainOrigin: grain }) }
  const stroke = createStroke(points.map((p) => ({ ...p, x: p.x + source.x, y: p.y + source.y })), {
    id, color: source.color, width: source.strokeWidth, kind: source.penKind, lineCap: source.lineCap,
    renderVersion: source.renderVersion, materialSeed: source.materialSeed,
  // 유리펜 잉크 설정도 조각에 물려준다 — 안 그러면 지운 조각만 기본값으로 바뀐다
    inkGlitter: source.inkGlitter, inkSheen: source.inkSheen, inkFilm: source.inkFilm,
    inkGlitterColor: source.inkGlitterColor, inkAmount: source.inkAmount, inkSheenColor: source.inkSheenColor, inkSheenAmount: source.inkSheenAmount,
  })
  // 유리펜 무늬도 연필 결과 같다 — 조각의 상자가 달라진 만큼 밀어주기를 옮겨, 자르기 전과
  // **같은 무늬**가 남게 한다. 안 옮기면 createStroke 가 조각 자리로 새로 적어 무늬가 튄다
  // (원본을 옮긴 뒤 지운 경우에만 티가 난다).
  // 옛 획에는 inkOrigin 이 없다 — 그때는 glassOrigin 의 대신 값(그 획의 자리)을 기준으로 삼는다.
  // 안 그러면 조각마다 제 자리로 새로 적혀 **조각끼리도, 자르기 전과도** 무늬가 달라진다
  // (코드리뷰 2026-11-13).
  const origin = source.penKind === 'glass' ? glassOrigin(source) : null
  const inkOrigin = origin && { x: origin.x + stroke.x - source.x, y: origin.y + stroke.y - source.y }
  return { ...source, ...stroke, ...ink, ...tail, renderVersion: source.renderVersion, name: source.name,
    ...(inkOrigin && { inkOrigin }),
    ...(grain && { grainOrigin: { ...grain, x: grain.x + source.x - stroke.x, y: grain.y + source.y - stroke.y } }) }
}

// 문서는 바꾸지 않고 후보만 누적하며, 확정 시 기존 단일 삭제 액션을 반환한다.
// mode 'area' 는 영역 지우기: 닿은 부분만 지우고, 확정 시 원래 획을 남은 조각들로 바꾸는 replaceObjects 한 번을 반환한다.
export function createEraserSession(objects, radius = ERASER_RADIUS, mode = 'stroke', target = 'all') {
  objects = objects.filter(object => matchesEraserTarget(object, target))
  if (mode === 'area') return createAreaEraserSession(objects, radius)
  const targets = objects.map(eraserTarget).filter(Boolean), removed = new Set()
  // 입력 한 번마다 모든 획을 돌면 획 300개짜리 페이지에서 초당 수만 번이 된다 — 지우개가 지나는
  // 자리에 **닿을 수 있는 것만** 격자 색인으로 고른다. 획은 제스처 동안 바뀌지 않으므로 한 번만 만든다.
  const index = createBoxIndex(targets, target => target.bounds)
  let finished = false
  return {
    move(from, to = from) {
      if (finished || ![from.x, from.y, to.x, to.y, radius].every(Number.isFinite) || radius < 0) return [...removed]
      const sweep = { left: Math.min(from.x, to.x) - radius, right: Math.max(from.x, to.x) + radius, top: Math.min(from.y, to.y) - radius, bottom: Math.max(from.y, to.y) + radius }
      for (const target of queryBoxIndex(index, sweep)) {
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
  const previewFragments = new WeakMap()
  const built = new Map() // 원래 획 id → 만들어 둔 조각 획들 (바뀐 획만 다시 만든다)
  let finished = false, cached = null
  const piecesOf = (target) => {
    if (!pieces.has(target.id)) {
      const { object, project } = target
      const scale = Math.max(object.w / object.baseWidth, object.h / object.baseHeight) || 1
      let travelled = object.inkStartDistance ?? 0
      const input = [2, 3].includes(object.renderVersion) && ['brush', 'fountain', 'felt'].includes(object.penKind)
        ? object.points.map((p, i) => {
          if (i) travelled += Math.hypot(p.x - object.points[i - 1].x, p.y - object.points[i - 1].y)
          return { ...p, inkDistance: p.inkDistance ?? travelled }
        }) : object.points
      // 예전 잉크 펜(만년필 · 붓펜 · 펠트펜)은 자기 곡선을, 그 밖의 펜은 화면에 그린 것과 같은 이웃 점 가운데 2차 곡선을 촘촘히(1.5) 표본으로 잡는다.
      // 남은 조각은 이 표본을 그대로 그린다(sampled): 직선으로 다시 잇거나 곡선을 또 펴면 지울 때마다 획이 미세하게 흔들렸다.
      const inkPen = ['brush', 'fountain', 'felt'].includes(object.penKind)
      const distanced = withDistances(object.points, object.inkStartDistance ?? 0)
      let curved = isDashedKind(object.penKind) ? dashedObjectSamples(object)
        : inkPen ? ([2, 3].includes(object.renderVersion) ? samplePenCurve(input, object.inkStartDistance ?? 0) : input)
        : object.sampled ? distanced : nibCurve(distanced, { step: 1.5 })
      if (object.penKind === 'taperBrush' && !object.taperBaked && curved.length > 1) curved = withTaper(curved, object.strokeWidth)
      const points = curved.length > 1 ? densify(curved, Math.max(0.5, radius / 2 / scale)) : curved
      pieces.set(target.id, [{ points, page: points.map(project), scale, caps: object.eraserCaps ?? { start: false, end: false } }])
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
          // 유리펜의 번진 자리(GLASS_BLEED)는 그릴 때 **화면 좌표로** 붙으므로 요소 크기(piece.scale)를 따르지 않는다
          const reach = point => radius + target.object.strokeWidth * piece.scale / 2
            * (target.object.penKind === 'highlighter' ? 1 : ['brush', 'fountain', 'felt', 'taperBrush', 'ball', 'calligraphy'].includes(target.object.penKind) ? point.pressure ?? 1 : target.object.penKind === 'pencil' ? 0.85 : 1)
            + (target.object.penKind === 'glass' ? GLASS_BLEED : 0)
          const erased = (point, page) => distanceToSegment(page, from, to) <= reach(point)
          const hit = piece.page.map((p, i) => erased(piece.points[i], p))
          if (!hit.some(Boolean)) return [piece]
          changed = true
          // Locate the cut between samples, keeping the nib outside the erased sweep.
          const boundary = (outside, inside) => {
            let lo = 0, hi = 1
            const a = piece.points[outside], b = piece.points[inside]
            const interpolate = t => {
              const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
              for (const key of ['pressure', 'force', 'time', 'speed', 'tiltX', 'tiltY', 'inkDistance']) {
                if (a[key] != null && b[key] != null) point[key] = a[key] + (b[key] - a[key]) * t
              }
              return point
            }
            for (let n = 0; n < 24; n++) {
              const t = (lo + hi) / 2, point = interpolate(t)
              if (erased(point, target.project(point))) hi = t; else lo = t
            }
            return interpolate(lo)
          }
          const runs = []
          let start = -1
          hit.concat(true).forEach((removed, i) => {
            if (!removed && start < 0) start = i
            if (removed && start >= 0) {
              const points = piece.points.slice(start, i)
              if (start > 0) points.unshift(boundary(start, start - 1))
              if (i < hit.length) points.push(boundary(i - 1, i))
              if (points.length > 1) runs.push({ points, page: points.map(target.project), scale: piece.scale,
                caps: { start: start > 0 || piece.caps.start, end: i < hit.length || piece.caps.end } })
              start = -1
            }
          })
          return runs
        })
        if (changed) { pieces.set(target.id, next); built.delete(target.id); cached = null }
        else if (!before) pieces.delete(target.id)
      }
      return [...pieces.keys()]
    },
    /** 미리보기·확정용: 원래 획 id → 남은 조각 획들 */
    replacements() {
      if (cached) return cached
      const result = {}
      for (const [id, list] of pieces) {
        if (!built.has(id)) {
          const source = targets.find((t) => t.id === id).object
          built.set(id, list.map(piece => {
            let fragment = previewFragments.get(piece)
            if (!fragment) { fragment = fragmentStroke(source, piece.points, createId(), piece.caps); previewFragments.set(piece, fragment) }
            return fragment
          }))
        }
        result[id] = built.get(id)
      }
      cached = result
      return result
    },
    finish(cancelled = false) {
      if (finished) return null
      finished = true
      if (cancelled || !pieces.size) return null
      // Commit the same immutable preview fragments: original IDs remain in Undo,
      // fragment IDs are unique to this gesture, and unchanged render caches survive.
      return { type: 'replaceObjects', replacements: this.replacements() }
    },
  }
}
// 미리보기는 원본 문서를 바꾸지 않고 기존 레이어 순서에 남은 획 조각을 끼운다.
export function eraserPreviewPage(page, ids, pieces) {
  if (!ids.length) return page
  const hidden = new Set(ids)
  return { ...page, objects: page.objects.flatMap(object => pieces?.[object.id] ?? (hidden.has(object.id) ? [] : [object])) }
}
