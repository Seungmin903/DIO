import test from 'node:test'
import assert from 'node:assert/strict'
import { finishRegionDrag, validRegion, moveRegion, regionFromDrag, resizeRegion } from '../src/editor/utils/regionGeometry.js'
const page = {
  width: 1280,
  height: 800
}
test('free region normalizes reversed drag and clips to page boundaries', () => {
  assert.deepEqual(regionFromDrag({
    x: 400,
    y: 500
  }, {
    x: 100,
    y: 200
  }, page), {
    x: 100,
    y: 200,
    width: 300,
    height: 300
  })
  const r = regionFromDrag({
    x: 100,
    y: 100
  }, {
    x: 2000,
    y: 2000
  }, page)
  assert.equal(r.x + r.width, 1280)
  assert.equal(r.y + r.height, 800)
})
test('logical movement is stable across zoom and cannot leave the page', () => {
  const r = {
    x: 100,
    y: 100,
    width: 200,
    height: 200
  }
  for (const z of [0.5, 1, 2]) assert.deepEqual(moveRegion(r, 40 * z / z, 60 * z / z, page), {
    ...r,
    x: 140,
    y: 160
  })
  assert.deepEqual(moveRegion(r, 9999, -9999, page), {
    ...r,
    x: 1080,
    y: 0
  })
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
test('cancelled, unmoved and subminimum drag preserve the previous valid region', () => {
  const previous = {
    x: 100,
    y: 100,
    width: 400,
    height: 300
  }
  const options = {
    cancelled: false,
    moved: true,
    page
  }
  assert.equal(finishRegionDrag(previous, {
    x: 5,
    y: 5,
    width: 4,
    height: 4
  }, options), previous)
  assert.equal(finishRegionDrag(previous, previous, {
    ...options,
    cancelled: true
  }), previous)
  assert.equal(finishRegionDrag(previous, previous, {
    ...options,
    moved: false
  }), previous)
  const next = {
    x: 200,
    y: 200,
    width: 100,
    height: 100
  }
  assert.equal(finishRegionDrag(previous, next, options), next)
})
