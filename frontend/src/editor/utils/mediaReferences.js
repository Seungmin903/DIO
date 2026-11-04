const PREFIX = 'media:'
export const isMediaRef = (value) => typeof value === 'string' && value.startsWith(PREFIX)

/** 새 객체는 ID가 기준이다. ID가 없는 이전 문서만 src의 media 참조를 사용한다. */
export function mediaId(value) {
  if (value && typeof value === 'object') {
    if (typeof value.mediaFileId === 'string' && value.mediaFileId.trim()) return value.mediaFileId.trim()
    return mediaId(value.src)
  }
  return isMediaRef(value) ? value.slice(PREFIX.length) || null : null
}

export function mediaReference(id) { return PREFIX + id }

export function collectMediaIds(value) {
  const ids = new Set()
  function visit(item) {
    if (!item) return
    if (Array.isArray(item)) { item.forEach(visit); return }
    const id = mediaId(item)
    if (id) ids.add(id)
    if (typeof item === 'object') {
      // 요소에 붙은 원본 PDF(pdfSource)는 이미지 보관소에 없는 파일이다. 이미지로 찾으면 '원본을 찾을 수 없다'고 나온다.
      // 필기 점에는 미디어 참조가 없다. 큰 문서에서 점까지 훑으면 획을 그을 때마다 앱이 멈춘다.
      Object.entries(item).forEach(([key, child]) => {
        if (key === 'pdfSource' || (key === 'points' && item.type === 'stroke')) return
        if (child && typeof child === 'object') visit(child)
      })
    }
  }
  visit(value)
  return [...ids]
}

/** URL 캐시는 표시 전용이며 페이지 JSON에 저장하지 않는다. */
export function createMediaRegistry({ load, release = () => {}, idleMs = 30000, schedule = setTimeout, cancel = clearTimeout }) {
  const entries = new Map()
  const owners = new Map()
  const timers = new Map()
  const listeners = new Set()
  let revision = 0
  let errorSnapshot = []
  const notify = () => {
    revision += 1
    const next = [...entries].filter(([, entry]) => entry.status === 'error').map(([id, entry]) => ({ id, error: entry.error }))
    if (next.length !== errorSnapshot.length || next.some((entry, i) => entry.id !== errorSnapshot[i].id || entry.error !== errorSnapshot[i].error)) errorSnapshot = next
    listeners.forEach((listener) => listener())
  }
  const idle = (id) => {
    if (owners.get(id) || timers.has(id)) return
    const timer = schedule(() => {
      timers.delete(id)
      if (owners.get(id)) return
      const entry = entries.get(id)
      if (entry?.status === 'loading') return
      if (entry?.uri) release(entry.uri)
      // 오류 안내는 페이지 밖에서도 유지한다. 파일을 지우지 않고 URL만 정리한다.
      if (entry?.status === 'error') entries.set(id, { status: 'error', error: entry.error, uri: null })
      else entries.delete(id)
      notify()
    }, idleMs)
    timer?.unref?.()
    timers.set(id, timer)
  }
  const seed = (id, value) => {
    const current = entries.get(id)
    if (current?.status === 'ready') {
      if (value.uri !== current.uri) release(value.uri)
      return current
    }
    const entry = { ...value, status: 'ready', error: null }
    entries.set(id, entry)
    idle(id)
    notify()
    return entry
  }
  return {
    get: (id) => entries.get(id),
    getRevision: () => revision,
    getErrorSnapshot: () => errorSnapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    retain(id) {
      if (!id) return () => {}
      owners.set(id, (owners.get(id) ?? 0) + 1)
      if (timers.has(id)) { cancel(timers.get(id)); timers.delete(id) }
      let active = true
      return () => {
        if (!active) return
        active = false
        const count = (owners.get(id) ?? 1) - 1
        if (count) owners.set(id, count)
        else { owners.delete(id); idle(id) }
      }
    },
    failures: () => [...entries].filter(([, entry]) => entry.status === 'error').map(([id, entry]) => ({ id, error: entry.error })),
    fail(id, error) {
      const entry = entries.get(id)
      if (entry?.status !== 'ready') return
      // 표시 중인 URL은 마지막 구독자가 떠날 때 해제한다.
      entries.set(id, { ...entry, status: 'error', error })
      notify()
    },
    seed,
    ensure(id) {
      if (!id) return Promise.resolve(null)
      const current = entries.get(id)
      if (current?.status === 'ready') return Promise.resolve(current)
      if (current?.status === 'loading') return current.promise
      if (current?.uri) release(current.uri)
      const promise = Promise.resolve().then(() => load(id)).then((value) => seed(id, value), (error) => {
        if (entries.get(id)?.status === 'ready') return entries.get(id)
        entries.set(id, { status: 'error', error, uri: null })
        idle(id)
        notify()
        throw error
      })
      entries.set(id, { status: 'loading', promise, uri: null })
      notify()
      return promise
    },
  }
}
