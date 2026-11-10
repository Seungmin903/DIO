import test from 'node:test'
import assert from 'node:assert/strict'
import { moveRegion, regionDragAction, validRegion, resizeRegion } from '../src/editor/utils/regionGeometry.js'
const page = {
  width: 1280,
  height: 800
}
test('한 손가락 드래그는 모서리와 내부를 구분하고 페이지 안에서 선택 영역을 이동한다', () => {
  const region = { x: 100, y: 100, width: 400, height: 500 }
  assert.equal(regionDragAction({ x: 106, y: 106 }, region, 2), 'nw')
  assert.equal(regionDragAction({ x: 180, y: 160 }, region, 2), 'move')
  assert.equal(regionDragAction({ x: 90, y: 180 }, region, 2), null)
  assert.equal(regionDragAction({ x: 116, y: 116 }, { ...region, width: 32, height: 32 }, 0.5), 'move')
  const moved = moveRegion(region, 9999, -9999, page)
  assert.deepEqual(moved, { x: 880, y: 0, width: 400, height: 500 })
  assert.ok(validRegion(moved, page, 4 / 5))
})
test('free corner resize preserves page limits and minimum valid dimensions', () => {
  const r = {
    x: 100,
    y: 100,
    width: 400,
    height: 500
  }
  for (const corner of ['nw', 'ne', 'sw', 'se']) for (const dx of [-9999, 0, 9999]) for (const dy of [-9999, 0, 9999]) assert.ok(validRegion(resizeRegion(r, corner, dx, dy, page), page))
  assert.equal(validRegion({
    ...r,
    width: 31
  }, page), false)
  assert.equal(validRegion({
    ...r,
    x: NaN
  }, page), false)
})
test('tiny selection at page edge cannot escape the page through minimum-size clamping', () => {
  const r = resizeRegion({
    x: 1275,
    y: 795,
    width: 5,
    height: 5
  }, 'se', 1, 1, page)
  assert.ok(r.x + r.width <= page.width && r.y + r.height <= page.height)
  assert.equal(validRegion(r, page), false)
})
