import test from 'node:test'
import assert from 'node:assert/strict'
import { createPhotoDecodeQueue } from '../src/editor/utils/photoDecodeQueue.js'

test('가까운 사진부터 한 장씩 교체하고 취소된 작업을 건너뛴다', () => {
  const scheduled = []
  const enqueue = createPhotoDecodeQueue(run => scheduled.push(run))
  const started = []
  const releaseFar = enqueue(() => started.push('far'), 20)
  const releaseNear = enqueue(() => started.push('near'), 5)
  const cancelMiddle = enqueue(() => started.push('middle'), 10)
  scheduled.shift()()
  assert.deepEqual(started, ['near'])
  assert.equal(scheduled.length, 0)
  cancelMiddle()
  releaseNear()
  scheduled.shift()()
  assert.deepEqual(started, ['near', 'far'])
  releaseFar()
})
