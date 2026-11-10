import test from 'node:test'
import assert from 'node:assert/strict'
import { validRegion, resizeRegion } from '../src/editor/utils/regionGeometry.js'
const page = {
  width: 1280,
  height: 800
}
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
