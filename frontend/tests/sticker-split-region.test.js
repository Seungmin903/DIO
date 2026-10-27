import test from 'node:test'
import assert from 'node:assert/strict'
import { adjustCrop, cropAction, CROP_HANDLES, handlePoint } from '../src/editor/utils/stickerSplitCrop.js'
import { splitError, previewLoadMatches } from '../src/editor/utils/stickerSplit.js'

const rect = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, image = { width: 1000, height: 1000 }
test('2000px 미리보기를 Android가 1000px·500px로 줄여 읽어도 정상으로 판정한다', () => {
  const source = { previewWidth: 2000, previewHeight: 2000 }
  for (const size of [2000, 1000, 500]) assert.equal(previewLoadMatches(source, { width: size, height: size }), true)
  assert.equal(previewLoadMatches({ previewWidth: 2000, previewHeight: 1333 }, { width: 500, height: 333 }), true)
  assert.equal(previewLoadMatches({ previewWidth: 1024, previewHeight: 512 }, { width: 512, height: 1024 }), false)
  assert.equal(previewLoadMatches(source, { width: 0, height: 0 }), false)
  assert.equal(previewLoadMatches(source, { width: NaN, height: 500 }), false)
})
test('첫 드래그만 틀을 만들고 이후 내부는 이동·바깥은 무시한다', () => {
  assert.equal(cropAction({ x: 0.4, y: 0.4 }, rect, 1000, 1000, false), 'create')
  assert.equal(cropAction({ x: 0.4, y: 0.4 }, rect, 1000, 1000, true), 'move')
  assert.equal(cropAction({ x: 0.02, y: 0.02 }, rect, 1000, 1000, true), 'ignore')
  assert.equal(cropAction({ x: -0.1, y: 0.3 }, rect, 1000, 1000, false), 'ignore')
})
test('8개 손잡이는 화면 44px 터치 범위를 제공하고 확대에 따라 원본 범위를 환산한다', () => {
  for (const handle of CROP_HANDLES) {
    assert.equal(cropAction(handlePoint(rect, handle), rect, 500, 500, true), handle)
  }
  assert.equal(cropAction({ x: 0.16, y: 0.2 }, rect, 500, 500, true), 'nw')
  assert.equal(cropAction({ x: 0.16, y: 0.2 }, rect, 2000, 2000, true), 'ignore')
})
test('사각형 이동은 크기를 보존하며 이미지 밖으로 벗어나지 않는다', () => {
  const result = adjustCrop(rect, { x: 0.4, y: 0.4 }, { x: 2, y: -2 }, 'move', image)
  assert.deepEqual(result, { x: 0.4, y: 0, width: 0.6, height: 0.6 })
})
test('손잡이 주변을 잡아도 틀이 손가락 위치로 튀지 않고 이동량만 반영한다', () => {
  const grab = { x: 0.18, y: 0.18 }
  assert.deepEqual(adjustCrop(rect, grab, grab, 'nw', image), rect)
  const moved = adjustCrop(rect, grab, { x: 0.2, y: 0.2 }, 'nw', image)
  assert.ok(Math.abs(moved.x - 0.22) < 1e-8); assert.ok(Math.abs(moved.y - 0.22) < 1e-8)
})
test('모든 변·모서리 조정에서 반대 변 고정·최소 크기·경계 제한을 지킨다', () => {
  for (const handle of CROP_HANDLES) {
    const result = adjustCrop(rect, handlePoint(rect, handle), { x: 0.45, y: 0.45 }, handle, image)
    assert.ok(result.width > 0 && result.height > 0)
    if (!handle.includes('w')) assert.equal(result.x, rect.x)
    if (!handle.includes('n')) assert.equal(result.y, rect.y)
    if (!handle.includes('e')) assert.ok(Math.abs(result.x + result.width - 0.8) < 1e-8)
    if (!handle.includes('s')) assert.ok(Math.abs(result.y + result.height - 0.8) < 1e-8)
  }
  const tiny = adjustCrop(rect, { x: 0.8, y: 0.8 }, { x: -10, y: -10 }, 'se', image)
  assert.ok(tiny.width >= 0.004999 && tiny.height >= 0.004999)
  const edge = adjustCrop(rect, { x: 0.2, y: 0.2 }, { x: -10, y: -10 }, 'nw', image)
  assert.equal(edge.x, 0); assert.equal(edge.y, 0)
})
test('역방향 생성과 무시된 조작은 원래 영역을 오염시키지 않는다', () => {
  const created = adjustCrop(rect, { x: 0.8, y: 0.8 }, { x: 0.1, y: 0.2 }, 'create', image)
  assert.equal(created.x, 0.1); assert.ok(Math.abs(created.width - 0.7) < 1e-8)
  assert.equal(adjustCrop(rect, {}, {}, 'ignore', image), rect)
})
test('미지원·움직이는·손상 파일 오류는 지원 형식과 재시도를 안내한다', () => {
  assert.match(splitError(new Error('SVG_SPLIT_UNSUPPORTED')), /SVG.*PNG/)
  assert.match(splitError(new Error('ANIMATED_SPLIT_IMAGE')), /APNG.*WebP/)
  assert.match(splitError(new Error('UNSUPPORTED_SPLIT_FORMAT')), /PNG.*JPEG.*WebP/)
  assert.match(splitError(new Error('INVALID_SPLIT_IMAGE')), /손상/)
  assert.match(splitError(new Error('SPLIT_FILE_TOO_LARGE')), /50MiB/)
})
