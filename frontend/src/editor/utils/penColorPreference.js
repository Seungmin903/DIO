import { DEFAULT_PEN_SETTINGS, normalizeHex } from './penSettings.js'

export const PEN_COLOR_KEY = 'dio-editor-last-pen-color-v1'

// Shared by editor instances. A late disk read must never undo a new choice.
export function createPenColorPreference(storage) {
  let color = DEFAULT_PEN_SETTINGS.color, revision = 0, loading, writes = Promise.resolve()
  const listeners = new Set()
  const publish = next => { color = next; listeners.forEach(listener => listener()) }
  return {
    getSnapshot: () => color,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    load() {
      if (!loading) {
        const before = revision
        loading = storage.getItem(PEN_COLOR_KEY).then(raw => {
          const saved = typeof raw === 'string' ? normalizeHex(raw) : null
          if (saved && before === 0 && revision === before) publish(saved)
        }).catch(() => { loading = null })
      }
      return loading
    },
    setColor(value) {
      const next = typeof value === 'string' ? normalizeHex(value) : null
      if (!next) return Promise.reject(new Error('펜 색상이 올바르지 않아요.'))
      revision++
      publish(next)
      const saved = writes.catch(() => {}).then(() => storage.setItem(PEN_COLOR_KEY, next))
      writes = saved
      return saved
    },
  }
}
