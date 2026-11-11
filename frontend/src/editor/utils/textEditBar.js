// 글을 고치는 동안 글상자 위에 뜨는 작업 막대(TextEditBar)의 자리(작업창 좌표). S15P31F106-482.
// 상자 위에 먼저 두고, 위쪽(툴바 · 상단 막대)에 닿으면 상자 아래에 둔다. 아래가 키보드(또는 키보드 위 '선택한 글자' 줄)에 닿으면
// 상자 위로 되돌리되 위 한계에 맞춘다. 가로는 상자 왼쪽에 맞추고 작업창 안에 들어가게 민다.
export const TEXT_EDIT_BAR_HEIGHT = 52
export const TEXT_EDIT_BAR_GAP = 6
export const TEXT_EDIT_BAR_EDGE = 8

/**
 * box: 글상자 { left, top, width, height } (작업창 좌표, 확대 반영)
 * stage: { width, height }
 * topLimit: 이 위로는 올라가지 않는다(위쪽 막대 아래). bottomLimit: 이 아래로는 내려가지 않는다(키보드 · 키보드 위 줄의 위)
 * barWidth: 막대 폭(어림). preferBelow: 상자 위에 다른 말풍선(웹 선택 말풍선)이 있어 아래를 먼저 쓸 때
 * → { left, top, below }  below: 상자 아래에 놓였다
 */
export function textEditBarPlacement({ box, stage, topLimit = TEXT_EDIT_BAR_EDGE, bottomLimit = stage.height, barWidth, barHeight = TEXT_EDIT_BAR_HEIGHT, gap = TEXT_EDIT_BAR_GAP, preferBelow = false }) {
  const aboveTop = box.top - gap - barHeight
  const belowTop = box.top + box.height + gap
  const fitsAbove = aboveTop >= topLimit
  const fitsBelow = belowTop + barHeight <= bottomLimit
  let top, below
  if (preferBelow && fitsBelow) { top = belowTop; below = true }
  else if (fitsAbove) { top = aboveTop; below = false }
  else if (fitsBelow) { top = belowTop; below = true }
  else { top = Math.max(topLimit, Math.min(aboveTop, bottomLimit - barHeight)); below = false } // 위아래 다 모자라면 위 한계에 붙인다
  const maxLeft = Math.max(TEXT_EDIT_BAR_EDGE, stage.width - barWidth - TEXT_EDIT_BAR_EDGE)
  const left = Math.max(TEXT_EDIT_BAR_EDGE, Math.min(box.left, maxLeft))
  return { left, top, below }
}

/** 글상자(페이지 좌표)를 작업창 좌표 상자로 */
export function textBoxOnStage(object, offset, zoom) {
  return { left: offset.x + object.x * zoom, top: offset.y + object.y * zoom, width: (object.w ?? 0) * zoom, height: (object.h ?? 0) * zoom }
}
