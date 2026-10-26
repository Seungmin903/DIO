// SDK 58에서 제거된 InteractionManager 대신 취소 가능한 유휴 작업을 예약한다.
// 브라우저의 유휴 콜백 미지원 또는 지연에도 제한 시간 안에 한 번만 실행한다.
export function scheduleIdleTask(callback, timeout = 1000, host = globalThis) {
  let done = false
  let idleId
  const cancel = () => {
    done = true
    host.clearTimeout(timer)
    if (idleId !== undefined) host.cancelIdleCallback?.(idleId)
  }
  const run = () => {
    if (done) return
    cancel()
    callback()
  }
  const timer = host.setTimeout(run, timeout)
  if (typeof host.requestIdleCallback === 'function') {
    idleId = host.requestIdleCallback(run, { timeout })
  }
  return { cancel }
}
