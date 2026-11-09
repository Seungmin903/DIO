import { penSweeps, samplePenCurve, samplePenPart } from './strokes.js'

export const DASH_TYPES = [{ id: 'dashed', label: '짧은 선' }, { id: 'dotted', label: '둥근 점' }]
export const isDashedKind = kind => kind === 'dashed' || kind === 'dotted'

export const DASH_LENGTH_RANGE = { min: 1, max: 8 }
export const DASH_GAP_RANGE = { min: 0.5, max: 8 }
const clampRatio = (value, { min, max }, fallback) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback

// The values describe visible length and edge-to-edge gap, in stroke widths.
export function dashPattern(kind, { dashLength, dashGap } = {}) {
  const dotted = kind === 'dotted'
  return {
    dashLength: clampRatio(dashLength, DASH_LENGTH_RANGE, dotted ? 1 : 3),
    dashGap: clampRatio(dashGap, DASH_GAP_RANGE, dotted ? 2.5 : 1.5),
  }
}

// Distances belong to the original stroke so eraser fragments keep their phase.
export function dashedContour(points, width, kind, options) {
  if (!points.length || !(width > 0)) return ''
  const { dashLength, dashGap } = dashPattern(kind, options)
  const period = width * (dashLength + dashGap)
  // Round caps account for one stroke width of the visible length.
  const length = width * (dashLength - 1)
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

// A straightened stroke has two endpoints, but its tip can still carry the
// distance travelled by the pointer before snapping or dragging back.
function straightDashPoints(points, startDistance) {
  if (points.length !== 2) return points
  const [start, end] = points
  return [
    { ...start, inkDistance: startDistance },
    { ...end, inkDistance: startDistance + Math.hypot(end.x - start.x, end.y - start.y) },
  ]
}

export function dashedObjectSamples(object) {
  if (object.sampled) return object.points
  const startDistance = object.inkStartDistance ?? 0
  return samplePenCurve(straightDashPoints(object.points, startDistance), startDistance)
}

export function dashedObjectContour(object) {
  return dashedContour(dashedObjectSamples(object), object.strokeWidth, object.penKind, object)
}

const previews = new WeakMap()
export function dashedPreviewContour(part, width, kind, options) {
  const pattern = dashPattern(kind, options)
  const key = [width, pattern.dashLength, pattern.dashGap].join(':')
  const cached = previews.get(part)
  if (cached?.key === key) return cached.path
  const wholeStroke = !part.continuing && !part.key && !part.curveBefore
  const samples = wholeStroke && part.points.length === 2
    ? samplePenCurve(straightDashPoints(part.points, part.startDistance ?? 0))
    : samplePenPart(part)
  const path = dashedContour(samples, width, kind, pattern)
  if (part.continuing) previews.set(part, { key, path })
  return path
}
