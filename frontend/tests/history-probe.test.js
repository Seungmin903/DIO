import test from 'node:test'
import assert from 'node:assert/strict'
import { createHistoryProbe } from '../qa/history-probe.js'

test('지연된 commit 전에는 기록하지 않고 연타·늦은 동일 버튼은 한 번만 실행한다', async () => {
  let calls = 0
  const a = {}, b = {}, c = {}
  let current = { doc: c, past: 2, future: 0, undo() { calls++ }, redo() { calls++ } }
  const probe = createHistoryProbe({ getController: () => current })
  probe.prime()
  const first = probe.run('undo', 'u1')
  assert.equal(await probe.run('undo', 'u2'), null)
  probe.commit(current)
  assert.equal(probe.getStage(), 'busy')
  current = { ...current, doc: b, past: 1, future: 1 }
  probe.commit(current)
  const undo = await first
  assert.equal(undo.oneStep, true); assert.equal(undo.doc, b)
  assert.equal(await probe.run('undo', 'stale-u'), null)
  assert.equal(calls, 1)
  const redo = probe.run('redo', 'r1')
  assert.equal(await probe.run('redo', 'r2'), null)
  current = { ...current, doc: c, past: 2, future: 0 }; probe.commit(current)
  assert.equal((await redo).oneStep, true); assert.equal(calls, 2)
})
test('두 단계 이동은 성공으로 처리하지 않는다', async () => {
  let state = { doc: {}, past: 2, future: 0, undo() {} }
  const probe = createHistoryProbe({ getController: () => state })
  probe.prime(); const result = probe.run('undo', 'bad')
  probe.commit({ doc: {}, past: 0, future: 2 })
  assert.equal((await result).oneStep, false); assert.equal(probe.getStage(), 'error')
})
