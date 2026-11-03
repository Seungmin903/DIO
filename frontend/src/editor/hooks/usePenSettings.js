import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { applyPenKind, DEFAULT_PEN_SETTINGS, rememberPen } from '../utils/penSettings.js'
import { createPenColorPreference } from '../utils/penColorPreference.js'
import { useToolPreference } from '../utils/toolPreferences.js'

const preference = createPenColorPreference(AsyncStorage)
const NO_KINDS = {}

export function usePenSettings() {
  const color = useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getSnapshot)
  const [options, setOptions] = useToolPreference('pen', DEFAULT_PEN_SETTINGS)
  const [kinds, setKinds] = useToolPreference('penKinds', NO_KINDS)
  useEffect(() => { preference.load() }, [])
  const settings = useMemo(() => ({ ...options, color }), [options, color])
  const change = useCallback(next => {
    // 종류를 바꾸면 지금 종류의 굵기 · 불투명도를 기억해 두고 고른 종류의 마지막 값을 되살린다
    const switched = next.kind !== options.kind
    const memory = rememberPen(kinds, switched ? options : next)
    const resolved = switched ? applyPenKind(memory, next, next.kind) : next
    setKinds(rememberPen(memory, resolved))
    setOptions(resolved)
    // 기본 색을 다시 고른 경우도 명시적 선택이다. 늦은 복원이 덮지 않게 한다.
    preference.setColor(next.color).catch(() => console.warn('펜 색상을 저장하지 못했어요.'))
  }, [options, kinds])
  return [settings, change]
}
