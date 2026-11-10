// 애플펜슬 더블탭으로 바꿀 도구. iPad 설정(설정 > Apple Pencil > 이중 탭)의 선택(action)을 따른다.
// - ignore(끔): 아무것도 안 한다.
// - switchPrevious(이전 도구): 바로 전에 쓴 그리기 도구로 돌아간다.
// - 그 밖(기본값 switchEraser, 색상 팔레트 등 DIO 에 없는 동작): 펜 ↔ 지우개.
// 그리기 도구(펜·형광펜·지우개)를 쓰는 중일 때만 바꾼다. 선택·텍스트 도구 중에는 무시한다.
export const DRAW_TOOLS = ['pen', 'highlighter', 'eraser']

export function pencilTapTool(action, activeTool, history = {}) {
  if (action === 'ignore' || !DRAW_TOOLS.includes(activeTool)) return null
  if (action === 'switchPrevious') {
    const previous = history.previous
    return DRAW_TOOLS.includes(previous) && previous !== activeTool ? previous : null
  }
  if (activeTool === 'eraser') return history.ink === 'highlighter' ? 'highlighter' : 'pen'
  return 'eraser'
}

// 도구가 바뀔 때마다 부른다. previous: 바로 전 도구, ink: 마지막으로 쓴 펜 종류(펜·형광펜).
export function rememberTool(history, tool) {
  const next = { ...history }
  if (next.current !== tool) { next.previous = next.current; next.current = tool }
  if (tool === 'pen' || tool === 'highlighter') next.ink = tool
  return next
}
