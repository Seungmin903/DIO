import { penSweeps } from './strokes.js'

// 캘리펜 · 붓펜(코덱스 2026-11-02): 필압 없이도 단색 한 겹의 '외곽선 모양'만으로 볼펜과 구분되는 두 펜.
// 캘리펜은 고정 각도 평촉 사각(방향 따라 굵고 가늚), 붓펜은 원형 펜촉의 시작 · 끝 테이퍼(뾰족한 들어감 · 빠짐).
export const NIB_KINDS = ['calligraphy', 'taperBrush']
export const isNibKind = kind => NIB_KINDS.includes(kind)

// 평촉: 긴 변 = 굵기 D, 짧은 변 = max(0.75, 0.34D)(사용자: 굵기 대비 살짝 더, 0.38 → 0.34), 긴 변이 화면 +x 축에서 시계 방향 25°(y 아래로), 모서리 반경 0.08D
const NIB_ANGLE = 25 * Math.PI / 180, NIB_RATIO = 0.34, NIB_MIN_SHORT = 0.75, NIB_CORNER = 0.08
// 붓펜(코덱스 3판 · 검수 반영): 시작은 붓을 눌러 생긴 둥근 머리(기필) 1.45D, 끝은 길게 빠지는 삐침(수필). 몸통은 굵기의 1.25배.
// 머리 길이 H = min(max(1.2D, 3), 8)·3차 ease-out, 삐침 길이 T = min(max(4.5D, 8), 0.42S)(상한 26 이면 굵은 획 끝이 짧은 화살촉이 됐다, 2026-11-03 태블릿 확인).
// 삐침은 몸통 굵기를 이어 가다 끝에서 모이는 1 - u² (ease-out 이면 시작에서 확 줄어 굵을 때 옆선이 )( 처럼 오목했다, 사용자 지적).
// 삐침 끝은 지름 0.5 까지 뾰족하게 모은다(코덱스 2026-11-03: 끝 굵기 0.5D 에서 멈추면 둥근 머리가 성냥처럼 튀어나왔다, 사용자 지적. 실제 붓펜 · Clip Studio · perfect-freehand 도 끝에 머리를 남기지 않는다).
// 짧은 획(S < max(2.5D, 6))은 가시처럼 되지 않게 끝 굵기를 max(0.85D, 1.1) 로 둔다. 몸통 굵기는 max(0.5D, 1) ~ 1.45D 사이.
// 이미 그린 앞부분이 획이 길어지면서 바뀌지 않도록 머리 · 몸통은 획 길이 S 와 무관하다(사용자: 다시 계산해 바뀌지 않게).
const HEAD = 1.45, BODY = 1.25, HEAD_LENGTH = [1.2, 3, 8], TAIL_LENGTH = [4.5, 8, Infinity, 0.42]
const SHORT = [2.5, 6], SHORT_END = [0.85, 1.1], FLOOR = [0.5, 1], TIP = 0.5
// 끝 구간은 굵기가 빠르게 변하므로 곡선 표본(6)보다 촘촘히 나눈다(그대로면 옆선이 각져 보인다)
const TAIL_STEP = 0.75
export const BRUSH_MAX_SCALE = HEAD
const DOT = 0.75, BRUSH_DOT = 1.15, MIN_DOT = 0.85

