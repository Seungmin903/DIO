import test from 'node:test'
import assert from 'node:assert/strict'
import { validRegion, moveRegion, regionFromDrag, resizeRegion, fitRegionPreset, regionOutput, regionPublishWarning, REGION_PRESETS } from '../src/editor/utils/regionGeometry.js'
const page = {
  width: 1280,
  height: 800
}
test('drag normalizes reverse coordinates and clamps the page boundary', () => {
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
test('screen movement divided by zoom preserves logical coordinates', () => {
  const r = {
    x: 100,
    y: 100,
    width: 200,
    height: 200
  }
  for (const zoom of [0.5, 1, 2]) assert.deepEqual(moveRegion(r, 40 * zoom / zoom, 60 * zoom / zoom, page), {
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
test('fixed ratio drag respects all four page quadrants', () => {
  for (const target of [{
    x: 0,
    y: 0
  }, {
    x: 1280,
    y: 0
  }, {
    x: 0,
    y: 800
  }, {
    x: 1280,
    y: 800
  }]) assert.ok(validRegion(regionFromDrag({
    x: 640,
    y: 400
  }, target, page, 9 / 16), page, 9 / 16))
})
test('story publishing guidance tolerates 1 percent, without loosening output geometry', () => {
  for (const error of [-0.01, -0.005, 0, 0.005, 0.01]) assert.equal(regionPublishWarning({
    width: 9 / 16 * (1 + error) * 1000,
    height: 1000
  }, 'story'), false)
  assert.equal(regionPublishWarning({
    width: 9 / 16 * 1.011 * 1000,
    height: 1000
  }, 'story'), true)
  assert.equal(regionPublishWarning({
    width: 9 / 16 * 0.989 * 1000,
    height: 1000
  }, 'story'), true)
  assert.equal(validRegion({
    x: 0,
    y: 0,
    width: 565,
    height: 1000
  }, {
    width: 1280,
    height: 1200
  }, 9 / 16), false)
  assert.equal(regionPublishWarning({
    width: 800,
    height: 1000
  }, 'feed'), false)
  assert.equal(regionPublishWarning({
    width: 700,
    height: 1000
  }, 'feed'), true)
})
