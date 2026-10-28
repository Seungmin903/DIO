import test from 'node:test'
import assert from 'node:assert/strict'
import { createStrokePreview, PREVIEW_SEGMENT_POINTS, previewGeometry } from '../src/editor/utils/strokePreview.js'
import { createHighlighterHold, STRAIGHT_HOLD_MS } from '../src/editor/utils/strokeAssist.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { inkPaths, inkOpacity } from '../src/editor/utils/penInk.js'

test('긴 획은 모든 좌표를 보존하며 완성 구간을 재사용하고 꼬리 길이를 제한한다', () => {
  const buffer = createStrokePreview(), points = [], cached = new Map()
  let visits = 0
  for (let i = 0; i < 10000; i++) {
    points.push({ x: i / 3, y: Math.sin(i / 8) * 50, pressure: 0.8 })
    if (i % 8) continue
    const parts = buffer.snapshot(points)
    for (const part of parts) {
      assert.ok(part.points.length <= PREVIEW_SEGMENT_POINTS + 3, '연필 클립을 포함해 각 구간은 문맥점을 더해도 99점 이하')
      assert.ok(part.points.length <= PREVIEW_SEGMENT_POINTS + 3)
      if (part.continuing && cached.has(part.key)) assert.equal(part, cached.get(part.key))
      else visits += part.points.length
      if (part.continuing) cached.set(part.key, part)
    }
  }
  assert.ok(visits < 10000 * 15, `처리 좌표 ${visits}개`)
  assert.equal(points.length, 10000)
  const parts = buffer.snapshot(points)
  assert.equal(parts[0].points[0], points[0])
  assert.equal(parts.at(-1).points.at(-1), points.at(-1))
  for (const point of points) assert.ok(parts.some(part => part.points.includes(point)))
  const saved = createStroke(points, { kind: 'brush', width: 8 })
  assert.equal(saved.points.length, points.length)
  saved.points.forEach((point, i) => {
    assert.ok(Math.abs(point.x + saved.x - points[i].x) < 1e-8)
    assert.ok(Math.abs(point.y + saved.y - points[i].y) < 1e-8)
  })
})

test('직선 보정·자유곡선 복귀 시 오래된 구간이 섞이지 않는다', () => {
  const buffer = createStrokePreview()
  const raw = Array.from({ length: 500 }, (_, x) => ({ x, y: Math.sin(x), pressure: 1 }))
  assert.ok(buffer.snapshot(raw).length > 1)
  const line = [raw[0], raw.at(-1)]
  assert.equal(buffer.snapshot(line).length, 1)
  assert.deepEqual(buffer.snapshot(raw).flatMap(p => p.points).filter(p => p === raw[200]), [raw[200]])
})

test('먼 좌표에서도 윤곽과 실제 잉크 경로의 보간 표본 수를 제한하며 거리별 농도는 유지한다', () => {
  const points = [{ x: 0, y: 0, pressure: 1 }, { x: 100000, y: 0, pressure: 1 }]
  for (const kind of ['fountain', 'brush']) {
    const { outline } = previewGeometry({ points, startDistance: 100, continuing: true }, { kind, width: 8 })
    assert.ok(outline.length < 200000)
    assert.doesNotMatch(outline, /NaN|Infinity/)
    const paths = inkPaths({ points, startDistance: 100, continuing: true }, 8, kind)
    assert.ok((paths[0].match(/M/g) || []).length <= 516, '실제 잉크 경로에서 최대 약 512개 보간 구간만 생성한다')
    assert.ok(paths.every(path => !/NaN|Infinity/.test(path)))
  }
  const local = [{ x: 10, y: 0, pressure: 1 }, { x: 20, y: 0, pressure: 1 }]
  assert.ok(inkOpacity('brush', 100) > inkOpacity('brush', 400), '누적 거리의 효과는 윤곽이 아닌 잉크 농도에서 검증한다')
  for (const kind of ['ball', 'fountain', 'brush', 'pencil', 'highlighter']) {
    assert.ok(previewGeometry({ points: [local[0]] }, { kind, width: 8 }).path)
  }
})

test('JS 지연으로 늦게 도착한 직선 타이머는 재확인하며 정상적인 끝점 유지는 보존한다', () => {
  let time = 0, callback, straight = 0
  const hold = createHighlighterHold({ start: { x: 0, y: 0 }, zoom: 1, now: () => time,
    schedule(fn) { callback = fn; return 1 }, unschedule() { callback = null }, onStraight() { straight++ } })
  hold.move({ x: 100, y: 50 })
  time = 2000; callback()
  assert.equal(straight, 0)
  hold.move({ x: 150, y: 100 })
  time += STRAIGHT_HOLD_MS; callback()
  assert.equal(straight, 1)
  hold.cancel()
})
