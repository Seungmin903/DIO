import assert from 'node:assert/strict'
import test from 'node:test'
import { fitTabletFrame, formFactorFor, tabletFrameSpec, TABLET_MIN_SHORT_SIDE, TABLET_WIDTH, TABLET_HEIGHT } from '../src/shared/layout.js'

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

test('Android 태블릿 바깥 프레임은 기준 비율과 달라도 창 전체를 채운다', () => {
  assert.deepEqual(tabletFrameSpec('android'), { width: 1280, height: 800 })
  assert.deepEqual(fitTabletFrame(1280, 1000), { width: 1280, height: 1000 })
  assert.deepEqual(fitTabletFrame(2000, 1200), { width: 2000, height: 1200 })
  assert.deepEqual(fitTabletFrame(1920, 800), { width: 1920, height: 800 })
})

test('iPad 가로·세로·분할 창에서도 바깥 프레임이 창 크기를 따른다', () => {
  assert.deepEqual(tabletFrameSpec('ios'), { width: 1024, height: 768 })
  for (const [width, height] of [[1366,1024],[1024,768],[768,1024],[678,1024]])
    assert.deepEqual(fitTabletFrame(width, height), { width, height })
})

test('디자인 기준과 속지 공통 좌표는 유지하고 측정 전 크기는 음수가 되지 않는다', () => {
  assert.deepEqual(tabletFrameSpec('unknown'), { width: 1280, height: 800 })
  assert.deepEqual([TABLET_WIDTH, TABLET_HEIGHT], [1280, 800])
  assert.deepEqual(fitTabletFrame(0, 0), { width: 0, height: 0 })
  assert.deepEqual(fitTabletFrame(-1, -20), { width: 0, height: 0 })
})
