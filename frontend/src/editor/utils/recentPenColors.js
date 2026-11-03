import { normalizeHex } from './penSettings.js'

export const RECENT_PEN_COLOR_LIMIT = 7
export const recentPenColorKey = scope => `dio-editor-used-colors-v1:${scope === 'highlighter' ? 'highlighter' : 'pen'}`
const hex = value => typeof value === 'string' ? normalizeHex(value) : null
export function normalizeRecentPenColors(value) {
  return Array.isArray(value) ? [...new Set(value.map(hex).filter(Boolean))].slice(0, RECENT_PEN_COLOR_LIMIT) : []
}

// This list records completed ink, independently of the selected color/presets.
// Queue early uses behind hydration so a late read cannot erase new history.
export function createRecentPenColors(storage, scope = 'pen') {
  let colors = [], loading, writes = Promise.resolve()
  const listeners = new Set(), key = recentPenColorKey(scope)
  const publish = next => { colors = next; listeners.forEach(listener => listener()) }
  const load = () => loading ??= Promise.resolve().then(() => storage.getItem(key))
    .then(raw => {
      let saved
      try { saved = raw ? JSON.parse(raw) : [] } catch { saved = [] }
      publish(normalizeRecentPenColors(saved))
    })
    .catch(error => {
      // I/O 실패는 빈 이력이 아니다. 다음 호출에서 다시 읽고 쓰기는 중단한다.
      loading = undefined
      throw error
    })
  return {
    load,
    getSnapshot: () => colors,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    record(value) {
      const color = hex(value)
      if (!color) return Promise.resolve(false)
      const save = async () => {
        await load()
        if (colors[0] === color) return false
        const next = [color, ...colors.filter(item => item !== color)].slice(0, RECENT_PEN_COLOR_LIMIT)
        // Keep the last persisted list if disk fails; later uses can retry.
        await storage.setItem(key, JSON.stringify(next))
        publish(next)
        return true
      }
      writes = writes.catch(() => {}).then(save)
      return writes
    },
  }
}
