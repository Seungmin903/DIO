import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { applyPenKind, DEFAULT_PEN_SETTINGS, limitInkPen, rememberPen } from '../utils/penSettings.js'
import { createPenColorPreference } from '../utils/penColorPreference.js'
import { useToolPreference } from '../utils/toolPreferences.js'

const preference = createPenColorPreference(AsyncStorage)
const NO_KINDS = {}

export function usePenSettings() {
  const color = useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getSnapshot)
  const [options, setOptions] = useToolPreference('pen', DEFAULT_PEN_SETTINGS)
  const [kinds, setKinds] = useToolPreference('penKinds', NO_KINDS)
  useEffect(() => { preference.load() }, [])
  // 잉크펜 꾸미기를 끈 빌드에서는 잉크펜 색 · 글리터 · 테를 정해 둔 값으로 맞춘다(limitInkPen)
  const settings = useMemo(() => limitInkPen({ ...options, color }), [options, color])
  const change = useCallback(next => {
    // 종류를 바꾸면 지금 종류의 굵기 · 불투명도를 기억해 두고 고른 종류의 마지막 값을 되살린다
    const switched = next.kind !== options.kind
    // 나가는 종류를 기억할 때는 색도 함께 담는다(settings 에만 색이 있다 — options 에는 없다)
    const memory = rememberPen(kinds, switched ? settings : next)
    const resolved = limitInkPen(switched ? applyPenKind(memory, next, next.kind) : next)
    setKinds(rememberPen(memory, resolved))
    setOptions(resolved)
    // 종류를 바꾸면 그 종류가 마지막에 쓰던 색으로 돌아간다(사용자 2026-11-10).
    // 기본 색을 다시 고른 경우도 명시적 선택이다. 늦은 복원이 덮지 않게 한다.
    preference.setColor(resolved.color).catch(() => console.warn('펜 색상을 저장하지 못했어요.'))
  }, [options, settings, kinds])
  return [settings, change]
}
