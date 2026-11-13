// 확대 후 새 이미지와 기존 이미지가 여러 장씩 동시에 메모리에 올라가지 않게 한다.
export function createPhotoDecodeQueue(schedule = run => setTimeout(run, 16)) {
  const waiting = []
  let active = null
  let scheduled = false

  function scheduleNext() {
    if (active || scheduled || !waiting.length) return
    scheduled = true
    schedule(() => {
      scheduled = false
      if (active || !waiting.length) return
      let first = 0
      for (let index = 1; index < waiting.length; index++) {
        if (waiting[index].distance < waiting[first].distance) first = index
      }
      active = waiting.splice(first, 1)[0]
      active.start()
    })
  }

  return function enqueue(start, distance = Infinity) {
    const task = { start, distance }
    waiting.push(task)
    scheduleNext()
    return () => {
      if (active === task) active = null
      else {
        const index = waiting.indexOf(task)
        if (index >= 0) waiting.splice(index, 1)
      }
      scheduleNext()
    }
  }
}
