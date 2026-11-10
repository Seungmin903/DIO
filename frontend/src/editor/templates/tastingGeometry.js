export const TASTING_ID = 'remote-tasting-note-portrait'
export const TASTING_LANDSCAPE_ID = 'remote-tasting-note-landscape'
export const isTastingId = id => id === TASTING_ID || id === TASTING_LANDSCAPE_ID

// 좌표 원본은 승인된 SVG의 viewBox. 모든 화면·입력·출력에 같은 변환을 쓴다.
const definition = (landscape) => landscape ? {
  sourceWidth: 1487, sourceHeight: 1058, width: 1024, height: 768,
  photo: { x: 42, y: 175, width: 446, height: 350 }, starY: 374, starRadius: 22,
  stars: [676, 742, 808, 874, 940], visitY: 447, visit: [730, 975, 1190], againY: 512, again: [730, 975, 1190], circleRadius: 14,
} : {
  sourceWidth: 1058, sourceHeight: 1487, width: 768, height: 1024,
  photo: { x: 42, y: 175, width: 436, height: 315 }, starY: 434, starRadius: 26,
  stars: [640, 723, 807, 890, 973], visitY: 551, visit: [272, 550, 815], againY: 640, again: [281, 515, 792], circleRadius: 15,
}
export const tastingLayout = id => isTastingId(id) ? definition(id === TASTING_LANDSCAPE_ID) : null
export const tastingPhotoBox = id => {
  const L = tastingLayout(id)
  if (!L) return null
  const sx = L.width / L.sourceWidth, sy = L.height / L.sourceHeight, p = L.photo
  return { x: p.x * sx, y: p.y * sy, width: p.width * sx, height: p.height * sy }
}
export const TASTING_PHOTO = tastingPhotoBox(TASTING_ID)
export function tastingMarks(id) {
  const L = tastingLayout(id)
  if (!L) return []
  return [
    ...L.stars.map((x, i) => ({ id: `star-${i}`, kind: 'star', x, y: L.starY, radius: L.starRadius })),
    ...L.visit.map((x, i) => ({ id: `visit-${i}`, kind: 'circle', x, y: L.visitY, radius: L.circleRadius })),
    ...L.again.map((x, i) => ({ id: `again-${i}`, kind: 'circle', x, y: L.againY, radius: L.circleRadius })),
  ]
}
export const TASTING_MARKS = tastingMarks(TASTING_ID)
export const tastingReferencePoints = (id, points) => {
  const L = tastingLayout(id)
  return L ? points.map(p => ({ ...p, x: p.x * L.sourceWidth / L.width, y: p.y * L.sourceHeight / L.height })) : []
}

export function segmentDistance(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y)
}

export function tastingMarksForStroke(id, points) {
  if (!isTastingId(id) || !Array.isArray(points) || points.length < 2 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return []
  const length = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
  if (length < 4) return []
  const input = tastingReferencePoints(id, points), marks = tastingMarks(id)
  const rows = [marks.slice(0, 5), marks.slice(5, 8), marks.slice(8)]
  const row = rows.find(group => {
    const margin = Math.max(...group.map(mark => mark.radius)) * 1.5
    return input.every(p => p.x >= group[0].x - margin && p.x <= group.at(-1).x + margin && Math.abs(p.y - group[0].y) <= margin)
  })
  if (!row) return []
  return row.filter(mark => input.slice(1).some((p, i) => segmentDistance(input[i], p, mark) <= mark.radius * 0.5)).map(mark => mark.id)
}
