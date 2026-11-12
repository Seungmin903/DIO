// 이미 focus된 입력의 ref.focus()는 RN이 네이티브 명령을 생략한다.
// blur 없이 공개 UIManager 명령으로 키보드를 요청한다(Fabric/Paper 공통).
export function requestTextKeyboard(input, { platform, findNodeHandle, dispatchCommand }, retry = false) {
  if (!input) return
  if (retry && platform !== 'web' && input.isFocused?.() === true) {
    try {
      const tag = findNodeHandle?.(input)
      if (Number.isFinite(tag) && typeof dispatchCommand === 'function') {
        dispatchCommand(tag, 'focus', [])
        return
      }
    } catch {
      // 제거 중인 뷰나 명령 미지원 환경은 기존 focus 경로를 유지한다.
    }
  }
  input.focus?.()
}

export function startTextKeyboard({ platform, getInput, canFocus, isVisible, findNodeHandle, dispatchCommand,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  schedule = setTimeout, clear = clearTimeout }) {
  let stopped = false, frame
  const timers = []
  const stop = () => {
    stopped = true
    if (frame != null) cancelFrame(frame)
    timers.forEach(clear)
  }
  const attempt = retry => {
    if (stopped) return
    const input = getInput()
    if (!input || !canFocus() || (retry && isVisible())) { stop(); return }
    requestTextKeyboard(input, { platform, findNodeHandle, dispatchCommand }, retry)
    if (isVisible()) stop()
  }
  frame = requestFrame(() => attempt(false))
  if (platform !== 'web') for (const delay of [80, 200, 400]) timers.push(schedule(() => attempt(true), delay))
  return stop
}

// 키보드 바로 위에 띄우는 '선택한 글자' 줄의 bottom(스테이지 기준). keyboardTop 은 keyboardDidShow 의 screenY(창 기준).
// 안드로이드 15 edge-to-edge 처럼 키보드가 떠도 스테이지가 안 줄면 가려진 만큼 올린다. 키보드가 레이아웃을 줄이는 환경은
// 스테이지 아래 끝이 이미 키보드 위라 값이 0 이하가 되어 기본 여백(8)만 남는다(두 번 올라가지 않는다).
export function keyboardPanelBottom({ stageTop, stageHeight, keyboardTop, gap = 8 }) {
  if (keyboardTop == null || !Number.isFinite(stageHeight)) return gap
  return Math.max(gap, stageTop + stageHeight - keyboardTop + gap)
}
