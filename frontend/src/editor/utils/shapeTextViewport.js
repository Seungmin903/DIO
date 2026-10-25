// 글이 적은 큰 도형의 빈 공간까지 키보드 위로 끌어 올리지 않는다.
export function shapeInputHeight(shapeHeight, contentHeight, keyboardTop, visibleTop) {
  const available = keyboardTop == null ? Infinity : Math.max(1, keyboardTop - visibleTop - 24)
  return Math.max(1, Math.min(shapeHeight, contentHeight, available))
}

// 양수는 위로, 음수는 아래로 이동한다. 툴바 뒤에 가린 입력창도 복구한다.
export function shapeRevealDelta(box, keyboardTop, visibleTop) {
  if (keyboardTop == null) return 0
  if (box.y < visibleTop) return box.y - visibleTop
  const overlap = box.y + box.height - (keyboardTop - 12)
  return overlap > 0 ? overlap : 0
}
