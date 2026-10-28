import test from 'node:test'
import assert from 'node:assert/strict'
import { samplePenCurve, samplePenPart, createStroke } from '../src/editor/utils/strokes.js'
import { createStrokePreview } from '../src/editor/utils/strokePreview.js'
import { feltMaterialLayers } from '../src/editor/utils/penMaterials.js'
import { inkPaths } from '../src/editor/utils/penInk.js'

const points = Array.from({ length: 250 }, (_, i) => ({ x: 30 + i * 2.2, y: 60 + Math.sin(i * 0.4) * 18,
  pressure: 0.6 + 0.35 * Math.cos(i * 0.3), force: i / 250, speed: 0.4, time: i * 4,
  tiltX: 12, tiltY: 24, inkDistance: i * 2.2 }))

test('곡선 표본은 원본 센서·필압·저장 기록을 보존하고 실제 곡률을 만든다', () => {
  const source = points.slice(0, 5), before = JSON.stringify(source)
  const samples = samplePenCurve(source)
  assert.ok(samples.length > source.length)
  const a = source[0], b = source[1], p = samples[1]
  assert.ok(Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) > 0.01)
  const t = p.inkDistance / b.inkDistance
  assert.ok(Math.abs(p.pressure - (a.pressure + (b.pressure - a.pressure) * t)) < 1e-12)
  assert.ok(Math.abs(p.force - (a.force + (b.force - a.force) * t)) < 1e-12)
  assert.equal(p.tiltX, 12)
  assert.deepEqual(samples.at(-1), source.at(-1))
  assert.equal(JSON.stringify(source), before)
  const object = createStroke(source, { id: 'curve', renderVersion: 3, materialSeed: 42 })
  assert.deepEqual(JSON.parse(JSON.stringify(object)), object)
})

test('분할 경계 문맥이 완성 곡선과 같고 완성 구간·재질 캐시를 재사용한다', () => {
  const mutable = points.slice(0, 198), preview = createStrokePreview()
  const parts = preview.snapshot(mutable), all = samplePenCurve(mutable)
  for (const part of parts) for (const p of samplePenPart(part)) {
    assert.ok(all.some(q => Math.abs(p.inkDistance - q.inkDistance) < 1e-8 && Math.abs(p.x - q.x) < 1e-8 && Math.abs(p.y - q.y) < 1e-8))
  }
  const cached = inkPaths(parts[0], 16, 'fountain', false, 3)
  const felt = feltMaterialLayers([parts[0]], 16, 101)
  mutable.push(...points.slice(198))
  const next = preview.snapshot(mutable)
  assert.strictEqual(next[0], parts[0])
  assert.strictEqual(inkPaths(next[0], 16, 'fountain', false, 3), cached)
  assert.deepEqual(feltMaterialLayers([next[0]], 16, 101), felt)
})

test('중복점·탭·장거리 입력도 유한하며 샘플 예산을 넘지 않는다', () => {
  assert.deepEqual(samplePenCurve([]), [])
  assert.equal(samplePenCurve([{ x: 1, y: 1 }]).length, 1)
  const result = samplePenCurve([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100000, y: 0 }])
  assert.ok(result.length <= 514)
  assert.ok(result.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.inkDistance)))
})
