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
