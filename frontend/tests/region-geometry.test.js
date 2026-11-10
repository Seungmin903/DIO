import test from 'node:test'
import assert from 'node:assert/strict'
import { validRegion, resizeRegion, fitRegionPreset, regionOutput, REGION_PRESETS } from '../src/editor/utils/regionGeometry.js'

const page = {
  width: 1280,
  height: 800
}
test('minimum size and fixed-ratio resizing stay in page bounds', () => {
  const r = {
    x: 100,
    y: 100,
    width: 400,
    height: 500
  }
  for (const corner of ['nw', 'ne', 'sw', 'se']) for (const dx of [-9999, 0, 9999]) for (const dy of [-9999, 0, 9999]) {
    assert.ok(validRegion(resizeRegion(r, corner, dx, dy, page, 4 / 5), page, 4 / 5))
  }
  assert.equal(validRegion({
    ...r,
    width: 31
  }, page), false)
  const tiny = resizeRegion({
    x: 1275,
    y: 795,
    width: 5,
    height: 5
  }, 'se', 1, 1, page, 1)
  assert.ok(tiny.x + tiny.width <= page.width && tiny.y + tiny.height <= page.height)
  assert.equal(validRegion(tiny, page, 1), false)
})
test('preset switching preserves center where possible and maintains aspect', () => {
  const r = {
    x: 100,
    y: 100,
    width: 600,
    height: 600
  }
  for (const id of Object.keys(REGION_PRESETS)) {
    const next = fitRegionPreset(r, id, page)
    assert.ok(validRegion(next, page, REGION_PRESETS[id].ratio))
    assert.equal(next.x + next.width / 2, 400)
    assert.equal(next.y + next.height / 2, 400)
  }
  assert.equal(fitRegionPreset(r, 'story', {
    width: 32,
    height: 32
  }), null)
})
test('output preset resolution, 3x and 6x boundaries are exact', () => {
  assert.deepEqual(regionOutput({
    width: 540,
    height: 540
  }, 'square'), {
    width: 1080,
    height: 1080,
    magnification: 2,
    blocked: false,
    needsConfirmation: false
  })
  assert.equal(regionOutput({
    width: 360,
    height: 360
  }, 'square').needsConfirmation, false)
  assert.equal(regionOutput({
    width: 200,
    height: 250
  }, 'portrait').needsConfirmation, true)
  assert.equal(regionOutput({
    width: 180,
    height: 180
  }, 'square').blocked, false)
  assert.equal(regionOutput({
    width: 160,
    height: 200
  }, 'portrait').blocked, true)
  const r = regionOutput(page)
  assert.equal(r.width, 2560)
  assert.equal(r.height, 1600)
  const large = regionOutput({
    width: 10000,
    height: 8000
  })
  assert.ok(large.width <= 4096 && large.width * large.height <= 8000000)
})
test('fixed ratio can shrink from either axis while keeping the opposite corner', () => {
  const start = { x: 100, y: 100, width: 400, height: 500 }
  for (const [dx, dy] of [[-80, 0], [0, -100], [-80, -100]]) {
    const next = resizeRegion(start, 'se', dx, dy, page, 4 / 5)
    assert.ok(next.width < start.width && next.height < start.height)
    assert.deepEqual([next.x, next.y], [100, 100])
    assert.ok(validRegion(next, page, 4 / 5))
  }
  assert.deepEqual(resizeRegion(start, 'nw', 80, 100, page, 4 / 5), { x: 180, y: 200, width: 320, height: 400 })
})
