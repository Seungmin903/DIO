import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { DEFAULT_PEN_SETTINGS } from '../utils/penSettings.js'
import { createPenColorPreference } from '../utils/penColorPreference.js'
import { useToolPreference } from '../utils/toolPreferences.js'

const preference = createPenColorPreference(AsyncStorage)

export function usePenSettings() {
  const color = useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getSnapshot)
  const [options, setOptions] = useToolPreference('pen', DEFAULT_PEN_SETTINGS)
  useEffect(() => { preference.load() }, [])
  const settings = useMemo(() => ({ ...options, color }), [options, color])
  const change = useCallback(next => {
    setOptions(next)
    // 기본 색을 다시 고른 경우도 명시적 선택이다. 늦은 복원이 덮지 않게 한다.
    preference.setColor(next.color).catch(() => console.warn('펜 색상을 저장하지 못했어요.'))
  }, [])
  return [settings, change]
}
