import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

// S펜 사이드버튼(modules/dio-stylus, 안드로이드 전용). 모듈이 없는 예전 빌드 · iOS · 웹에서는 아무것도 안 한다.
// onChange(pressed) 는 버튼을 누르거나 뗄 때 부른다. 네이티브가 펜이 떠 있을 때와 뗄 때만 보내 획 중간에는 오지 않는다.
const stylusModule = () => (Platform.OS === 'android' ? globalThis.expo?.modules?.DioStylus ?? null : null)

export function useSPenSideButton(onChange, enabled = true) {
  const latest = useRef(onChange)
  latest.current = onChange
  useEffect(() => {
    if (!enabled) return undefined
    const native = stylusModule()
    if (typeof native?.addListener !== 'function') return undefined
    const subscription = native.addListener('onSideButton', (event) => latest.current?.(Boolean(event?.pressed)))
    // 구독 전(편집 화면에 들어오기 전)에 누른 버튼은 이벤트가 사라졌으니 지금 상태로 맞춘다.
    let pressed = false
    try { pressed = Boolean(native.isSideButtonPressed?.()) } catch { /* 예전 개발 빌드 */ }
    if (pressed) latest.current?.(true)
    return () => subscription?.remove?.()
  }, [enabled])
}
