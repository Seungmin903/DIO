import { TASTING_ID, TASTING_LANDSCAPE_ID, tastingLayout, tastingMarks, tastingReferencePoints, segmentDistance, tastingMarksForStroke } from './tastingGeometry.js'
import { TASTING_PORTRAIT_SVG, TASTING_LANDSCAPE_SVG } from './tastingReferenceSvg.js'

const safeColor = value => /^#[\da-f]{6}$/i.test(value ?? '') ? value : '#292929'
const shape = (mark, fill) => {
  if (mark.kind === 'circle') return `<circle data-preserve-paint="true" cx="${mark.x}" cy="${mark.y}" r="${mark.radius}" fill="${fill}" stroke="#767a7f" stroke-width="2.4"/>`
  const points = mark.radius === 22 ? '0,-22 6.6,-7.7 22,-7 10.3,3.5 13.6,19.5 0,12 -13.6,19.5 -10.3,3.5 -22,-7 -6.6,-7.7' : '0,-26 7.8,-9 26,-8 12,4 16,23 0,14 -16,23 -12,4 -26,-8 -7.8,-9'
  return `<polygon data-preserve-paint="true" points="${points}" transform="translate(${mark.x} ${mark.y})" fill="${fill}" stroke="#767a7f" stroke-width="2.4" stroke-linejoin="round"/>`
}

export const tastingBaseSvg = (id = TASTING_ID) => id === TASTING_LANDSCAPE_ID ? TASTING_LANDSCAPE_SVG : TASTING_PORTRAIT_SVG
export function tastingOverlaySvg(value, id = TASTING_ID) {
  const L = tastingLayout(id), fills = value?.fills ?? {}
  if (!L) return ''
  const marks = tastingMarks(id).filter(m => fills[m.id]).map(m => shape(m, safeColor(fills[m.id]))).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}"><g transform="scale(${L.width / L.sourceWidth} ${L.height / L.sourceHeight})">${marks}</g></svg>`
}
export function applyTastingStroke(value, points, settings, id = TASTING_ID) {
  const ids = tastingMarksForStroke(id, points)
  if (!ids.length) return null
  const fills = { ...(value?.fills ?? {}) }
  ids.forEach(key => { fills[key] = safeColor(settings?.color) })
  return { ...(value ?? {}), fills }
}
export function eraseTastingStroke(value, points, id = TASTING_ID) {
  if (!tastingLayout(id) || !Array.isArray(points) || !points.length || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
  const input = tastingReferencePoints(id, points)
  const ids = tastingMarks(id).filter(m => input.length === 1
    ? Math.hypot(input[0].x - m.x, input[0].y - m.y) <= m.radius
    : input.slice(1).some((point, index) => segmentDistance(input[index], point, m) <= m.radius)).map(m => m.id)
  const fills = { ...(value?.fills ?? {}) }, present = ids.filter(key => fills[key])
  if (!present.length) return null
  present.forEach(key => { delete fills[key] })
  return { ...(value ?? {}), fills }
}
export function tastingSvg(value, id = TASTING_ID) {
  return tastingBaseSvg(id).replace('</svg>', tastingOverlaySvg(value, id).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</svg>')
}
