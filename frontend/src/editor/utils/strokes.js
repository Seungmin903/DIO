// 페이지 논리 좌표를 요소 내부 좌표로 변환한다. w/h는 현재 크기,
// baseWidth/baseHeight는 원래 좌표계이므로 공통 이동·회전·리사이즈를 재사용한다.
export const DEFAULT_PEN = { color: '#0B1957', width: 3 }

export function createStroke(points, { id, color = DEFAULT_PEN.color, width = DEFAULT_PEN.width } = {}) {
  if (!points.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('잘못된 필기 좌표입니다.')
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  const w = Math.max(20, maxX - minX + width)
  const h = Math.max(20, maxY - minY + width)
  const x = (minX + maxX - w) / 2, y = (minY + maxY - h) / 2
  return {
    id, type: 'stroke', name: '펜 획', x, y, w, h, rotation: 0,
    baseWidth: w, baseHeight: h, color, strokeWidth: width,
    points: points.map((p) => ({ x: p.x - x, y: p.y - y })),
  }
}

export function strokePath(points) {
  if (!points?.length) return ''
  const [first] = points
  // round linecap으로 단순 탭도 점을 남긴다.
  if (points.length === 1) return `M${first.x} ${first.y}l0.01 0`
  return `M${first.x} ${first.y}` + points.slice(1).map((p) => `L${p.x} ${p.y}`).join('')
}
