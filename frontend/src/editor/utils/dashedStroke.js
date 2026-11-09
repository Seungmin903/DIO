import { penSweeps, samplePenCurve, samplePenPart } from './strokes.js'

export const DASH_TYPES = [{ id: 'dashed', label: '짧은 선' }, { id: 'dotted', label: '둥근 점' }]
export const isDashedKind = kind => kind === 'dashed' || kind === 'dotted'

// Reference rows 3 and 6. Round caps add one width to a dash's visible length.
// Distances belong to the original stroke so eraser fragments keep their phase.
export function dashedContour(points, width, kind) {
  if (!points.length || !(width > 0)) return ''
  const period = width * (kind === 'dotted' ? 3.5 : 4.5)
  const length = kind === 'dotted' ? 0 : width * 2
  const paths = []
  const draw = run => paths.push(...penSweeps(run, width, 'ball').map(piece => piece.path))
  if (points.length === 1 || points.at(-1).inkDistance === points[0].inkDistance) {
    const phase = (points[0].inkDistance ?? 0) % period
    if (phase <= length) draw([{ ...points[0], pressure: 1 }])
    return paths.join('')
  }
  let run = [], activeDash = -1
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const from = a.inkDistance, to = b.inkDistance
    if (!(to > from)) continue
    const at = distance => {
      const t = (distance - from) / (to - from)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, pressure: 1 }
    }
    for (let n = Math.max(0, Math.ceil((from - length) / period)); n * period <= to; n++) {
      const start = Math.max(from, n * period), end = Math.min(to, n * period + length)
      if (start > end || (start === to && i < points.length - 1)) continue
      if (n !== activeDash) {
        if (run.length) draw(run)
        run = []
        activeDash = n
      }
      run.push(at(start))
      if (end > start) run.push(at(end))
    }
  }
  if (run.length) draw(run)
  return paths.join('')
}

export function dashedObjectContour(object) {
  const points = object.sampled ? object.points : samplePenCurve(object.points, object.inkStartDistance ?? 0)
  return dashedContour(points, object.strokeWidth, object.penKind)
}

const previews = new WeakMap()
export function dashedPreviewContour(part, width, kind) {
  const key = width + ':' + kind
  const cached = previews.get(part)
  if (cached?.key === key) return cached.path
  const path = dashedContour(samplePenPart(part), width, kind)
  if (part.continuing) previews.set(part, { key, path })
  return path
}
