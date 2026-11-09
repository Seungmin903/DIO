import test from 'node:test'
import assert from 'node:assert/strict'
import { notifyTemplateLoaded, subscribeTemplateLoaded } from '../src/editor/templates/templateLoadedSignal.js'

test('속지 캐시가 채워지면 구독자 모두에게 id 를 알리고, 해제한 구독자와 오류를 낸 구독자는 다른 구독자를 막지 않는다', () => {
  const seen = []
  const off = subscribeTemplateLoaded(id => seen.push(['a', id]))
  subscribeTemplateLoaded(() => { throw new Error('boom') })
  const offB = subscribeTemplateLoaded(id => seen.push(['b', id]))
  notifyTemplateLoaded('monthly')
  assert.deepEqual(seen, [['a', 'monthly'], ['b', 'monthly']])
  off()
  notifyTemplateLoaded('weekly')
  assert.deepEqual(seen.at(-1), ['b', 'weekly'])
  offB()
  notifyTemplateLoaded('daily')
  assert.equal(seen.length, 3)
})
