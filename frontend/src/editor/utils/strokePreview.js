import { penContour, strokePath } from './strokes.js'

export const PREVIEW_SEGMENT_POINTS = 96
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

// 저장 좌표는 건드리지 않는다. 완성 구간은 같은 객체로 재사용하고 꼬리만 복사한다.
export function createStrokePreview() {
  let source, cursor = 0, travelled = 0, finished = []
  return {
    snapshot(points) {
      if (source !== points) { source = points; cursor = 0; travelled = 0; finished = [] }
      while (points.length - cursor > PREVIEW_SEGMENT_POINTS + 1) {
        const end = cursor + PREVIEW_SEGMENT_POINTS
        // 다음 점을 포함해 구간 접합부의 접선·압력 문맥을 유지한다.
        const start = Math.max(0, cursor - 1)
        finished.push({ key: cursor, points: points.slice(start, end + 2), curveBefore: points[start - 1],
          startDistance: travelled - (cursor ? distance(points[cursor - 1], points[cursor]) : 0), continuing: true })
        for (let i = cursor + 1; i <= end; i++) travelled += distance(points[i - 1], points[i])
        cursor = end
      }
      const start = Math.max(0, cursor - 1)
      return [...finished, { key: cursor, points: points.slice(start), curveBefore: points[start - 1],
        startDistance: travelled - (cursor ? distance(points[cursor - 1], points[cursor]) : 0), continuing: false }]
    },
  }
}

export function previewGeometry(part, settings) {
  return part.points.length > 1 && (settings.kind === 'brush' || settings.kind === 'fountain')
    ? { outline: penContour(part.points, settings.width, settings.kind) }
    : { path: strokePath(part.points) }
}