// 볼펜(strokePath)과 같은 곡선: 입력 점을 조절점으로 두고 이웃 점의 가운데를 잇는 2차 곡선. 처음 · 끝 점은 그대로 지난다.
// 손떨림으로 생긴 꺾임이 둥글게 펴진다. 곡선은 길이 step(기본 6)마다, 그리고 방향이 7.5° 바뀔 때마다 나눈다.
// 진행 거리(inkDistance)는 입력 점 사이 직선 거리의 누적이다(필기 중 PenInput 이 매기는 값과 같다). 곡선 표본도 이 값을 이어 받아,
// 그리는 중 · 저장 뒤 · 지우개 조각이 같은 거리로 모양(붓 머리 · 연필 결)을 정한다.
const CURVE_STEP = 6, CURVE_TURN = Math.PI / 24, CURVE_MAX_STEPS = 48
const CARRIED = ['pressure', 'speed', 'inkDistance', 'tiltX', 'tiltY']
const middle = (a, b) => {
  const point = { ...b, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  for (const key of CARRIED) if (a[key] != null && b[key] != null) point[key] = (a[key] + b[key]) / 2
  return point
}
function quadratic(out, s, c, e, step) {
  const ax = c.x - s.x, ay = c.y - s.y, bx = e.x - c.x, by = e.y - c.y
  const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by) || 0)
  const steps = Math.min(CURVE_MAX_STEPS * CURVE_STEP / step, Math.max(1, Math.ceil(Math.max((Math.hypot(ax, ay) + Math.hypot(bx, by)) / step, turn / CURVE_TURN))))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t, w0 = u * u, w1 = 2 * u * t, w2 = t * t
    const point = { x: w0 * s.x + w1 * c.x + w2 * e.x, y: w0 * s.y + w1 * c.y + w2 * e.y, pressure: w0 * (s.pressure ?? 1) + w1 * (c.pressure ?? 1) + w2 * (e.pressure ?? 1) }
    for (const key of ['speed', 'inkDistance', 'tiltX', 'tiltY']) if (s[key] != null && c[key] != null && e[key] != null) point[key] = w0 * s[key] + w1 * c[key] + w2 * e[key]
    out.push(point)
  }
}
// 진행 거리가 없는 점(예전 · 버전 2 저장 획)은 직선 거리 누적으로 채운다
export function withDistances(points, start = 0) {
  if (points.every(p => Number.isFinite(p.inkDistance))) return points
  let travelled = start
  return points.map((p, i) => {
    if (i) travelled += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y)
    return { ...p, inkDistance: travelled }
  })
}
// first · last 는 그릴 입력 점 범위(미리보기 구간은 앞 · 뒤 문맥 점을 함께 받는다). 구간을 이어 붙이면 저장 획과 같은 곡선이다.
export function nibCurve(points, { first = 0, last = points.length - 1, start = first === 0, end = last === points.length - 1, step = CURVE_STEP } = {}) {
  if (points.length < 2 || last <= first) return points.slice(first, first + 1)
  if (points.length === 2) return [{ ...points[0] }, { ...points[1] }]
  const out = []
  for (let k = Math.max(first, 1); k <= Math.min(last, points.length - 2); k++) {
    const s = k === 1 && start ? points[0] : middle(points[k - 1], points[k])
    if (!out.length) out.push({ ...s })
    quadratic(out, s, points[k], middle(points[k], points[k + 1]), step)
  }
  if (end) out.push({ ...points.at(-1) })
  return out
}
// 지우개 조각처럼 이미 곡선 표본인 점(sampled)은 다시 펴지 않는다(다시 펴면 지울 때마다 모양이 조금씩 움직인다)
export const strokeCurve = object => object.sampled || object.points.length < 2 ? object.points : nibCurve(object.points)
export const curveOfPart = (part, step = CURVE_STEP) => {
  const points = part.curveBefore ? [part.curveBefore, ...part.points] : part.points
  return nibCurve(points, { first: part.curveBefore ? 1 : 0, last: points.length - (part.continuing ? 2 : 1), start: !part.curveBefore, end: !part.continuing, step })
}

