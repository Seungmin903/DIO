export const TASTING_ID = 'remote-tasting-note-portrait'
export const TASTING_LANDSCAPE_ID = 'remote-tasting-note-landscape'
export const TASTING_V2_ID = 'remote-tasting-note-v2-portrait'
export const TASTING_V2_LANDSCAPE_ID = 'remote-tasting-note-v2-landscape'
export const isTastingV2Id = id => id === TASTING_V2_ID || id === TASTING_V2_LANDSCAPE_ID
export const isTastingId = id => id === TASTING_ID || id === TASTING_LANDSCAPE_ID || isTastingV2Id(id)

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
const v2Definition = landscape => landscape ? {
  sourceWidth: 1024, sourceHeight: 768, width: 1024, height: 768,
  photo: { x: 30, y: 130, width: 240, height: 320 }, starY: 292, starRadius: 16,
  stars: [390, 450, 510, 570, 630], visitY: 344, visit: [427, 634, 825],
  again: [479, 702, 479], againYs: [404, 404, 446], circleRadius: 11,
} : {
  sourceWidth: 768, sourceHeight: 1024, width: 768, height: 1024,
  photo: { x: 30, y: 130, width: 258, height: 344 }, starY: 337, starRadius: 18,
  stars: [407, 476, 545, 614, 683], visitY: 516, visit: [175, 382, 575],
  again: [219, 442, 219], againYs: [576, 576, 618], circleRadius: 11,
}
export const tastingLayout = id => isTastingV2Id(id) ? v2Definition(id === TASTING_V2_LANDSCAPE_ID) : isTastingId(id) ? definition(id === TASTING_LANDSCAPE_ID) : null
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
    ...L.again.map((x, i) => ({ id: `again-${i}`, kind: 'circle', x, y: L.againYs?.[i] ?? L.againY, radius: L.circleRadius })),
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
  const rows = isTastingV2Id(id) ? [marks.slice(0, 5), marks.slice(5, 8), marks.slice(8, 10), marks.slice(10)] : [marks.slice(0, 5), marks.slice(5, 8), marks.slice(8)]
  const row = rows.find(group => {
    const margin = Math.max(...group.map(mark => mark.radius)) * 1.5
    return input.every(p => p.x >= group[0].x - margin && p.x <= group.at(-1).x + margin && Math.abs(p.y - group[0].y) <= margin)
  })
  if (!row) return []
  return row.filter(mark => input.slice(1).some((p, i) => segmentDistance(input[i], p, mark) <= mark.radius * 0.5)).map(mark => mark.id)
}
