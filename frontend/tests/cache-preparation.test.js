import test from 'node:test'
import assert from 'node:assert/strict'
import { createCachePreparationGate } from '../qa/cache-preparation.js'
import { createStrokeRasterQueue } from '../src/editor/utils/strokeRasterQueue.js'

test('미준비는 작업을 보존한 채 멈추고 명시 해제 후 같은 큐를 실행한다', async () => {
  const gate = createCachePreparationGate(0), starts = []
  const queue = createStrokeRasterQueue({ idleMs: 0, canStart: gate.canStart })
  const unsubscribe = gate.subscribe(() => queue.resume())
  queue.enqueue(() => { starts.push(1); gate.complete(); return { done: Promise.resolve() } })
  await new Promise(r => setTimeout(r, 20))
  assert.deepEqual(starts, [])
  gate.release(); await new Promise(r => setTimeout(r, 20))
  assert.deepEqual(starts, [1]); assert.equal(gate.snapshot().completed, 1)
  unsubscribe(); queue.clear()
})
test('부분 준비는 성공 묶음 예산만큼 진행하고 나머지는 해제 후 진행한다', async () => {
  const gate = createCachePreparationGate(2), starts = []
  const queue = createStrokeRasterQueue({ idleMs: 0, canStart: gate.canStart })
  const unsubscribe = gate.subscribe(() => queue.resume())
  for (let i = 0; i < 4; i++) queue.enqueue(() => { starts.push(i); gate.complete(); return { done: Promise.resolve() } })
  await new Promise(r => setTimeout(r, 30))
  assert.deepEqual(starts, [0, 1]); assert.equal(gate.canStart(), false)
  gate.release(); await new Promise(r => setTimeout(r, 30))
  assert.deepEqual(starts, [0, 1, 2, 3]); unsubscribe(); queue.clear()
})
