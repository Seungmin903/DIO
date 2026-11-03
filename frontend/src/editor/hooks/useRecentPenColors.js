import { useEffect, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createRecentPenColors } from '../utils/recentPenColors.js'

const stores = {
  pen: createRecentPenColors(AsyncStorage, 'pen'),
  highlighter: createRecentPenColors(AsyncStorage, 'highlighter'),
}

export function recordPenColorUse(stroke) {
  if (stroke?.type !== 'stroke') return
  const store = stores[stroke.penKind === 'highlighter' ? 'highlighter' : 'pen']
  store.record(stroke.color).catch(() => console.warn('최근 사용한 색상을 저장하지 못했어요.'))
}

export function useRecentPenColors(scope = 'pen') {
  const store = stores[scope === 'highlighter' ? 'highlighter' : 'pen']
  const colors = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => { store.load().catch(() => console.warn('최근 사용한 색상을 불러오지 못했어요.')) }, [store])
  return colors
}
