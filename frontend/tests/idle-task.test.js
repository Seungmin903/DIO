import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduleIdleTask } from '../src/editor/utils/idleTask.js'

for (const mode of ['idle', 'timeout', 'unsupported', 'cancel']) {
  test(`자동 저장 유휴 예약: ${mode}`, () => {
    let timer, idle, count = 0
    const cleared = []
    const host = {
      setTimeout(fn, delay) { timer = fn; assert.equal(delay, 1000); return 1 },
      clearTimeout(id) { cleared.push(id) },
      ...(mode === 'unsupported' ? {} : {
        requestIdleCallback(fn, options) { idle = fn; assert.equal(options.timeout, 1000); return 0 },
        cancelIdleCallback(id) { cleared.push(id) },
      }),
    }
    const task = scheduleIdleTask(() => count++, 1000, host)
    if (mode === 'cancel') task.cancel()
    if (mode === 'idle') idle()
    timer()
    idle?.()
    assert.equal(count, mode === 'cancel' ? 0 : 1)
    assert.ok(cleared.includes(1))
    if (idle) assert.ok(cleared.includes(0))
  })
}
