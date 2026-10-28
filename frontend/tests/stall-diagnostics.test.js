import test from 'node:test'
import assert from 'node:assert/strict'
import { createStallDiagnostics } from '../qa/stall-diagnostics.js'
test('획 사이의 프레임 정지도 수집하고 오래된 기록과 좌표·문자열은 제외한다', () => {
  let time = 0
  const d = createStallDiagnostics({ now: () => time, limit: 3 })
  d.frame(0); d.frame(17); time = 220; d.frame(time)
  d.input({ event: 'touchstart', touchType: 'stylus', area: 'pen-input', x: 123, text: 'private', target: {} })
  const report = d.snapshot()
  assert.equal(report.frameGaps[0].gapMs, 203)
  assert.equal('x' in report.inputArrivals[0], false); assert.equal('text' in report.inputArrivals[0], false)
  assert.equal(report.inputArrivals[0].touchType, 'stylus')
  time = 9000; assert.equal(d.snapshot().frameGaps.length, 0)
  d.resetFrame(); d.frame(time); assert.equal(d.snapshot().frameGaps.length, 0)
})
