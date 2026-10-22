import { performance } from 'node:perf_hooks'
import { createStroke, penContour, strokePath } from '../src/editor/utils/strokes.js'
import { createStrokePreview, previewGeometry } from '../src/editor/utils/strokePreview.js'

const samples = Array.from({ length: 5000 }, (_, i) => ({ x: 50 + i / 8, y: 200 + Math.sin(i / 14) * 50, pressure: 0.8 + Math.sin(i / 40) * 0.2 }))
function measure(kind, incremental) {
  const settings = { kind, width: 8 }, buffer = createStrokePreview(), points = [], cached = new Set()
  let visited = 0, frames = 0, checksum = 0
  const start = performance.now()
  for (let i = 0; i < samples.length; i++) {
    points.push(samples[i])
    if ((i + 1) % 8) continue
    frames++
    if (incremental) {
      for (const part of buffer.snapshot(points)) {
        if (cached.has(part)) continue
        visited += part.points.length
        const geometry = previewGeometry(part, settings)
        checksum += (geometry.outline ?? geometry.path).length
        if (part.continuing) cached.add(part)
      }
    } else {
      visited += points.length
      const object = createStroke(points, settings)
      checksum += penContour(object.points, settings.width, kind).length + strokePath(object.points).length
    }
  }
  return { milliseconds: Math.round((performance.now() - start) * 100) / 100, inputPoints: points.length, frames, visited, checksum }
}
// JS 좌표 변환·윤곽 문자열 생성만 비교한다. React·SVG 그리기·기기 입력 지연은 포함하지 않는다.
for (const kind of ['fountain', 'brush']) {
  measure(kind, true)
  const before = measure(kind, false), after = measure(kind, true)
  console.log(JSON.stringify({ kind, before, after, timeRatio: +(before.milliseconds / after.milliseconds).toFixed(2), pointReductionPercent: +((1 - after.visited / before.visited) * 100).toFixed(2) }))
}
