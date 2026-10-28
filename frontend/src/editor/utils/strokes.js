// 페이지 논리 좌표를 요소 내부 좌표로 변환한다. w/h는 현재 크기,
// baseWidth/baseHeight는 원래 좌표계이므로 공통 이동·회전·리사이즈를 재사용한다.
export const DEFAULT_PEN = { color: '#0B1957', width: 3 }
const SENSOR_PRECISION = { force: 10000, time: 10, speed: 10000, tiltX: 10, tiltY: 10, inkDistance: 10000 }
const storedPoint = (point, x, y, renderVersion) => {
  const result = { x: point.x - x, y: point.y - y, ...(point.pressure != null && { pressure: point.pressure }) }
  // Only the new material version needs sensor metadata. Never serialize event
  // objects/arbitrary keys or round existing geometry and width multipliers.
  if (renderVersion === 3) for (const [key, scale] of Object.entries(SENSOR_PRECISION)) {
    if (point[key] != null) result[key] = Math.round(point[key] * scale) / scale
  }
  return result
}

export function createStroke(points, { id, color = DEFAULT_PEN.color, width = DEFAULT_PEN.width, kind = 'ball', lineCap = 'round', renderVersion = 2, materialSeed } = {}) {
  if (!points.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('잘못된 필기 좌표입니다.')
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  // 스퀘어 끝은 대각선에서도 경계에 잘리지 않도록 여백을 확보한다.
  const padding = width * points.reduce((max, p) => Math.max(max, p.pressure ?? 1), 1) * (kind === 'highlighter' && lineCap === 'square' ? Math.SQRT2 : 1)
  const w = Math.max(20, maxX - minX + padding)
  const h = Math.max(20, maxY - minY + padding)
  const x = (minX + maxX - w) / 2, y = (minY + maxY - h) / 2
  return {
    id, type: 'stroke', name: kind === 'highlighter' ? '형광펜 획' : '펜 획', x, y, w, h, rotation: 0,
    baseWidth: w, baseHeight: h, color, strokeWidth: width, penKind: kind, renderVersion,
    ...(renderVersion === 3 && { materialSeed: materialSeed ?? 0 }),
    ...(kind === 'highlighter' && { lineCap }),
    points: points.map((p) => storedPoint(p, x, y, renderVersion)),
  }
}

// 가변 굵기를 하나의 닫힌 경로로 표현해 SVG 요소 수가 늘어나지 않게 한다.
export function strokeOutline(points, width) {
  if (points.length < 2) return ''
  const left = [], right = []
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)]
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1
    const radius = width * (p.pressure ?? 1) / 2
    left.push(`${p.x - dy / distance * radius} ${p.y + dx / distance * radius}`)
    right.push(`${p.x + dy / distance * radius} ${p.y - dx / distance * radius}`)
  })
  return `M${left.join('L')}L${right.reverse().join('L')}Z`
}

export function strokePath(points) {
  if (!points?.length) return ''
  const [first] = points
  // round linecap으로 단순 탭도 점을 남긴다.
  if (points.length === 1) return `M${first.x} ${first.y}l0.01 0`
  return `M${first.x} ${first.y}` + points.slice(1).map((p) => `L${p.x} ${p.y}`).join('')
}

// 원형 펜촉을 구간마다 이어 붙인다. 되짚기에서도 끝을 한 점으로 접지 않는다.
// 모든 부분 도형은 같은 winding으로 채워 겹침이 빈틈을 만들지 않는다.
export function penContour(points, width, kind) {
  return penSweeps(points, width, kind).map(piece => piece.path).join('')
}

const polygonPath = points => {
  points = points.map(p => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 }))
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    area += a.x * b.y - b.x * a.y
  }
  if (Math.abs(area) < 1e-10) return ''
  if (area < 0) points.reverse()
  return points.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p.x * 1000) / 1000} ${Math.round(p.y * 1000) / 1000}`).join('') + 'Z'
}

// 농도도 화면 x/y가 아닌 실제 누적 이동 거리를 사용한다.
export function penSweeps(points, width, kind, startDistance = 0, { capStart = true, capEnd = true } = {}) {
  if (!points.length) return []
  const pieces = []
  // 중복 위치는 마지막 압력을 사용한다. 0 길이 구간의 접선은 만들지 않는다.
  const clean = []
  for (const p of points) {
    const previous = clean.at(-1)
    if (previous && Math.hypot(p.x - previous.x, p.y - previous.y) < 1e-8) clean[clean.length - 1] = p
    else clean.push(p)
  }
  const offset = (angle, radius) => {
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius
    return kind === 'fountain' ? { x: x * 0.94 + y * 0.06, y: x * 0.06 + y * 0.94 } : { x, y }
  }
  const radius = p => width * (p.pressure ?? 1) / 2
  const arc = (p, angle, turn, distance) => {
    const steps = Math.max(1, Math.ceil(Math.abs(turn) / (Math.PI / 12)))
    const vertices = [p]
    for (let i = 0; i <= steps; i++) {
      const d = offset(angle + turn * i / steps, radius(p))
      vertices.push({ x: p.x + d.x, y: p.y + d.y })
    }
    pieces.push({ path: polygonPath(vertices), distance, point: p })
  }
  if (clean.length === 1) { arc(clean[0], 0, Math.PI * 2, startDistance); return pieces }
  let travelled = startDistance, previousAngle
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1], b = clean[i]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    if (i === 1) { if (capStart) arc(a, angle + Math.PI / 2, Math.PI, travelled) }
    else {
      const turn = Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle))
      if (Math.abs(turn) > 1e-8) arc(a, previousAngle - Math.sign(turn) * Math.PI / 2, turn, travelled)
    }
    const da = offset(angle + Math.PI / 2, radius(a)), db = offset(angle + Math.PI / 2, radius(b))
    // 반올림된 접합선이 딱 맞닿기만 하면 SVG 래스터화에서 가는 밝은 이음선이 생긴다.
    // 끝/조인 안쪽으로만 아주 작게 겹쳐 같은 Path의 채움으로 합친다.
    const overlap = Math.min(0.04, radius(a) * 0.02, radius(b) * 0.02)
    const ox = Math.cos(angle) * overlap, oy = Math.sin(angle) * overlap
    pieces.push({ path: polygonPath([
      { x: a.x + da.x - ox, y: a.y + da.y - oy }, { x: b.x + db.x + ox, y: b.y + db.y + oy },
      { x: b.x - db.x + ox, y: b.y - db.y + oy }, { x: a.x - da.x - ox, y: a.y - da.y - oy },
    ]), distance: travelled + length / 2, point: { ...a,
      ...(a.force != null && b.force != null && { force: (a.force + b.force) / 2 }),
      ...(a.speed != null && b.speed != null && { speed: (a.speed + b.speed) / 2 }) } })
    travelled += length
    previousAngle = angle
    if (i === clean.length - 1 && capEnd) arc(b, angle - Math.PI / 2, Math.PI, travelled)
  }
  return pieces
}

// 종이 결은 좌표가 고정된 SVG 패턴으로 표현해 저장·새로고침·출력 시 바뀌지 않는다.
export const PENCIL_GRAIN_SIZE = 14
const grainNoise = (i) => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n) }
export const PENCIL_GRAIN = Array.from({ length: 80 }, (_, i) => ({
  x: grainNoise(i + 1) * PENCIL_GRAIN_SIZE,
  y: grainNoise(i + 131) * PENCIL_GRAIN_SIZE,
  radius: 0.2 + grainNoise(i + 261) * 0.65,
  opacity: 0.28 + (i % 5) * 0.13,
}))
