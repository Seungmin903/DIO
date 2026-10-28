import test from 'node:test'
import assert from 'node:assert/strict'
import { createPenPreviewStore } from '../src/editor/utils/penPreviewStore.js'
import { acknowledgeStrokeDisplay } from '../src/editor/utils/strokeDisplayHandoff.js'

test('미리보기 구독자만 갱신하고 같은 스냅샷은 중복 통지하지 않는다', () => {
  const store = createPenPreviewStore(), seen = []
  const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot()))
  const frame = { parts: [], settings: { kind: 'fountain' } }
  assert.equal(store.getSnapshot(), null)
  store.publish(frame); store.publish(frame); store.publish(null)
  assert.deepEqual(seen, [frame, null])
  unsubscribe(); store.publish(frame)
  assert.deepEqual(seen, [frame, null])
})

test('입력 영역별 미리보기는 페이지·도구 전환 뒤 다른 입력과 섞이지 않는다', () => {
  const a = createPenPreviewStore(), b = createPenPreviewStore()
  a.publish({ parts: ['a'] })
  assert.equal(b.getSnapshot(), null)
  b.publish({ parts: ['b'] }); a.publish(null)
  assert.deepEqual(b.getSnapshot(), { parts: ['b'] })
})

test('확정 화면 커밋까지 이전 획을 유지하고 새 획과 별개로 인계한다', () => {
  const store = createPenPreviewStore(), reasons = []
  const a = { strokeId: 'handoff-a', parts: ['a'] }, b = { strokeId: 'handoff-b', parts: ['b'] }
  store.publish(a); store.hold(a, reason => reasons.push(reason))
  assert.equal(store.getSnapshot(), null)
  assert.deepEqual(store.getPendingSnapshot(), [a])
  store.publish(b)
  acknowledgeStrokeDisplay(a.strokeId)
  assert.equal(store.getSnapshot(), b)
  assert.deepEqual(store.getPendingSnapshot(), [])
  assert.deepEqual(reasons, ['committed'])
  store.hold(b, reason => reasons.push(reason)); store.clearPending()
  acknowledgeStrokeDisplay(b.strokeId)
  assert.deepEqual(store.getPendingSnapshot(), [])
  assert.deepEqual(reasons, ['committed', 'cancelled'])
})

test('연속 두 획의 화면 커밋 순서가 바뀌어도 각 획만 해제한다', () => {
  const store = createPenPreviewStore()
  const a = { strokeId: 'out-of-order-a' }, b = { strokeId: 'out-of-order-b' }
  store.hold(a); store.hold(b)
  acknowledgeStrokeDisplay(b.strokeId)
  assert.deepEqual(store.getPendingSnapshot(), [a])
  acknowledgeStrokeDisplay(a.strokeId)
  assert.deepEqual(store.getPendingSnapshot(), [])
})
