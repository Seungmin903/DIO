import test from 'node:test'
import assert from 'node:assert/strict'
import { CHARACTER_SCALE, MOA_INK_HEIGHT, MOA_KEY, DIO_INK_HEIGHT, DIO_KEY } from '../src/shared/characterScale.js'

test('같은 기준 폭으로 그려도 모아 키가 디오의 최종 시안 비율(약 87%)이 된다', () => {
  const moa = MOA_INK_HEIGHT * CHARACTER_SCALE.moa
  const dio = DIO_INK_HEIGHT * CHARACTER_SCALE.dio
  assert.ok(Math.abs(moa / dio - MOA_KEY / DIO_KEY) < 1e-9)
  assert.ok(CHARACTER_SCALE.dio > 1)
})
