import { useEffect, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { pushPaperColor, restorePaperColors } from '../utils/paperColorRow.js'

// 속지 옵션에서 직접 고른 색(지금은 노선 색)을 기기에 기억한다. 색 줄(paperColorRow)의 왼쪽에 들어온다.
const KEY = kind => `dio-editor-paper-colors-v1:${kind}`
const stores = new Map()

function storeFor(kind) {
  if (stores.has(kind)) return stores.get(kind)
  let colors = [], loading = null, loaded = false // loaded: 저장된 목록을 한 번이라도 제대로 읽었다
  const listeners = new Set()
  const publish = next => { colors = next; listeners.forEach(listener => listener()) }
  const load = () => loading ??= AsyncStorage.getItem(KEY(kind)).then(raw => {
    let saved = []
    try { saved = raw ? JSON.parse(raw) : [] } catch { saved = [] }
    loaded = true
    publish(restorePaperColors(saved))
  }).catch(() => { loading = null })
  const store = {
    load,
    getSnapshot: () => colors,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    async record(color) {
      await load()
      const next = pushPaperColor(colors, color)
      if (next === colors) return
      publish(next)
      // 읽기에 실패한 채(loaded 아님)로는 저장하지 않는다 — 빈 목록으로 저장돼 있던 최근 색을 지워 버릴 수 있다. 화면에만 반영하고 다음 기록 때 다시 읽는다
      if (!loaded) return
      try { await AsyncStorage.setItem(KEY(kind), JSON.stringify(next)) } catch { /* 저장 실패는 다음 기록에서 다시 시도한다 */ }
    },
  }
  stores.set(kind, store)
  return store
}

/** kind: 'route'(종류별로 따로 기억한다). → [최근 직접 고른 색…]. 저장 없이 읽기만 하는 곳은 recordPaperColor 를 쓴다 */
export function usePaperColorRecents(kind) {
  const store = storeFor(kind)
  const colors = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => { store.load() }, [store])
  return colors
}
export const recordPaperColor = (kind, color) => storeFor(kind).record(color).catch(() => {})
