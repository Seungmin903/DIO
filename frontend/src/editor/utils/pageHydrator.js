// 큰 문서의 페이지 내용을 뒤에서 읽어 채운다. 보고 있는 페이지에서 가까운 순서로 읽는다.
const BATCH_PAGES = 24
// 합칠 때마다 편집 화면 전체가 다시 그려지고, 그 비용은 페이지 수에 비례한다.
// 그래서 시간이 아니라 양으로 끊어 문서 크기와 상관없이 합치는 횟수를 일정하게 둔다. 보고 있는 페이지는 기다리지 않는다.
const FLUSH_SHARE = 0.1
// 글자 사이에 펜을 잠깐 떼는 동안에는 쉬는 상태를 유지한다.
const RESUME_DELAY_MS = 800
const RETRY_DELAY_MS = 300

/**
 * ids: 읽을 페이지 id (문서 순서)
 * allIds: 문서의 모든 페이지 id. 지금 페이지가 이미 읽혀 ids 에 없어도 그 근처부터 읽기 위해 쓴다
 * read(ids): [{ id, objects }] 를 돌려준다
 * onPages(items, done): 읽은 내용을 상태에 합친다. done 이면 모두 읽은 것이다
 * onError(error): 읽기 실패. 더 읽지 않는다
 * currentId(): 지금 보고 있는 페이지 id
 */
export function createPageHydrator({ ids, allIds = ids, read, onPages, onError, currentId, resumeDelayMs = RESUME_DELAY_MS, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const order = new Map(ids.map((id, index) => [id, index]))
  const remaining = new Set(ids)
  const flushSize = Math.max(BATCH_PAGES, Math.ceil(ids.length * FLUSH_SHARE))
  let buffer = [], stopped = false, running = false, wake = null, paused = false, resumeTimer = null, wakePause = null

  const documentOrder = new Map(allIds.map((id, index) => [id, index]))
  // 지금 페이지가 이미 읽혔으면 문서에서 그 바로 뒤의 안 읽은 페이지를 기준으로 삼는다.
  const centerOf = (id) => {
    if (order.has(id)) return order.get(id)
    const at = documentOrder.get(id)
    if (at === undefined) return 0
    const next = ids.findIndex((other) => (documentOrder.get(other) ?? -1) > at)
    return next === -1 ? ids.length - 1 : next
  }

  const nearest = () => {
    const center = centerOf(currentId())
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

  // 읽어 둔 이웃 페이지로 넘어오면 다음 합치기까지 입력이 막힌다. 지금 페이지가 버퍼에 있으면 바로 합친다.
  const currentBuffered = () => buffer.some((item) => item.id === currentId())

  // 쉬는 동안에도 지금 페이지가 비어 있으면 읽는다. 그 페이지를 기다리는 입력을 막지 않기 위해서다.
  const mustRest = () => paused && !remaining.has(currentId())
  const rest = async () => {
    while (!stopped && mustRest()) await new Promise((resolve) => { wakePause = resolve })
    wakePause = null
  }

  // 빠진 페이지를 "다 읽음"으로 넘기면 빈 페이지가 복제 · 내보내기로 번지므로 실패로 본다.
  const readComplete = async (batch) => {
    const items = await read(batch)
    const found = new Set(items.map((item) => item.id))
    const missing = batch.find((id) => !found.has(id))
    if (missing !== undefined) throw new Error(`Page content not found: ${missing}`)
    return items
  }
  // 일시적인 입출력 실패로 편집을 막지 않도록 한 번 더 읽어 본다.
  const readBatch = async (batch) => {
    try {
      return await readComplete(batch)
    } catch {
      await wait(RETRY_DELAY_MS)
      if (stopped) return []
      return readComplete(batch)
    }
  }

  async function loop() {
    running = true
    try {
      while (!stopped && remaining.size) {
        await rest()
        if (stopped) return
        const center = currentId()
        const batch = nearest()
        const items = await readBatch(batch)
        if (stopped) return
        batch.forEach((id) => remaining.delete(id))
        buffer.push(...items)
        if (!remaining.size) break
        // 합치면 화면 전체가 다시 그려지므로 쉬는 동안에는 지금 페이지가 아니면 합치지 않는다.
        if (batch.includes(center) || currentBuffered() || (!paused && buffer.length >= flushSize)) flush(false)
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
    prioritize() {
      if (!stopped && currentBuffered()) flush(false)
      wake?.(); wakePause?.()
    },
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
