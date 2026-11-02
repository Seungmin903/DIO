// 한 패널의 네이티브 썸네일 작업을 한 번에 하나씩 실행한다.
export function createThumbnailWorkQueue({ schedule = setTimeout, cancel = clearTimeout, delay = 20 } = {}) {
  let pending = [], timer = null, stopped = false
  const pump = () => {
    if (stopped || timer !== null || !pending.length) return
    timer = schedule(() => {
      timer = null
      const task = pending.shift()
      if (!stopped && task && !task.cancelled) task.run()
      pump()
    }, delay)
  }
  return {
    enqueue(run) {
      if (stopped) return () => {}
      const task = { run, cancelled: false }
      pending.push(task)
      pump()
      return () => { task.cancelled = true }
    },
    stop() { stopped = true; if (timer !== null) cancel(timer); timer = null; pending = [] },
  }
}
