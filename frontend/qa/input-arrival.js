// DOM 문자열·좌표를 남기지 않고 정해진 영역 분류만 반환한다.
export function inputArrivalArea(target) {
  if (!target?.closest) return 'unknown'
  for (const [selector, area] of [
    ['[aria-label="펜 입력 영역"]', 'pen-input'],
    ['[aria-label="형광펜 입력 영역"]', 'highlighter-input'],
    ['[aria-label="지우개 입력 영역"]', 'eraser-input'],
    ['input,textarea,[contenteditable]:not([contenteditable="false"])', 'editable'],
    ['[role="button"],button', 'control'],
    ['[aria-label$=" 캔버스"]', 'canvas-other'],
  ]) if (target.closest(selector)) return area
  return 'outside-canvas'
}
