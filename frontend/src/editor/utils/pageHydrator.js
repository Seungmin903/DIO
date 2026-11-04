// 큰 문서의 페이지 내용을 뒤에서 읽어 채운다. 보고 있는 페이지에서 가까운 순서로 읽는다.
const BATCH_PAGES = 24
// 합칠 때마다 편집 화면 전체가 다시 그려지고, 그 비용은 페이지 수에 비례한다.
// 그래서 시간이 아니라 양으로 끊어 문서 크기와 상관없이 합치는 횟수를 일정하게 둔다. 보고 있는 페이지는 기다리지 않는다.
const FLUSH_SHARE = 0.1
// 글자 사이에 펜을 잠깐 떼는 동안에는 쉬는 상태를 유지한다.
const RESUME_DELAY_MS = 800

/**
 * ids: 읽을 페이지 id (문서 순서)
 * read(ids): [{ id, objects }] 를 돌려준다
 * onPages(items, done): 읽은 내용을 상태에 합친다. done 이면 모두 읽은 것이다
 * onError(error): 읽기 실패. 더 읽지 않는다
 * currentId(): 지금 보고 있는 페이지 id
 */
export function createPageHydrator({ ids, read, onPages, onError, currentId, resumeDelayMs = RESUME_DELAY_MS, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const order = new Map(ids.map((id, index) => [id, index]))
  const remaining = new Set(ids)
  const flushSize = Math.max(BATCH_PAGES, Math.ceil(ids.length * FLUSH_SHARE))
  let buffer = [], stopped = false, running = false, wake = null, paused = false, resumeTimer = null, wakePause = null

  const nearest = () => {
    const center = order.get(currentId()) ?? 0
    const picked = []
    if (remaining.has(ids[center])) picked.push(ids[center])
    for (let distance = 1; picked.length < BATCH_PAGES && distance < ids.length; distance += 1) {
      for (const index of [center + distance, center - distance]) {
        if (picked.length < BATCH_PAGES && index >= 0 && index < ids.length && remaining.has(ids[index])) picked.push(ids[index])
      }
    }
    return picked
  }

  const flush = (done) => {
    if (!buffer.length && !done) return
    const items = buffer
    buffer = []
    onPages(items, done)
  }

  // 쉬는 동안에도 지금 페이지가 비어 있으면 읽는다. 그 페이지를 기다리는 입력을 막지 않기 위해서다.
  const mustRest = () => paused && !remaining.has(currentId())
  const rest = async () => {
    while (!stopped && mustRest()) await new Promise((resolve) => { wakePause = resolve })
    wakePause = null
  }

  async function loop() {
    running = true
    try {
      while (!stopped && remaining.size) {
        await rest()
        if (stopped) return
        const center = currentId()
        const batch = nearest()
        const items = await read(batch)
        if (stopped) return
        batch.forEach((id) => remaining.delete(id))
        buffer.push(...items)
        if (!remaining.size) break
        // 합치면 화면 전체가 다시 그려지므로 쉬는 동안에는 지금 페이지가 아니면 합치지 않는다.
        if (batch.includes(center) || (!paused && buffer.length >= flushSize)) flush(false)
        await Promise.race([wait(0), new Promise((resolve) => { wake = resolve })])
      }
      if (!stopped) flush(true)
    } catch (error) {
      if (!stopped) { stopped = true; onError(error) }
    } finally {
      running = false
    }
  }

  return {
    start() { if (!running) loop() },
    /** 보고 있는 페이지가 바뀌면 다음 묶음을 바로 그 근처에서 읽는다. */
    prioritize() { wake?.(); wakePause?.() },
    pause() {
      if (resumeTimer != null) clearTimeout(resumeTimer)
      resumeTimer = null
      paused = true
    },
    resume() {
      if (resumeTimer != null) clearTimeout(resumeTimer)
      resumeTimer = setTimeout(() => { resumeTimer = null; paused = false; wakePause?.() }, resumeDelayMs)
    },
    stop() {
      stopped = true
      if (resumeTimer != null) clearTimeout(resumeTimer)
      wake?.()
      wakePause?.()
    },
  }
}
