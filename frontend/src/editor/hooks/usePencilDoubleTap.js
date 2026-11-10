import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

// 애플펜슬 더블탭(modules/dio-pencil, iOS 전용). 모듈이 없는 예전 빌드 · 안드로이드 · 웹에서는 아무것도 안 한다.
// onTap(action) 의 action 은 iPad 설정값(utils/pencilDoubleTap.js 참고)이다.
const pencilModule = () => (Platform.OS === 'ios' ? globalThis.expo?.modules?.DioPencil ?? null : null)

export function usePencilDoubleTap(onTap, enabled = true) {
  const latest = useRef(onTap)
  latest.current = onTap
  useEffect(() => {
    if (!enabled) return undefined
    const native = pencilModule()
    if (typeof native?.addListener !== 'function') return undefined
    const subscription = native.addListener('onDoubleTap', (event) => latest.current?.(event?.action))
    return () => subscription?.remove?.()
  }, [enabled])
}
