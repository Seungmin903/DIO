import test from 'node:test'
import assert from 'node:assert/strict'
import { keepOutBox, placeVertical, placeHorizontal, POPOVER_GAP, ROTATE_OFFSET, ROTATE_HANDLE } from '../src/editor/utils/popoverPlacement.js'
import { rotatedBounds, rotateVector } from '../src/editor/utils/common.js'

const BAR = 52, PAGE_H = 800
const handleAt = (o, zoom = 1) => {
  const at = rotateVector(0, -(o.h * zoom / 2 + ROTATE_OFFSET), o.rotation)
  return { x: (o.x + o.w / 2) * zoom + at.x, y: (o.y + o.h / 2) * zoom + at.y }
}
const overlapsHandle = (o, top, zoom = 1) => {
  const h = handleAt(o, zoom), r = ROTATE_HANDLE / 2
  return h.y + r > top && h.y - r < top + BAR
}

test('회전하지 않은 요소: 바는 회전 손잡이보다 위에 뜬다', () => {
  const o = { x: 400, y: 300, w: 200, h: 120, rotation: 0 }
  const { top, side } = placeVertical(keepOutBox(rotatedBounds(o), 1, o), BAR, PAGE_H)
  assert.equal(side, 'above')
  assert.ok(top + BAR <= handleAt(o).y - ROTATE_HANDLE / 2 - POPOVER_GAP + 0.001)
})

test('어떤 각도로 돌려도 바가 회전 손잡이를 가리지 않는다', () => {
  for (const rotation of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const o = { x: 500, y: 330, w: 220, h: 140, rotation }
    const { top } = placeVertical(keepOutBox(rotatedBounds(o), 1, o), BAR, PAGE_H)
    assert.equal(overlapsHandle(o, top), false, `${rotation}°`)
  }
})

test('위에 자리가 없으면 아래, 둘 다 없으면 손잡이 반대쪽에 붙인다', () => {
  const nearTop = { x: 400, y: 20, w: 200, h: 120, rotation: 0 }
  assert.equal(placeVertical(keepOutBox(rotatedBounds(nearTop), 1, nearTop), BAR, PAGE_H).side, 'below')
  const huge = { x: 100, y: 60, w: 1000, h: 700, rotation: 0 }
  const tall = placeVertical(keepOutBox(rotatedBounds(huge), 1, huge), BAR, PAGE_H)
  assert.equal(tall.side, 'below'); assert.equal(tall.fits, false)
  assert.ok(tall.top <= PAGE_H - BAR - 8)
  const flipped = { ...huge, rotation: 180 }
  assert.equal(placeVertical(keepOutBox(rotatedBounds(flipped), 1, flipped), BAR, PAGE_H).side, 'above')
})

test('누른 자리 메뉴는 위 먼저, 위가 좁으면 아래에 뜬다', () => {
  assert.equal(placeVertical({ top: 400, bottom: 400, handleY: null }, 52, PAGE_H).top, 400 - POPOVER_GAP - 52)
  assert.equal(placeVertical({ top: 30, bottom: 30, handleY: null }, 52, PAGE_H).top, 30 + POPOVER_GAP)
  assert.equal(placeHorizontal(5, 210, 1280), 8)
  assert.equal(placeHorizontal(1275, 210, 1280), 1280 - 210 - 8)
})

test('보이는 작업 영역을 주면 페이지가 아니라 그 영역 안에 놓는다 (툴바 아래 · 패널 옆)', () => {
  const area = { left: 160, top: 76, right: 900, bottom: 700 }
  // 요소가 툴바 바로 아래에 있으면 위로 못 올리고 아래로
  const nearRibbon = placeVertical({ top: 90, bottom: 140, handleY: null }, BAR, area)
  assert.equal(nearRibbon.side, 'below'); assert.equal(nearRibbon.top, 140 + POPOVER_GAP)
  // 요소가 화면 밖(위)으로 나가도 바는 영역 안으로 들어온다
  assert.equal(placeVertical({ top: -400, bottom: -300, handleY: null }, BAR, area).top, area.top + 8)
  assert.equal(placeVertical({ top: 900, bottom: 1000, handleY: null }, BAR, area).top, area.bottom - BAR - 8)
  // 가로: 왼쪽 패널 옆, 오른쪽 끝 안으로
  assert.equal(placeHorizontal(100, 300, area), area.left + 8)
  assert.equal(placeHorizontal(1200, 300, area), area.right - 300 - 8)
})
