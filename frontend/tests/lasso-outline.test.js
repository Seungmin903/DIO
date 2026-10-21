import test from 'node:test'
import assert from 'node:assert/strict'
import { createLassoOutline, resolveLassoOutline } from '../src/editor/utils/lassoOutline.js'

const objects = [{ id: 'a', x: 20, y: 30, w: 40, h: 50, rotation: 0 }, { id: 'b', x: 90, y: 100, w: 20, h: 30, rotation: 30 }]
const polygon = [{ x: 0, y: 0 }, { x: 140, y: 10 }, { x: 110, y: 160 }, { x: 5, y: 140 }]
const make = (ids = ['a', 'b']) => createLassoOutline(null, 'p1', [], ids, objects, polygon, 'replace')

test('단일·다중 선택에서 그린 윤곽을 복사해 보존한다', () => {
  for (const ids of [['a'], ['a', 'b']]) {
    const outline = make(ids)
    assert.deepEqual(resolveLassoOutline(outline, 'p1', ids, objects)[0].points, polygon)
    assert.notEqual(outline.paths[0].points, polygon)
    assert.notEqual(outline.paths[0].points[0], polygon[0])
  }
})

test('동일한 평행 이동·되돌리기에서 페이지 좌표 윤곽이 따라간다', () => {
  const outline = make()
  const moved = objects.map(o => ({ ...o, x: o.x + 33, y: o.y - 12 }))
  assert.deepEqual(resolveLassoOutline(outline, 'p1', ['b', 'a'], moved)[0].points, polygon.map(p => ({ x: p.x + 33, y: p.y - 12 })))
  assert.deepEqual(resolveLassoOutline(outline, 'p1', ['a', 'b'], objects)[0].points, polygon)
})

test('선택·페이지 변경, 삭제·숨김·개별 이동·크기·회전 변경은 윤곽을 해제한다', () => {
  const outline = make()
  assert.equal(resolveLassoOutline(outline, 'p2', ['a', 'b'], objects), null)
  for (const ids of [[], ['a'], ['a', 'c']]) assert.equal(resolveLassoOutline(outline, 'p1', ids, objects), null)
  assert.equal(resolveLassoOutline(outline, 'p1', ['a', 'b'], objects.slice(0, 1)), null)
  for (const patch of [{ hidden: true }, { x: 21 }, { w: 41 }, { rotation: 10 }, { flipX: true }]) {
    assert.equal(resolveLassoOutline(outline, 'p1', ['a', 'b'], [{ ...objects[0], ...patch }, objects[1]]), null)
  }
})

test('추가는 이동된 이전 윤곽과 새 경로를 보존하고, 제외 경로는 그리지 않으며 빈 선택은 해제한다', () => {
  const prior = make(['a'])
  const moved = objects.map(o => ({ ...o, x: o.x + 10 }))
  const added = createLassoOutline(prior, 'p1', ['a'], ['a', 'b'], moved, polygon, 'add')
  assert.equal(added.paths.length, 2)
  assert.equal(added.paths[0].points[0].x, 10)
  // 두 경로 모두 남은 b와 겹치므로 유지하고, 제외 경로는 추가하지 않는다.
  const removed = createLassoOutline(added, 'p1', ['a', 'b'], ['b'], moved, polygon, 'subtract')
  assert.equal(removed.paths.length, 2)
  assert.ok(removed.paths.every(path => path.mode !== 'subtract'))
  assert.deepEqual(removed.ids, ['b'])
  assert.equal(createLassoOutline(removed, 'p1', ['b'], [], moved, polygon, 'subtract'), null)
  assert.equal(createLassoOutline(added, 'p1', ['a', 'b'], ['a'], moved, polygon, 'replace').paths.length, 1)
})

test('A 추가 후 A를 제외하면 A만 감싼 경로는 사라지고 남은 선택의 윤곽만 표시한다', () => {
  const box = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
  const aroundB = box(80, 85, 50, 60), aroundA = box(10, 20, 60, 70)
  const onlyB = createLassoOutline(null, 'p1', [], ['b'], objects, aroundB, 'replace')
  const plusA = createLassoOutline(onlyB, 'p1', ['b'], ['a', 'b'], objects, aroundA, 'add')
  assert.equal(plusA.paths.length, 2)
  const minusA = createLassoOutline(plusA, 'p1', ['a', 'b'], ['b'], objects, aroundA, 'subtract')
  assert.equal(minusA.paths.length, 1)
  assert.deepEqual(minusA.paths[0].points, aroundB)
})
