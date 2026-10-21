import assert from 'node:assert/strict'
import test from 'node:test'
import { fitTabletFrame, formFactorFor, TABLET_MIN_SHORT_SIDE } from '../src/shared/layout.js'

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

test('태블릿 프레임은 16:10 비율 안에서 가장 크게 맞춘다', () => {
  assert.deepEqual(fitTabletFrame(1280, 1000), { width: 1280, height: 800 })
  assert.deepEqual(fitTabletFrame(640, 800), { width: 640, height: 400 })
})
