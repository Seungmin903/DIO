import assert from 'node:assert/strict'
import test from 'node:test'
import { fitTabletFrame, formFactorFor, tabletFrameSpec, TABLET_MIN_SHORT_SIDE } from '../src/shared/layout.js'

test('창의 짧은 변이 600dp 이상이면 태블릿, 아니면 폰으로 본다', () => {
  assert.equal(formFactorFor(393, 852), 'phone')
  assert.equal(formFactorFor(852, 393), 'phone')
  assert.equal(formFactorFor(1280, 800), 'tablet')
  assert.equal(formFactorFor(800, 1280), 'tablet')
  assert.equal(formFactorFor(TABLET_MIN_SHORT_SIDE, 900), 'tablet')
  assert.equal(formFactorFor(TABLET_MIN_SHORT_SIDE - 1, 900), 'phone')
})

test('iPad Split View처럼 좁아진 창은 폰 배치로 바뀐다', () => {
  assert.equal(formFactorFor(507, 1024), 'phone')
  assert.equal(formFactorFor(678, 1024), 'tablet')
})

test('모든 플랫폼은 실제 안전 영역을 빈 공간 없이 채운다', () => {
  for (const platform of ['ios', 'android', 'web']) assert.deepEqual(tabletFrameSpec(platform), { mode: 'window' })
  assert.deepEqual(fitTabletFrame(1280, 1000, 'android'), { width: 1280, height: 1000 })
  assert.deepEqual(fitTabletFrame(1194, 834, 'ios'), { width: 1194, height: 834 })
  assert.deepEqual(fitTabletFrame(640, 800, 'web'), { width: 640, height: 800 })
})
