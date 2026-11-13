import test from 'node:test'
import assert from 'node:assert/strict'
import { stickerControlLayer } from '../src/diary/utils/coverStickerControls.js'

test('선택된 조작 영역은 비선택 영역보다 앞에 놓인다', () => {
  assert.ok(stickerControlLayer(true).style.zIndex > stickerControlLayer(false).style.zIndex)
})

test('선택 여부와 관계없이 빈 공간은 통과시키고 네이티브 조작 View는 유지한다', () => {
  for (const selected of [true, false]) {
    const layer = stickerControlLayer(selected)
    assert.equal(layer.pointerEvents, 'box-none')
    assert.equal(layer.collapsable, false)
  }
})
