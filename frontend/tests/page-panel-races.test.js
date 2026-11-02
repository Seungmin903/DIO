import test from 'node:test'
import assert from 'node:assert/strict'
import { createPageCloseScheduler } from '../src/editor/utils/pageCloseScheduler.js'
import { reusableThumbnailPrefix } from '../src/editor/utils/thumbnailProgress.js'

test('닫기 두 프레임 사이 화면 전환 또는 재열기 시 이전 폭 복원은 실행되지 않는다', () => {
  let serial = 0, completed = 0
  const callbacks = new Map(), all = new Map()
  const scheduler = createPageCloseScheduler({ request: cb => { const id = ++serial; callbacks.set(id, cb); all.set(id, cb); return id }, cancel: id => callbacks.delete(id) })
  const flush = () => { const [id, cb] = callbacks.entries().next().value; callbacks.delete(id); cb() }
  scheduler.start(() => completed++)
  assert.equal(scheduler.pending(), true)
  flush()
  const stale = [...callbacks.keys()][0]
  scheduler.cancel()
  all.get(stale)()
  assert.equal(completed, 0)
  assert.equal(scheduler.pending(), false)
  scheduler.start(() => completed++)
  flush(); flush()
  assert.equal(completed, 1)
  assert.equal(scheduler.pending(), false)
})

test('연속 추가는 표시된 앞부분을 유지하고 변경·삭제된 부분부터만 다시 표시한다', () => {
  const a = {}, b = {}, c = {}, d = {}
  assert.equal(reusableThumbnailPrefix([a,b,c], [a,b,c,d], 3), 3)
  assert.equal(reusableThumbnailPrefix([a,b,c], [a,b,c,d], 2), 2)
  assert.equal(reusableThumbnailPrefix([a,b,c], [a,{},c], 3), 1)
  assert.equal(reusableThumbnailPrefix([{ id: 'a' }, { id: 'b' }], [{ id: 'a', x: 1 }, { id: 'b' }], 2), 2)
  assert.equal(reusableThumbnailPrefix([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'a' }], 2), 0)
  assert.equal(reusableThumbnailPrefix([a,b,c], [a], 3), 1)
  assert.equal(reusableThumbnailPrefix([a,b,c], [], 3), 0)
})
