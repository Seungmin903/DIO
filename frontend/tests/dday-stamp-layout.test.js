import test from 'node:test'
import assert from 'node:assert/strict'
import { stampLayout } from '../src/editor/widgets/ddayStampLayout.js'

test('축소·확대와 관계없이 이름 배치와 글자 크기는 동일한 기준 좌표를 사용한다', () => {
  for (const title of ['', '기념일', '가나다라마바사아자차카타파하', 'WWWWWWWWWWWWWW']) {
    const normal = stampLayout(168, 168, title)
    for (const zoom of [0.1, 0.25, 0.4, 0.5, 1, 2]) {
      const layout = stampLayout(168 * zoom, 168 * zoom, title)
      assert.equal(layout.size, normal.size)
      assert.equal(layout.titleFontSize, normal.titleFontSize)
      assert.ok(layout.titleFontSize >= 12)
      assert.ok(Math.abs(layout.size * layout.scale - 168 * zoom) < 1e-8)
      assert.ok(Math.abs(layout.left + layout.size / 2 - 84 * zoom) < 1e-8)
      assert.ok(Math.abs(layout.top + layout.size / 2 - 84 * zoom) < 1e-8)
    }
  }
})

test('가로·세로 크기가 다른 상자에서도 원형 도장은 가운데에 들어간다', () => {
  const layout = stampLayout(240, 120, '이름')
  assert.equal(layout.size * layout.scale, 120)
  assert.equal(layout.left + layout.size / 2, 120)
  assert.equal(layout.top + layout.size / 2, 60)
})
