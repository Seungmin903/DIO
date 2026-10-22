import test from 'node:test'
import assert from 'node:assert/strict'
import { createPenPreviewStore } from '../src/editor/utils/penPreviewStore.js'

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
