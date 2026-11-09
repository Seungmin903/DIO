// 여행 노선 속지의 노선 경로. 절대 좌표 M · L · H · V · C 만 쓰는 SVG path d 를 꺾은선으로 펴고, 길이표로 "경로 위 비율 t(0~1) ↔ 좌표"를 오간다.
// 지점(출발 · 방문 · 도착)은 t 로 저장하고, 끌 때는 손가락에 가장 가까운 경로 위 점으로 붙인다(nearest). 방향별 경로가 달라도 t 는 그대로 쓴다.

const TOKEN = /([MLHVC])|(-?\d+(?:\.\d+)?)/g
const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6 }

/** path d → 명령 목록 [{ c, a: [숫자…] }]. 지원하지 않는 명령(상대 좌표 · Q · A · Z 등)은 오류. */
export function parseRoutePath(d) {
  const tokens = [...String(d).matchAll(TOKEN)], out = []
  for (let i = 0; i < tokens.length;) {
    const c = tokens[i][1]
    if (!c) throw new Error(`노선 경로를 읽지 못했어요: ${d}`)
    const count = ARGS[c], a = tokens.slice(i + 1, i + 1 + count).map(t => Number(t[2]))
    if (a.length !== count || a.some(v => !Number.isFinite(v))) throw new Error(`노선 경로 인자가 모자라요: ${c}`)
    out.push({ c, a }); i += 1 + count
  }
  if (!out.length || out[0].c !== 'M') throw new Error('노선 경로는 M 으로 시작해야 해요.')
  return out
}

const cubic = (p0, p1, p2, p3, u) => {
  const v = 1 - u
  return { x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x, y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y }
}

/**
 * path d → 조각 목록. 직선은 { kind: 'line', from, to }, 곡선은 { kind: 'curve', from, c1, c2, to, points(꺾은선) }.
 * 바탕 그리기(직선은 <line>, 곡선은 <path>)와 꺾은선 만들기가 같은 조각을 쓴다.
 */
export function routeSegments(d, curveSteps = 24) {
  const out = []
  let at = null
  for (const { c, a } of parseRoutePath(d)) {
    if (c === 'M') { at = { x: a[0], y: a[1] }; continue }
    const to = c === 'L' ? { x: a[0], y: a[1] } : c === 'H' ? { x: a[0], y: at.y } : c === 'V' ? { x: at.x, y: a[0] } : { x: a[4], y: a[5] }
    if (c === 'C') {
      const c1 = { x: a[0], y: a[1] }, c2 = { x: a[2], y: a[3] }
      const points = Array.from({ length: curveSteps }, (_, i) => cubic(at, c1, c2, to, (i + 1) / curveSteps))
      out.push({ kind: 'curve', from: at, c1, c2, to, points })
    } else out.push({ kind: 'line', from: at, to })
    at = to
  }
  return out
}

/** 경로를 꺾은선 점 목록으로 편다(첫 점 포함). */
export function flattenRoutePath(d, curveSteps = 24) {
  const segments = routeSegments(d, curveSteps)
  const points = [segments[0].from]
  for (const s of segments) points.push(...(s.kind === 'curve' ? s.points : [s.to]))
  return points
}

const clamp01 = t => Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0))

/**
 * 노선 경로 객체. pointAt(t): 비율 t 의 좌표. nearest(p): p 에서 가장 가까운 경로 위 점 { x, y, t, distance }.
 * 같은 d 는 한 번만 펴서 길이표를 둔다(routePathOf 에서 캐시).
 */
export function createRoutePath(d, curveSteps = 24) {
  const points = flattenRoutePath(d, curveSteps)
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  const total = lengths[lengths.length - 1]
  const pointAt = t => {
    const target = clamp01(t) * total
    let i = 1
    while (i < lengths.length - 1 && lengths[i] < target) i++
    const a = points[i - 1], b = points[i], span = lengths[i] - lengths[i - 1]
    const u = span > 0 ? (target - lengths[i - 1]) / span : 0
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
  }
  const nearest = p => {
    let best = null
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, span = dx * dx + dy * dy
      const u = span > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / span)) : 0
      const x = a.x + dx * u, y = a.y + dy * u, distance = Math.hypot(p.x - x, p.y - y)
      if (!best || distance < best.distance) best = { x, y, distance, t: total > 0 ? (lengths[i - 1] + Math.sqrt(span) * u) / total : 0 }
    }
    return best
  }
  return { d, points, lengths, total, pointAt, nearest }
}
