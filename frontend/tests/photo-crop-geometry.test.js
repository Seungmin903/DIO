import test from 'node:test'
import assert from 'node:assert/strict'
import { changeCropRatio, cropFromRect, freeTransform, freeZoom, resizeFreeCrop, visibleRect } from '../src/editor/utils/photoCropGeometry.js'
import { encodeElement, decodeElement } from '../src/collaboration/canvasElements.js'

const close = (a, b) => assert.ok(Math.abs(a - b) < 0.001, `${a} != ${b}`)
const center = r => [(r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2]
const size = (rect, view) => [(rect.u1 - rect.u0) * view.width, (rect.v1 - rect.v0) * view.height]

test('비율 선택 후 확대해도 화면의 자르기 틀 크기와 중심을 유지한다', () => {
  const imageAspect = 4 / 3
  const original = { u0: 0, v0: 0, u1: 1, v1: 1 }
  const selected = changeCropRatio(original, (16 / 9) / imageAspect)
  const view = { left: 30, top: 40, width: 400, height: 300 }
  const before = size(selected, view)
  const result = freeTransform(selected, view, 2, 0, 0)
  const after = size(result.rect, result.view)
  before.forEach((value, i) => close(value, after[i]))
  center(selected).forEach((value, i) => close(value, center(result.rect)[i]))
  close(freeZoom(result.rect), 2)
})

test('확대 후 비율을 반복 전환해도 확대 수치와 가능한 중심을 유지하고 적용 결과가 일치한다', () => {
  const imageAspect = 4 / 3, view = { left: 0, top: 0, width: 400, height: 300 }
  const wide = changeCropRatio({ u0: 0, v0: 0, u1: 1, v1: 1 }, (16 / 9) / imageAspect)
  const zoomed = freeTransform(wide, view, 2, 0, 0).rect
  const portrait = changeCropRatio(zoomed, (3 / 4) / imageAspect)
  const back = changeCropRatio(portrait, (16 / 9) / imageAspect)
  for (const rect of [zoomed, portrait, back]) {
    close(freeZoom(rect), 2)
    center(zoomed).forEach((value, i) => close(value, center(rect)[i]))
  }
  const crop = cropFromRect(back)
  const restored = visibleRect(crop, 16 / 9, imageAspect)
  for (const key of ['u0', 'v0', 'u1', 'v1']) close(restored[key], back[key])
})

test('사진 가장자리에서는 영역을 사진 안에 유지한다', () => {
  const rect = { u0: 0, v0: 0, u1: 0.5, v1: 0.25 }
  const next = changeCropRatio(rect, 0.5)
  assert.ok(next.u0 >= 0 && next.v0 >= 0 && next.u1 <= 1 && next.v1 <= 1)
  close(freeZoom(next), freeZoom(rect))
})

test('다양한 이미지·선택 비율에서 적용 값은 보이는 영역과 일치한다', () => {
  for (const imageAspect of [0.6, 1, 2]) for (const boxAspect of [0.75, 1, 4 / 3, 16 / 9]) {
    const start = changeCropRatio({ u0: 0.2, v0: 0.2, u1: 0.8, v1: 0.8 }, boxAspect / imageAspect)
    const restored = visibleRect(cropFromRect(start), boxAspect, imageAspect)
    for (const key of ['u0', 'v0', 'u1', 'v1']) close(restored[key], start[key])
  }
})

test('자유 자르기 8개 손잡이는 작은 변을 강제로 늘리지 않고 확대 한도를 지킨다', () => {
  const rect = { u0: 0.4, v0: 0.4, u1: 0.505, v1: 0.54 }
  for (const [sx, sy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
    const handle = { sx, sy }, still = resizeFreeCrop(rect, handle, 0, 0, 1 / 9)
    for (const key of ['u0', 'v0', 'u1', 'v1']) close(still[key], rect[key])
    const moved = resizeFreeCrop(rect, handle, -sx * 2, -sy * 2, 1 / 9)
    assert.ok(moved.u0 >= 0 && moved.v0 >= 0 && moved.u1 <= 1 && moved.v1 <= 1)
    assert.ok(moved.u1 > moved.u0 && moved.v1 > moved.v0)
    assert.ok(Math.max(moved.u1 - moved.u0, moved.v1 - moved.v0) >= 1 / 9 - 1e-12)
  }
})

test('가로와 세로 중 어느 변이든 선처럼 얇게 줄인 뒤 다시 넓힐 수 있다', () => {
  const rect = { u0: 0.4, v0: 0.4, u1: 0.505, v1: 0.54 }
  for (const [handle, du, dv] of [[{ sx: 1, sy: 0 }, -0.2, 0], [{ sx: 0, sy: 1 }, 0, -0.2]]) {
    const thin = resizeFreeCrop(rect, handle, du, dv, 1 / 32)
    if (handle.sx) assert.ok(thin.u1 - thin.u0 < 0.002)
    else assert.ok(thin.v1 - thin.v0 < 0.002)
    assert.ok(freeZoom(thin) <= 32)
    const restored = resizeFreeCrop(thin, handle, -du, -dv, 1 / 32)
    // 끝을 넘겨 끌었다면 복원 시에는 실제로 움직인 거리만큼 반대로 끈다.
    const actualDu = handle.sx ? rect.u1 - thin.u1 : 0, actualDv = handle.sy ? rect.v1 - thin.v1 : 0
    const exact = resizeFreeCrop(thin, handle, actualDu, actualDv, 1 / 32)
    assert.ok(restored.u1 <= 1 && restored.v1 <= 1)
    for (const key of ['u0', 'v0', 'u1', 'v1']) close(exact[key], rect[key])
  }
})

test('두 변을 모두 줄여도 확대값이 무한대로 커지지 않는다', () => {
  const tiny = resizeFreeCrop({ u0: 0.4, v0: 0.4, u1: 0.45, v1: 0.45 }, { sx: 1, sy: 1 }, -1, -1, 1 / 32)
  assert.ok(freeZoom(tiny) <= 32 + 1e-9)
  assert.ok(Number.isFinite(cropFromRect(tiny).zoom))
})

test('9배를 넘는 자르기는 공유 요소 직렬화와 재편집에서 보존된다', () => {
  const rect = { u0: 0.4, v0: 0.3, u1: 0.43125, v1: 0.32 }
  const crop = cropFromRect(rect)
  assert.equal(crop.zoom, 32)
  const photo = { id: 'e0fa1af4-8507-4abc-b28d-13b5a20a4511', type: 'photo', x: 0, y: 0, w: 250, h: 120, crop }
  const encoded = encodeElement(photo)
  const decoded = decodeElement({ ...encoded, version: 1 })
  assert.deepEqual(decoded.crop, crop)
  const restored = visibleRect(decoded.crop, (rect.u1 - rect.u0) / (rect.v1 - rect.v0) * 4 / 3, 4 / 3)
  for (const key of ['u0', 'v0', 'u1', 'v1']) close(restored[key], rect[key])
})
