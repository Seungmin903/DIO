import { createStroke } from '../src/editor/utils/strokes.js'
import { penPressure } from '../src/editor/utils/penSettings.js'
import { penMaterialSeed } from '../src/editor/utils/penMaterials.js'

export const PERF_CASES = [
  { id: 'baseline', label: '10획', count: 10, points: 128 },
  { id: '100', label: '100획', count: 100, points: 128 },
  { id: '300', label: '300획', count: 300, points: 128 },
  { id: 'long30', label: '긴획 30', count: 30, points: 1000 },
  { id: 'long100', label: '긴획 100', count: 100, points: 1000 },
]
export function performanceDoc(testCase, kind) {
  const objects = []
  for (let n = 0; n < testCase.count; n++) {
    const long = testCase.points === 1000
    const columns = long ? 2 : 14, rows = Math.ceil(testCase.count / columns)
    const points = []
    let travelled = 0
    for (let i = 0; i < testCase.points; i++) {
      const t = i / (testCase.points - 1), force = 0.2 + 0.6 * Math.sin(t * Math.PI)
      const point = { x: 40 + n % columns * (long ? 540 : 78) + t * (long ? 480 : 52),
        y: 75 + Math.floor(n / columns) * Math.min(35, 650 / rows) + Math.sin(t * Math.PI * (long ? 6 : 2)) * (long ? 4 : 7),
        pressure: penPressure(kind, 0.4, force), force, speed: 0.4, time: i * 4 }
      const previous = points.at(-1)
      if (previous) travelled += Math.hypot(point.x - previous.x, point.y - previous.y)
      point.inkDistance = travelled; points.push(point)
    }
    const id = `perf-${kind}-${testCase.id}-${n}`
    objects.push(createStroke(points, { id, kind, width: 4, color: '#1D1D1F',
      renderVersion: kind === 'brush' ? 2 : 3, materialSeed: penMaterialSeed(id) }))
  }
  return { id: 'performance-qa', title: '필기 성능 QA', pages: [{ id: 'performance-page', canvasWidth: 1188, canvasHeight: 840, objects }] }
}
