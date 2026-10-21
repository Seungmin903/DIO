import test from 'node:test'
import assert from 'node:assert/strict'
import { createHighlighterHold, snapStraightEnd, STRAIGHT_HOLD_MS } from '../src/editor/utils/strokeAssist.js'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)

test('직선 끝점이 수평·수직 ±5° 안이면 길이를 유지한 채 그 축에 붙는다', () => {
  const start = { x: 100, y: 100 }
  for (const [deg, axis] of [[3, 0], [-4, 0], [88, 90], [183, 180], [-92, -90], [272, 270]]) {
    const rad = (deg * Math.PI) / 180
    const end = snapStraightEnd(start, { x: 100 + Math.cos(rad) * 80, y: 100 + Math.sin(rad) * 80, pressure: 0.5 })
    const a = (axis * Math.PI) / 180
    near(end.x, 100 + Math.round(Math.cos(a)) * 80)
    near(end.y, 100 + Math.round(Math.sin(a)) * 80)
    assert.equal(end.pressure, 0.5)
  }
  const free = { x: 100 + Math.cos(Math.PI / 12) * 80, y: 100 + Math.sin(Math.PI / 12) * 80 } // 15°
  assert.deepEqual(snapStraightEnd(start, free), free)
})

test('끝점을 꾹 눌러 직선이 된 뒤 돌리면 수평·수직에서 걸린다', () => {
  let timer = null
  const lines = []
  const hold = createHighlighterHold({ start: { x: 0, y: 0 }, zoom: 1, onStraight: (points) => lines.push(points),
    schedule: (callback) => { timer = callback; return 1 }, unschedule: () => { timer = null } })
  hold.move({ x: 100, y: 3 })
  timer()
  assert.deepEqual(lines[0][1], { x: 100.04498987955368, y: 0 })
  hold.move({ x: 60, y: 60 })
  assert.deepEqual(lines.at(-1)[1], { x: 60, y: 60 })
  hold.move({ x: 2, y: 90 })
  near(lines.at(-1)[1].x, 0)
  assert.ok(STRAIGHT_HOLD_MS > 0)
})
