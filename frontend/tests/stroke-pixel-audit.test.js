import test from 'node:test'
import assert from 'node:assert/strict'
import { compareStrokeAlpha } from '../src/editor/utils/strokePixelAudit.js'
import { createPenPointerInput } from '../src/editor/utils/penPointerInput.js'

test('겹친 획의 알파는 허용하되 캐시 중 개별 획 픽셀 누락은 검출한다', () => {
  const rgba = values => Uint8Array.from(values.flatMap(alpha => [0, 0, 0, alpha]))
  assert.deepEqual(compareStrokeAlpha(rgba([100, 255, 8]), rgba([180, 250, 0])), { expectedPixels: 2, missingPixels: 0 })
  assert.deepEqual(compareStrokeAlpha(rgba([100, 255]), rgba([0, 255])), { expectedPixels: 2, missingPixels: 1 })
  assert.throws(() => compareStrokeAlpha(rgba([255]), rgba([])))
})

test('자식 요소의 offset과 관계없이 소유 입력 영역·CSS 배율로 시작/이동 좌표를 계산한다', () => {
  const starts = [], moves = []
  const pointer = createPenPointerInput(() => ({ onStart: e => starts.push(e), onMove: (_dx, _dy, e) => moves.push(e) }))
  const currentTarget = { getBoundingClientRect: () => ({ left: 100, top: 200, width: 400, height: 200 }),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ width: '200px', height: '100px' }) } } }
  const event = { pointerType: 'pen', pointerId: 8, button: 0, clientX: 200, clientY: 260,
    offsetX: 1, offsetY: 2, pressure: 0.5, timeStamp: 1 }
  pointer.handlers.onPointerDown({ nativeEvent: event, currentTarget })
  assert.equal(starts[0].locationX, 50); assert.equal(starts[0].locationY, 30)
  assert.equal(starts[0].coordinateBasis, 'owner-view')
  pointer.handlers.onPointerMove({ nativeEvent: { ...event, clientX: 240, clientY: 280, offsetX: 999, timeStamp: 2 }, currentTarget })
  assert.equal(moves[0].locationX, 70); assert.equal(moves[0].locationY, 40)
  pointer.cancel()
})
