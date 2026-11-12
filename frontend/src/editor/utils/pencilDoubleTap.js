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

// S펜 사이드버튼(안드로이드): 누르는 동안만 지우개, 떼면 누르기 전 펜으로 돌아간다(삼성 노트와 같은 방식).
// hold 는 누르기 전 도구다. 누른 동안 사용자가 다른 도구를 고르면 그 선택을 존중해 돌아가지 않는다.
// 지우개를 직접 다시 고른 경우는 도구만 봐서는 구분할 수 없어, 부르는 쪽(EditorScreen.selectTool)이 그때 hold 를 비운다.
// 돌려주는 값: { tool: 바꿀 도구 또는 null, hold: 다음에 넘길 hold }
export function sideButtonTool(pressed, activeTool, hold = null) {
  if (pressed) {
    if (activeTool === 'pen' || activeTool === 'highlighter') return { tool: 'eraser', hold: activeTool }
    return { tool: null, hold: activeTool === 'eraser' ? hold : null }
  }
  if (hold && activeTool === 'eraser') return { tool: hold, hold: null }
  return { tool: null, hold: null }
}

// 편집 화면의 도구 전환 창구. 모든 도구 선택이 select 를 거치게 해 두 가지를 맡는다.
// - 리렌더 전에 전환이 연달아 와도(사이드버튼 누름·뗌 등) 방금 고른 도구를 이전 도구로 넘긴다. sync 는 렌더마다 실제 도구로 맞춘다.
// - 사이드버튼이 아닌 길(툴바·펜슬 더블탭)로 고르면 누르기 전 도구(hold)를 버려, 누르는 동안 직접 고른 도구(지우개 포함)를 떼도 되돌리지 않는다.
// apply(tool, previous) 가 실제 전환을 한다.
export function createToolSwitcher(apply, initialTool = null) {
  let live = initialTool
  let hold = null
  let fromSideButton = false
  const select = (tool) => {
    const previous = live
    live = tool
    if (!fromSideButton) hold = null
    apply(tool, previous)
  }
  return {
    sync(tool) { live = tool },
    select,
    // ignorePress: 글 입력 중 · 읽기 전용이면 누름만 무시한다. 뗌은 늘 처리해야 임시 지우개가 남지 않는다.
    sideButton(pressed, { ignorePress = false } = {}) {
      if (pressed && ignorePress) return
      const next = sideButtonTool(pressed, live, hold)
      hold = next.hold
      if (!next.tool) return
      fromSideButton = true
      try { select(next.tool) } finally { fromSideButton = false }
    },
  }
}
