import { penPressure } from './penSettings.js'
import { createStroke, PEN_MATERIAL_RENDER_VERSION } from './strokes.js'

// 견본에도 실제 연필과 같은 누적 거리를 넣어 Skia 렌더러를 사용한다.
export function createPenSample(settings, small = false) {
  const k = small ? 0.2 : 0.95
  let distance = 0, previous
  const points = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40, wave = Math.sin(t * Math.PI * 2)
    const x = small ? 4 + t * 40 : (12 + t * 240) * k
    const y = small ? 13 + wave * 5 : (settings.kind === 'highlighter' ? 24 : 24 + wave * 12) * k
    if (previous) distance += Math.hypot(x - previous.x, y - previous.y)
    previous = { x, y }
    return { x, y, pressure: penPressure(settings.kind, 0.5 + Math.sin(t * Math.PI) * 1.1), ...(settings.kind === 'pencil' && { inkDistance: distance }) }
  })
  return createStroke(points, { ...settings, width: settings.width * k,
    ...(settings.kind === 'pencil' && { renderVersion: PEN_MATERIAL_RENDER_VERSION, materialSeed: 0, opacity: 1 }) })
}
