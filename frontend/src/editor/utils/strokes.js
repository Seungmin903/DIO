// 페이지 논리 좌표를 요소 내부 좌표로 변환한다. w/h는 현재 크기,
// baseWidth/baseHeight는 원래 좌표계이므로 공통 이동·회전·리사이즈를 재사용한다.
export const DEFAULT_PEN = { color: '#0B1957', width: 3 }

export function createStroke(points, { id, color = DEFAULT_PEN.color, width = DEFAULT_PEN.width, kind = 'ball' } = {}) {
  if (!points.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('잘못된 필기 좌표입니다.')
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  const padding = width * points.reduce((max, p) => Math.max(max, p.pressure ?? 1), 1)
  const w = Math.max(20, maxX - minX + padding)
  const h = Math.max(20, maxY - minY + padding)
  const x = (minX + maxX - w) / 2, y = (minY + maxY - h) / 2
  return {
    id, type: 'stroke', name: '펜 획', x, y, w, h, rotation: 0,
    baseWidth: w, baseHeight: h, color, strokeWidth: width, penKind: kind, renderVersion: 2,
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
  return `M${first.x} ${first.y}` + points.slice(1).map((p) => `L${p.x} ${p.y}`).join('')
}

// 입력 간격과 무관한 거리 기반 테이퍼와 45도 펜촉을 적용한다.
export function penContour(points, width, kind) {
  if (points.length < 2) return ''
  // 빠른 입력으로 두 끝점만 들어와도 중간 몸통이 테이퍼에 소실되지 않게 한다.
  const sampled = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2))
    for (let j = 1; j <= steps; j++) {
      const t = j / steps
      sampled.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, pressure: (a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * t })
    }
  }
  points = sampled
  const distances = [0]
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  const total = distances[distances.length - 1]
  const left = [], right = []
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)]
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1
    const nx = -dy / length, ny = dx / length
    const pressure = (a.pressure ?? 1) * 0.25 + (p.pressure ?? 1) * 0.5 + (b.pressure ?? 1) * 0.25
    const nib = kind === 'fountain' ? 0.28 + 0.72 * Math.abs((nx + ny) / Math.SQRT2) : 1
    const taper = kind === 'brush' ? Math.max(0.06, Math.min(1, distances[i] / Math.max(6, width), (total - distances[i]) / Math.max(12, width * 2))) : 1
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
