import test from 'node:test'
import assert from 'node:assert/strict'
import { createStrokeRasterQueue } from '../src/editor/utils/strokeRasterQueue.js'

function setup(options = {}) {
  let time = 0, sequence = 0
  const timers = new Map()
  const queue = createStrokeRasterQueue({ ...options, now: () => time,
    setTimer: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: time + delay }); return id },
    clearTimer: id => timers.delete(id) })
  const advance = duration => {
    const end = time + duration
    while (true) {
      const candidate = [...timers].sort((a, b) => a[1].at - b[1].at)[0]
      if (!candidate || candidate[1].at > end) break
      timers.delete(candidate[0]); time = candidate[1].at; candidate[1].fn()
    }
    time = end
  }
  return { queue, advance }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('캐시 생성은 직렬 처리하며 필기 중에는 다음 작업을 시작하지 않는다', async () => {
  const { queue, advance } = setup(), starts = []
  let finish
  queue.enqueue(() => { starts.push('a'); return { done: new Promise(resolve => { finish = resolve }) } })
  queue.enqueue(() => { starts.push('b'); return { done: Promise.resolve() } })
  advance(0); assert.deepEqual(starts, ['a'])
  queue.pause(); finish(); await flush(); advance(1000)
  assert.deepEqual(starts, ['a'])
  queue.resume(); advance(179); assert.deepEqual(starts, ['a'])
  advance(1); assert.deepEqual(starts, ['a', 'b'])
})

test('문서 변경·언마운트는 대기/진행 작업을 취소하고 실패 후에도 다음 작업은 실행된다', async () => {
  const { queue, advance } = setup(), starts = []
  let finish, cancelled = 0
  queue.enqueue(() => ({ done: new Promise(resolve => { finish = resolve }), cancel: () => { cancelled++; finish() } }))
  const cancel = queue.enqueue(() => { starts.push('stale') })
  advance(0); cancel(); queue.clear(); await flush(); advance(1000)
  assert.equal(cancelled, 1); assert.deepEqual(starts, [])
  queue.enqueue(() => { throw Error('unsupported SVG') })
  queue.enqueue(() => { starts.push('recovered') })
  advance(0); await flush(); advance(0)
  assert.deepEqual(starts, ['recovered'])
})


test('진행 중 이미지 대기는 입력 시작에 취소하고 유휴 시간 뒤 새 작업으로 재시도한다', async () => {
  const { queue, advance } = setup()
  let attempts = 0, aborts = 0, resolve
  queue.enqueue(() => { attempts++; return { done: new Promise(r => { resolve = r }), cancel() { aborts++; resolve() } } })
  advance(0); queue.pause(); queue.pause(); await flush(); advance(500)
  assert.equal(attempts, 1); assert.equal(aborts, 1)
  queue.resume(); advance(179); assert.equal(attempts, 1)
  advance(1); assert.equal(attempts, 2)
  queue.pause(); queue.clear(); await flush(); queue.resume(); advance(1000)
  assert.equal(attempts, 2)
})


test('백그라운드 캐시 사이에 입력과 화면 처리 시간을 둔다', async () => {
  const { queue, advance } = setup({ minGapMs: 16 }), starts = []
  queue.enqueue(() => { starts.push('a'); return { done: Promise.resolve() } })
  queue.enqueue(() => { starts.push('b'); return { done: Promise.resolve() } })
  advance(0); await flush(); advance(15); assert.deepEqual(starts, ['a'])
  advance(1); assert.deepEqual(starts, ['a', 'b'])
})
