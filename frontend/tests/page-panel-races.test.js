import test from 'node:test'
import assert from 'node:assert/strict'
import { createPageCloseScheduler } from '../src/editor/utils/pageCloseScheduler.js'
import { hasUnseenThumbnailObjects, revealThumbnailObjects, visibleThumbnailObjects } from '../src/editor/utils/thumbnailProgress.js'

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

test('썸네일은 이미 보인 요소를 바뀌거나 중간이 지워져도 유지하고 새 요소만 나눠 보탠다', () => {
  const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id }))
  const shown = new Set(['a', 'b', 'c'])
  assert.deepEqual(visibleThumbnailObjects([a, b, c, d], shown).map(o => o.id), ['a', 'b', 'c'], '새 요소는 아직 안 보인다')
  assert.deepEqual(visibleThumbnailObjects([a, c, d], shown).map(o => o.id), ['a', 'c'], '중간 요소가 지워져도 나머지는 그대로')
  assert.deepEqual(visibleThumbnailObjects([a, { id: 'b', x: 1 }, c], shown).map(o => o.id), ['a', 'b', 'c'], '내용이 바뀐 요소도 그대로 보인다')
  assert.deepEqual([...revealThumbnailObjects([a, b, c, d, e], shown, 1)], ['a', 'b', 'c', 'd'], '새 요소는 앞에서부터 count 개')
  assert.deepEqual([...revealThumbnailObjects([a, c, d, e], shown, 3)], ['a', 'c', 'd', 'e'], '사라진 id 는 버린다')
  assert.equal(hasUnseenThumbnailObjects([a, b, c], shown), false)
  assert.equal(hasUnseenThumbnailObjects([a, b, d], shown), true)
  assert.deepEqual(visibleThumbnailObjects([d, e], shown), [], '전부 바뀌면 처음부터 나눠 그린다')
})
