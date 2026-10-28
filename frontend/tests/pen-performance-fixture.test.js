import test from 'node:test'
import assert from 'node:assert/strict'
import { PERF_CASES, performanceDoc } from '../qa/pen-performance-fixture.js'

test('성능 QA는 실제 저장 획 형식으로 지정한 개수·길이만 만들며 기존 문서를 입력받지 않는다', () => {
  for (const id of ['baseline', '100', '300', 'long30']) {
    const sample = PERF_CASES.find(item => item.id === id), doc = performanceDoc(sample, 'fountain')
    assert.equal(doc.pages.length, 1)
    assert.equal(doc.pages[0].objects.length, sample.count)
    assert.ok(doc.pages[0].objects.every(stroke => stroke.renderVersion === 3 && stroke.points.length === sample.points))
    assert.ok(doc.pages[0].objects.every(stroke => stroke.x >= 0 && stroke.y >= 0 && stroke.x + stroke.w <= 1188 && stroke.y + stroke.h <= 840))
  }
})

test('같은 조건의 지우개 재시험은 동일한 획 배치로 재생성한다', () => {
  const sample = PERF_CASES[0]
  const before = performanceDoc(sample, 'brush')
  before.pages[0].objects.pop()
  const restored = performanceDoc(sample, 'brush')
  assert.equal(restored.pages[0].objects.length, sample.count)
  assert.ok(restored.pages[0].objects.every(stroke => stroke.penKind === 'brush' && stroke.renderVersion === 2))
  assert.deepEqual(restored, performanceDoc(sample, 'brush'))
})
