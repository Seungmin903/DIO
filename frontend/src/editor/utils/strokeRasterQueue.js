// 한 번에 하나만 생성하고, 입력 중에는 다음 SVG 복제/직렬화를 시작하지 않는다.
export function createStrokeRasterQueue({ now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, idleMs = 180, minGapMs = 0, canStart = () => true } = {}) {
  let pending = [], active = null, timer = null, paused = false, notBefore = 0
  const clearWake = () => { if (timer !== null) clearTimer(timer); timer = null }
  const kick = () => {
    if (paused || active || timer !== null || !pending.length) return
    timer = setTimer(() => {
      timer = null
      if (!canStart()) return
      const item = pending.shift()
      if (!item || item.cancelled) { kick(); return }
      active = item
      const finish = () => {
        if (active === item) {
          active = null
          notBefore = Math.max(notBefore, now() + minGapMs)
          if (item.retry && !item.cancelled) { item.retry = false; pending.unshift(item) }
        }
        kick()
      }
      try {
        const work = item.start()
        item.cancelWork = work?.cancel
        Promise.resolve(work?.done).catch(() => {}).finally(finish)
      } catch { finish() }
    }, Math.max(0, notBefore - now()))
  }
  return {
    enqueue(start) {
      const item = { start, cancelled: false }
      pending.push(item); kick()
      return () => {
        item.cancelled = true
        pending = pending.filter(candidate => candidate !== item)
        item.cancelWork?.()
      }
    },
    pause() {
      paused = true; clearWake()
      // Abort an image wait before it can draw during the next Pencil gesture.
      if (active?.cancelWork && !active.cancelled && !active.retry) { active.retry = true; active.cancelWork() }
    },
    resume() { paused = false; notBefore = now() + idleMs; clearWake(); kick() },
    clear() {
      clearWake()
      for (const item of pending) item.cancelled = true
      pending = []; if (active) { active.cancelled = true; active.cancelWork?.() }
    },
  }
}
