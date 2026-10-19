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
      Object.values(item).forEach((child) => {
        if (child && typeof child === 'object') visit(child)
      })
    }
  }
  visit(value)
  return [...ids]
}

/** URL 캐시는 표시 전용이며 페이지 JSON에 저장하지 않는다. */
export function createMediaRegistry({ load, release = () => {} }) {
  const entries = new Map()
  const listeners = new Set()
  let revision = 0
  const notify = () => { revision += 1; listeners.forEach((listener) => listener()) }
  const seed = (id, value) => {
    const current = entries.get(id)
    if (current?.status === 'ready') {
      if (value.uri !== current.uri) release(value.uri)
      return current
    }
    const entry = { ...value, status: 'ready', error: null }
    entries.set(id, entry)
    notify()
    return entry
  }
  return {
    get: (id) => entries.get(id),
    getRevision: () => revision,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    seed,
    ensure(id) {
      if (!id) return Promise.resolve(null)
      const current = entries.get(id)
      if (current?.status === 'ready') return Promise.resolve(current)
      if (current?.status === 'loading') return current.promise
      const promise = Promise.resolve().then(() => load(id)).then((value) => seed(id, value), (error) => {
        if (entries.get(id)?.status === 'ready') return entries.get(id)
        entries.set(id, { status: 'error', error, uri: null })
        notify()
        throw error
      })
      entries.set(id, { status: 'loading', promise, uri: null })
      notify()
      return promise
    },
  }
}
