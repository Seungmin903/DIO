import test from 'node:test'
import assert from 'node:assert/strict'
import { reachOf, reachTouches, removedBetween, sameObjects } from '../src/editor/skia/bakeDelta.js'

const o = id => ({ id, x: 0, y: 0, w: 10, h: 10 })

test('지우개로 획이 빠진 같은 순서의 목록만 빠진 획을 돌려준다', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(o)
  assert.deepEqual(removedBetween([a, b, c, d], [a, c]), [b, d])
  assert.deepEqual(removedBetween([a, b, c, d], [b, c, d]), [a])
  assert.equal(removedBetween([a, b, c], [a, b, c]), null, '바뀐 것이 없으면 null')
  assert.equal(removedBetween([a, b, c], [a, b, c, d]), null, '추가는 다시 굽는다')
  assert.equal(removedBetween([a, b, c], [a, { ...b }, c]), null, '교체는 다시 굽는다')
  assert.equal(removedBetween([a, b, c], [c, b]), null, '순서가 바뀌면 다시 굽는다')
  assert.deepEqual(removedBetween([a, b], []), [a, b])
})

test('획이 칠한 범위는 회전해도 벗어나지 않는 원이고 겹치지 않는 먼 획은 건드리지 않는다', () => {
  const near = reachOf({ x: 0, y: 0, w: 40, h: 30 }), far = reachOf({ x: 500, y: 500, w: 40, h: 30 })
  assert.equal(near.x, 20)
  assert.ok(near.r >= Math.hypot(40, 30) / 2)
  assert.equal(reachTouches(near, reachOf({ x: 30, y: 10, w: 40, h: 30 })), true)
  assert.equal(reachTouches(near, far), false)
})

test('같은 참조의 목록만 같다고 본다', () => {
  const [a, b] = [o('a'), o('b')]
  assert.equal(sameObjects([a, b], [a, b]), true)
  assert.equal(sameObjects([a, b], [a, { ...b }]), false)
  assert.equal(sameObjects([a], [a, b]), false)
})
