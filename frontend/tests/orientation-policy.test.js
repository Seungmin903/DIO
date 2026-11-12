import test from 'node:test'
import assert from 'node:assert/strict'
import { orientationLockFor } from '../src/shared/orientationPolicy.js'

test('태블릿은 이전 폰 잠금을 해제하고 가로와 세로를 허용한다', () => {
  for (const allow of [false, true]) for (const preferred of [null, 'portrait', 'landscape'])
    assert.equal(orientationLockFor('tablet', allow, preferred), 'DEFAULT')
})

test('폰은 보관함에서 세로, 편집기에서 기기 방향 또는 선택한 방향을 따른다', () => {
  assert.equal(orientationLockFor('phone', false, null), 'PORTRAIT_UP')
  assert.equal(orientationLockFor('phone', true, null), 'DEFAULT')
  assert.equal(orientationLockFor('phone', true, 'portrait'), 'PORTRAIT_UP')
  assert.equal(orientationLockFor('phone', true, 'landscape'), 'LANDSCAPE')
})