const round = value => Math.round(value * 1000) / 1000
// 모든 조각을 같은 방향으로 감아 nonzero 채움 하나로 합친다(penSweeps 와 같은 방향).
function polygonPath(points) {
  let area = 0
  for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += a.x * b.y - b.x * a.y }
  if (area < 0) points = points.slice().reverse()
  return points.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)} ${round(p.y)}`).join('') + 'Z'
}

const nibCache = new Map()
function nibShape(width) {
  if (nibCache.has(width)) return nibCache.get(width)
  const long = width / 2, short = Math.max(NIB_MIN_SHORT, width * NIB_RATIO) / 2
  const r = Math.min(width * NIB_CORNER, short * 0.9)
  const ux = Math.cos(NIB_ANGLE), uy = Math.sin(NIB_ANGLE), vx = -uy, vy = ux
  const shape = []
  for (const [su, sv, from] of [[1, 1, 0], [-1, 1, 1], [-1, -1, 2], [1, -1, 3]]) {
    const cu = su * (long - r), cv = sv * (short - r)
    for (let n = 0; n <= 3; n++) {
      const a = (from + n / 3) * Math.PI / 2, du = cu + Math.cos(a) * r, dv = cv + Math.sin(a) * r
      shape.push({ x: ux * du + vx * dv, y: uy * du + vy * dv })
    }
  }
  if (nibCache.size > 64) nibCache.clear()
  nibCache.set(width, shape)
  return shape
}

// 평촉을 쓸면(민코프스키 합) 선분마다 평촉의 양쪽 끝 꼭짓점(진행 방향 왼쪽 · 오른쪽으로 가장 먼 점)을 잇는 띠가 된다.
// 띠는 사각형 하나로 그리고, 평촉 모양 전체는 처음 · 끝과 맞닿는 꼭짓점이 바뀌는 굽은 곳에만 찍는다(경로를 가볍게).
function calligraphyPath(points, width) {
  // 탭은 잘린 사선처럼 보여 볼펜 · 붓펜과 같은 원 점으로 찍는다
  if (points.length === 1) return dotPath(points[0], width * DOT * (points[0].pressure ?? 1))
  const nib = nibShape(width), size = p => p.pressure ?? 1
  const stamp = p => polygonPath(nib.map(d => ({ x: p.x + d.x * size(p), y: p.y + d.y * size(p) })))
  const extreme = (nx, ny) => {
    let best = 0
    for (let i = 1; i < nib.length; i++) if (nib[i].x * nx + nib[i].y * ny > nib[best].x * nx + nib[best].y * ny) best = i
    return best
  }
  let path = '', previous = null
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy)
    if (length < 1e-8) continue
    const left = extreme(-dy, dx), right = extreme(dy, -dx)
    if (!previous || previous.left !== left || previous.right !== right) path += stamp(a)
    // 맞닿기만 한 이음선이 밝게 보이지 않도록 진행 방향으로 아주 조금 겹친다(penSweeps 와 같은 0.04)
    const ox = dx / length * 0.04, oy = dy / length * 0.04, l = nib[left], r = nib[right]
    const sa = size(a), sb = size(b)
    // 힘으로 평촉 크기가 변하는 구간은 끝마다 평촉을 찍어 이음새를 메운다
    if (sa !== sb) path += stamp(b)
    path += polygonPath([{ x: a.x + l.x * sa - ox, y: a.y + l.y * sa - oy }, { x: b.x + l.x * sb + ox, y: b.y + l.y * sb + oy },
      { x: b.x + r.x * sb + ox, y: b.y + r.y * sb + oy }, { x: a.x + r.x * sa - ox, y: a.y + r.y * sa - oy }])
    previous = { left, right }
  }
  return path + stamp(points.at(-1))
}

function dotPath(point, diameter) {
  const radius = Math.max(MIN_DOT, diameter) / 2
  return polygonPath(Array.from({ length: 16 }, (_, n) => ({ x: point.x + Math.cos(n * Math.PI / 8) * radius, y: point.y + Math.sin(n * Math.PI / 8) * radius })))
}

const easeOut = t => 1 - (1 - t) ** 3, easeIn = t => t * t
const span = ([ratio, floor, cap, share], width, total) => Math.min(Math.max(ratio * width, floor), cap, share == null ? Infinity : share * total)
export function brushShape(width, total) {
  const short = total < Math.max(SHORT[0] * width, SHORT[1])
  return { head: span(HEAD_LENGTH, width, total), tail: span(TAIL_LENGTH, width, total),
    end: (short ? Math.max(SHORT_END[0] * width, SHORT_END[1]) : TIP) / width,
    floor: Math.max(FLOOR[0] * width, FLOOR[1]) / width }
}
// 진행 거리 d 에서의 굵기 배율(굵기 D 대비). speed 는 입력 때 정한 속도 배율(점의 pressure). end 가 false 면 끝 삐침은 아직 없다.
export function brushScale(distance, total, width, { speed = 1, end = true } = {}) {
  const shape = brushShape(width, total)
  let scale = distance < shape.head ? HEAD + (BODY - HEAD) * easeOut(distance / shape.head) : BODY
  const from = total - shape.tail, inTail = end && distance > from
  if (inTail) scale = Math.min(scale, BODY + (shape.end - BODY) * easeIn(Math.min(1, (distance - from) / shape.tail)))
  return Math.max(inTail ? Math.min(shape.end, shape.floor) : Math.min(shape.floor, 1), Math.min(HEAD, scale * speed))
}

// 곡선 표본의 진행 거리(inkDistance)로 붓 굵기 배율을 pressure 에 넣는다(입력 때의 속도 배율과 곱한다).
export function withTaper(points, width, { total, end = true } = {}) {
  points = withDistances(points)
  const length = total ?? points.at(-1).inkDistance
  const from = end ? length - brushShape(width, length).tail : Infinity, sampled = []
  points.forEach((p, i) => {
    const a = points[i - 1]
    if (a && p.inkDistance > from) {
      const steps = Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / TAIL_STEP)
      for (let k = 1; k < steps; k++) {
        const t = k / steps
        sampled.push({ ...p, x: a.x + (p.x - a.x) * t, y: a.y + (p.y - a.y) * t, pressure: (a.pressure ?? 1) + ((p.pressure ?? 1) - (a.pressure ?? 1)) * t, inkDistance: a.inkDistance + (p.inkDistance - a.inkDistance) * t })
      }
    }
    sampled.push(p)
  })
  return sampled.map(p => ({ ...p, pressure: brushScale(p.inkDistance, length, width, { speed: p.pressure ?? 1, end }) }))
}

function taperPath(points, width, { capStart = true, capEnd = true } = {}) {
  if (points.length === 1) return dotPath(points[0], width * BRUSH_DOT * (points[0].pressure ?? 1))
  return penSweeps(points, width, 'ball', 0, { capStart, capEnd }).map(piece => piece.path).join('')
}

// 완성 획(저장 · 썸네일 · 내보내기 · 지우개 판정)의 외곽선. 지우개 조각은 굵기가 점에 새겨져 있다(taperBaked).
export function nibContour(object) {
  const { points, strokeWidth: width, penKind: kind } = object
  if (kind === 'calligraphy') return calligraphyPath(strokeCurve(object), width)
  if (points.length === 1 && !object.taperBaked) return taperPath(points, width)
  if (object.taperBaked) return taperPath(strokeCurve(object), width)
  return taperPath(withTaper(nibCurve(withDistances(points, object.inkStartDistance ?? 0)), width), width)
}

// 볼펜: 필압 · 기울기로 굵기가 변하는 획. 힘 정보가 없는 획(모든 점 1)은 예전처럼 일정한 선으로 그린다
export const ballVaries = points => points.some(p => (p.pressure ?? 1) !== 1)
export const ballSweepPath = (points, width, caps) => points.length === 1 ? dotPath(points[0], width * (points[0].pressure ?? 1))
  : penSweeps(points, width, 'ball', 0, caps).map(piece => piece.path).join('')
const ballCache = new WeakMap()
export function ballPreviewPaths(parts, width) {
  if (parts.length === 1 && parts[0].points.length === 1) return [ballSweepPath(parts[0].points, width)]
  return parts.map((part, i) => {
    const key = `b:${width}`, cached = ballCache.get(part)
    if (i < parts.length - 1 && cached?.key === key) return cached.path
    const path = ballSweepPath(curveOfPart(part), width, { capStart: !part.key, capEnd: !part.continuing })
    if (i < parts.length - 1) ballCache.set(part, { key, path })
    return path
  })
}

// 그리는 중 미리보기: 끝난 구간은 같은 객체를 재사용한다. 붓펜 끝 삐침이 걸린 구간만 다시 계산한다.
const partCache = new WeakMap()
export function nibPreviewPaths(parts, width, kind) {
  if (kind === 'calligraphy') return parts.map(part => {
    const key = `c:${width}`, cached = partCache.get(part)
    if (cached?.key === key) return cached.path
    const path = calligraphyPath(part.points.length > 1 ? curveOfPart(part) : part.points, width)
    partCache.set(part, { key, path })
    return path
  })
  if (parts.length === 1 && parts[0].points.length === 1) return [taperPath(parts[0].points, width)]
  const total = parts.at(-1)?.points.at(-1)?.inkDistance ?? 0, from = total - brushShape(width, total).tail
  return parts.map((part, i) => {
    const live = i >= parts.length - 2 || part.points.at(-1).inkDistance > from
    const key = `t:${width}`, cached = partCache.get(part)
    if (!live && cached?.key === key) return cached.path
    const path = taperPath(withTaper(curveOfPart(part), width, { total, end: live }), width, { capStart: !part.key, capEnd: !part.continuing })
    if (!live) partCache.set(part, { key, path })
    return path
  })
}
