import test from 'node:test'
import assert from 'node:assert/strict'
import { createPenSample } from '../src/editor/utils/penSample.js'
import { isSkiaPencil } from '../src/editor/skia/pencilRaster.js'
import { isCurrentPencilPreviewEvent, pencilPreviewFrames, pencilPreviewPosition } from '../src/editor/utils/pencilPreviewFallback.js'

for (const small of [false, true]) {
  test(`연필 ${small ? '작은' : '큰'} 견본은 실제 연필 렌더러에 필요한 거리 정보를 가진다`, () => {
    const sample = createPenSample({ kind: 'pencil', width: 10, color: '#123456', opacity: 0.8 }, small)
    assert.equal(sample.renderVersion, 3)
    assert.equal(isSkiaPencil(sample), true)
    assert.equal(sample.points[0].inkDistance, 0)
    assert.ok(sample.points.every((point, index, points) => index === 0 || point.inkDistance > points[index - 1].inkDistance))
    assert.equal(sample.opacity, undefined) // 견본 컨테이너에서 불투명도를 한 번만 적용한다.
  })
}

test('다른 펜 견본은 기존 버전과 굵기를 유지한다', () => {
  for (const kind of ['ball', 'calligraphy', 'taperBrush', 'highlighter']) {
    const sample = createPenSample({ kind, width: 10, color: '#123456' }, true)
    assert.equal(sample.renderVersion, 2)
    assert.equal(sample.strokeWidth, 2)
    assert.equal(isSkiaPencil(sample), false)
  }
})

test('서로 다른 크기의 견본은 중앙 기준으로 겹친다', () => {
  assert.deepEqual(pencilPreviewPosition({ left: -2, top: -3, boxWidth: 100, boxHeight: 20 }, { w: 110, h: 30 }), { left: 3, top: 2 })
})

test('견본은 다음 그림 로딩 중 이전 그림을 유지하고 로딩 뒤 교체한다', () => {
  const a = { uri: 'old' }, b = { uri: 'new' }
  assert.deepEqual(pencilPreviewFrames(a, b), [{ image: a, visible: true }, { image: b, visible: false }])
  assert.deepEqual(pencilPreviewFrames(b, b), [{ image: b, visible: true }])
  assert.deepEqual(pencilPreviewFrames(null, b), [{ image: b, visible: false }])
  assert.deepEqual(pencilPreviewFrames(a, null), [{ image: a, visible: true }])
})

test('현재 견본 이미지 로딩 실패 시 오래된 프레임 대신 fallback을 표시한다', () => {
  const old = { uri: 'old' }, current = { uri: 'current' }
  assert.deepEqual(pencilPreviewFrames(old, current, 'current'), [])
  assert.deepEqual(pencilPreviewFrames(old, current, null), [{ image: old, visible: true }, { image: current, visible: false }])
})

test('늦게 도착한 이전 견본의 성공·실패 응답은 현재 상태를 바꾸지 않는다', () => {
  assert.equal(isCurrentPencilPreviewEvent('current', 'old'), false)
  assert.equal(isCurrentPencilPreviewEvent('current', 'current'), true)
})
