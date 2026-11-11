import { penContour, strokePath } from './strokes.js'
import { isDashedKind, dashedPreviewContour } from './dashedStroke.js'

// 쓰는 중인 획을 **조각**으로 끊는 단위. 끝난 조각은 모양을 다시 만들지 않고 같은 객체를 다시 쓴다.
// 96 이던 값을 32 로 낮췄다(2026-11-10): 96 이면 59점짜리 **짧은 획은 조각이 하나도 안 닫혀** 캐시가
// 전혀 안 먹고 매 프레임 획 전체를 다시 만들었다(실기 실측: 만년필 59점 14ms · 볼펜 54점 7ms).
// 32 로 끊으면 다시 만드는 양이 조각 하나로 묶여, 프레임 값이 **획 길이와 무관**해진다.
// 조각을 합치는 값은 네이티브 PathBuilder.addPath 라 조각이 늘어도 싸다.
// 그림은 안 바뀐다 — 조각은 접합부 문맥점을 물고 끊기고, 합쳐서 **한 번에** 채우므로
// 겹친 자리가 두 번 칠해지지 않는다(형광펜 같은 반투명 잉크도 그대로다).
export const PREVIEW_SEGMENT_POINTS = 32
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

// 저장 좌표는 건드리지 않는다. 완성 구간은 같은 객체로 재사용하고 꼬리만 복사한다.
// count: 앞에서 몇 점까지 그릴지(끝 갈고리를 뺀 개수). 점 배열을 그대로 넘겨야 완성 구간을 다시 쓴다
export function createStrokePreview(segmentPoints = PREVIEW_SEGMENT_POINTS) {
  let source, cursor = 0, travelled = 0, finished = []
  return {
    snapshot(points, count = points.length) {
      if (source !== points) { source = points; cursor = 0; travelled = 0; finished = [] }
      while (count - cursor > segmentPoints + 1) {
        const end = cursor + segmentPoints
        // 다음 점을 포함해 구간 접합부의 접선·압력 문맥을 유지한다.
        const start = Math.max(0, cursor - 1)
        finished.push({ key: cursor, points: points.slice(start, end + 2), curveBefore: points[start - 1],
          startDistance: travelled - (cursor ? distance(points[cursor - 1], points[cursor]) : 0), continuing: true })
        for (let i = cursor + 1; i <= end; i++) travelled += distance(points[i - 1], points[i])
        cursor = end
      }
      const start = Math.max(0, cursor - 1)
      return [...finished, { key: cursor, points: points.slice(start, count), curveBefore: points[start - 1],
        startDistance: travelled - (cursor ? distance(points[cursor - 1], points[cursor]) : 0), continuing: false }]
    },
  }
}

export function previewGeometry(part, settings) {
  if (isDashedKind(settings.kind)) return { outline: dashedPreviewContour(part, settings.width, settings.kind, settings) }
  return part.points.length > 1 && (settings.kind === 'brush' || settings.kind === 'fountain' || (settings.kind === 'ball' && part.points.some(p => (p.pressure ?? 1) !== 1)))
    ? { outline: penContour(part.points, settings.width, settings.kind) }
    : { path: partPath(part) }
}

// 구간의 경로를 저장 획(strokePath)과 똑같은 2차 곡선 명령으로 만든다. 앞 문맥 점에서 이웃 가운데를 시작점으로 잡아,
// 구간 경계에서도 손을 뗀 뒤 다시 그린 획과 모양이 같다(구간마다 처음 점에서 새로 시작하면 경계가 미세하게 달라졌다).
const mid = (a, b) => `${(a.x + b.x) / 2} ${(a.y + b.y) / 2}`
export function partPath(part) {
  if (!part.curveBefore && !part.continuing) return strokePath(part.points)
  const points = part.curveBefore ? [part.curveBefore, ...part.points] : part.points
  const first = part.curveBefore ? 1 : 0, last = points.length - (part.continuing ? 2 : 1)
  let path = ''
  for (let k = Math.max(first, 1); k <= Math.min(last, points.length - 2); k++) {
    if (!path) path = k === 1 && !part.curveBefore ? `M${points[0].x} ${points[0].y}` : `M${mid(points[k - 1], points[k])}`
    path += `Q${points[k].x} ${points[k].y} ${mid(points[k], points[k + 1])}`
  }
  if (!part.continuing && path) path += `L${points.at(-1).x} ${points.at(-1).y}`
  return path || strokePath(part.points)
}
