// 페이지 논리 좌표를 요소 내부 좌표로 변환한다. w/h는 현재 크기,
// baseWidth/baseHeight는 원래 좌표계이므로 공통 이동·회전·리사이즈를 재사용한다.
export const DEFAULT_PEN = { color: '#0B1957', width: 3 }

export function createStroke(points, { id, color = DEFAULT_PEN.color, width = DEFAULT_PEN.width, kind = 'ball', lineCap = 'round' } = {}) {
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
    baseWidth: w, baseHeight: h, color, strokeWidth: width, penKind: kind, renderVersion: 2,
    ...(kind === 'highlighter' && { lineCap }),
    points: points.map((p) => ({ x: p.x - x, y: p.y - y, ...(p.pressure != null && { pressure: p.pressure }) })),
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
  if (points.length === 2) return `M${first.x} ${first.y}L${points[1].x} ${points[1].y}`
  // 점과 점을 직선으로 이으면 작은 동그라미가 다각형처럼 각진다. 입력 점을 조절점으로 두고 이웃 점의 가운데를 잇는
  // 2차 곡선으로 그린다(점 수만큼의 명령이라 미리보기 비용은 같다). 시작 · 끝점은 그대로 지난다.
  let path = `M${first.x} ${first.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], q = points[i + 1]
    path += `Q${p.x} ${p.y} ${(p.x + q.x) / 2} ${(p.y + q.y) / 2}`
  }
  const last = points[points.length - 1]
  return path + `L${last.x} ${last.y}`
}

// 두 점 사이 곡선 위의 점. 앞뒤 점으로 접선을 잡되 구간 길이 비율로 줄여(chordal) 점 간격이 고르지 않아도 튀지 않는다.
function curvePoint(p0, a, b, p3, t) {
  const dab = Math.hypot(b.x - a.x, b.y - a.y)
  const d0 = Math.hypot(a.x - p0.x, a.y - p0.y), d3 = Math.hypot(p3.x - b.x, p3.y - b.y)
  const ka = dab / ((d0 + dab) || 1), kb = dab / ((dab + d3) || 1)
  const tax = (b.x - p0.x) * ka, tay = (b.y - p0.y) * ka, tbx = (p3.x - a.x) * kb, tby = (p3.y - a.y) * kb
  const t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2
  return { x: h00 * a.x + h10 * tax + h01 * b.x + h11 * tbx, y: h00 * a.y + h10 * tay + h01 * b.y + h11 * tby }
}

// 입력 간격과 무관한 거리 기반 테이퍼와 45도 펜촉을 적용한다.
export function penContour(points, width, kind, { startDistance = 0, continueEnd = false, maxSamples } = {}) {
  if (points.length < 2) return ''
  // 빠른 입력으로 두 끝점만 들어와도 중간 몸통이 테이퍼에 소실되지 않게 한다.
  const sampled = [points[0]]
  // 실시간 미리보기만 재표본 수를 제한한다. 저장·내보내기 윤곽은 기존 간격 그대로다.
  let spacing = 2
  if (maxSamples) {
    let length = 0
    for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    spacing = Math.max(spacing, length / maxSamples)
  }
  // 입력 점 사이를 직선이 아니라 곡선으로 채워 작은 원 · 빠른 곡선이 각지지 않게 한다.
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], p0 = points[i - 2] ?? a, p3 = points[i + 1] ?? b
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing))
    for (let j = 1; j <= steps; j++) {
      const t = j / steps
      sampled.push({ ...(j === steps ? { x: b.x, y: b.y } : curvePoint(p0, a, b, p3, t)), pressure: (a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * t })
    }
  }
  points = sampled
  const distances = [startDistance]
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  const total = distances[distances.length - 1]
  const left = [], right = []
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)]
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1
    const nx = -dy / length, ny = dx / length
    const pressure = (a.pressure ?? 1) * 0.25 + (p.pressure ?? 1) * 0.5 + (b.pressure ?? 1) * 0.25
    const nib = kind === 'fountain' ? 0.28 + 0.72 * Math.abs((nx + ny) / Math.SQRT2) : 1
    const taper = kind === 'brush' ? Math.max(0.06, Math.min(1, distances[i] / Math.max(6, width), continueEnd ? 1 : (total - distances[i]) / Math.max(12, width * 2))) : 1
    const radius = width * pressure * nib * taper / 2
    left.push({ x: p.x + nx * radius, y: p.y + ny * radius })
    right.push({ x: p.x - nx * radius, y: p.y - ny * radius })
  })
  return smoothClosed([...left, ...right.reverse()])
}

function smoothClosed(points) {
  const midpoint = (a, b) => `${(a.x + b.x) / 2} ${(a.y + b.y) / 2}`
  let path = `M${midpoint(points[points.length - 1], points[0])}`
  points.forEach((p, i) => { path += `Q${p.x} ${p.y} ${midpoint(p, points[(i + 1) % points.length])}` })
  return path + 'Z'
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
