// 숨김 프레임을 먼저 반영하고 다음 프레임에 레이아웃을 복원한다.
export function createPageCloseScheduler({ request = requestAnimationFrame, cancel = cancelAnimationFrame } = {}) {
  let frame = null, generation = 0
  function cancelPending() {
    generation++
    if (frame !== null) cancel(frame)
    frame = null
  }
  return {
    pending: () => frame !== null,
    cancel: cancelPending,
    start(complete) {
      cancelPending()
      const current = generation
      frame = request(() => {
        if (generation !== current) return
        frame = request(() => {
          if (generation !== current) return
          frame = null
          complete()
        })
      })
    },
  }
}
