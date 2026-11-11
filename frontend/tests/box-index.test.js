import test from 'node:test'
import assert from 'node:assert/strict'
import { INDEX_CELL, createBoxIndex, queryBoxIndex } from '../src/editor/utils/boxIndex.js'

const box = (id, left, top, w = 10, h = 10) => ({ id, left, top, right: left + w, bottom: top + h })
const boundsOf = item => item
const ids = list => list.map(item => item.id)

test('상자에 닿는 것만 고르고 먼 것은 돌려주지 않는다', () => {
  assert.equal(INDEX_CELL, 256)
  const near = box('near', 300, 300), far = box('far', 2000, 2000)
  const index = createBoxIndex([near, far], boundsOf)
  assert.deepEqual(ids(queryBoxIndex(index, box('q', 290, 290, 40, 40))), ['near'])
  assert.deepEqual(ids(queryBoxIndex(index, box('q', 1990, 1990, 40, 40))), ['far'])
  assert.deepEqual(ids(queryBoxIndex(index, box('q', 1000, 1000, 10, 10))), [])
})

test('원래 차례를 지킨다 — 겹치는 차례가 바뀌면 그림이 달라진다', () => {
  // 같은 칸에 여럿, 칸을 걸친 것 섞어서
  const a = box('a', 10, 10), b = box('b', 250, 10, 20, 20), c = box('c', 20, 20)
  const index = createBoxIndex([a, b, c], boundsOf)
  assert.deepEqual(ids(queryBoxIndex(index, box('q', 0, 0, 300, 300))), ['a', 'b', 'c'])
  // 넣은 차례가 다르면 나오는 차례도 그에 따른다
  assert.deepEqual(ids(queryBoxIndex(createBoxIndex([c, b, a], boundsOf), box('q', 0, 0, 300, 300))), ['c', 'b', 'a'])
})

test('칸을 걸친 것은 양쪽 물음에 다 나오되 한 번씩만 나온다', () => {
  const straddling = box('s', 250, 250, 20, 20)
  const index = createBoxIndex([straddling], boundsOf)
  assert.deepEqual(ids(queryBoxIndex(index, box('q', 200, 200, 20, 20))), ['s'])
  assert.deepEqual(ids(queryBoxIndex(index, box('q', 300, 300, 20, 20))), ['s'])
  // 네 칸에 걸쳐 있어도 한 번
  assert.deepEqual(ids(queryBoxIndex(index, box('q', 0, 0, 600, 600))), ['s'])
})

test('아주 큰 것과 값이 이상한 것은 늘 함께 돌려준다 — 색인이 손해라서', () => {
  // 페이지를 가로지르는 획은 칸을 수백 개 차지한다 → 따로 모아 두고 모든 물음에 함께 낸다
  const huge = box('huge', 0, 0, 5000, 5000), small = box('small', 100, 100)
  const broken = { id: 'broken', left: NaN, top: 0, right: 10, bottom: 10 }
  const index = createBoxIndex([huge, small, broken], boundsOf)
  assert.deepEqual(ids(queryBoxIndex(index, box('q', 4000, 4000, 10, 10))), ['huge', 'broken'])
  assert.deepEqual(ids(queryBoxIndex(index, box('q', 100, 100, 5, 5))), ['huge', 'small', 'broken'])
})

test('빈 목록 · 안 닿는 물음은 빈 배열', () => {
  assert.deepEqual(queryBoxIndex(createBoxIndex([], boundsOf), box('q', 0, 0)), [])
  const index = createBoxIndex([box('a', 1000, 1000)], boundsOf)
  assert.deepEqual(queryBoxIndex(index, box('q', 0, 0, 10, 10)), [])
})
