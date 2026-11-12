import test from 'node:test'
import assert from 'node:assert/strict'
import { TASTING_ID, tastingMarksForStroke } from '../src/editor/templates/tastingGeometry.js'

test('한 획이 지나간 별만 채울 대상으로 반환한다', () => {
  assert.deepEqual(tastingMarksForStroke(TASTING_ID, [{ x: 450, y: 298 }, { x: 600, y: 298 }]), ['star-0', 'star-1', 'star-2'])
})

test('다른 속지와 도형 바깥의 필기는 처리하지 않는다', () => {
  assert.deepEqual(tastingMarksForStroke('other', [{ x: 450, y: 298 }, { x: 600, y: 298 }]), [])
  assert.deepEqual(tastingMarksForStroke(TASTING_ID, [{ x: 430, y: 340 }, { x: 700, y: 340 }]), [])
  assert.deepEqual(tastingMarksForStroke(TASTING_ID, [{ x: 350, y: 298 }, { x: 740, y: 298 }]), [])
})

test('방문 선택 원은 지나간 원만 판정한다', () => {
  assert.deepEqual(tastingMarksForStroke(TASTING_ID, [{ x: 190, y: 379 }, { x: 205, y: 379 }]), ['visit-0'])
})
