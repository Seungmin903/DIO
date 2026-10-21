import { useEffect } from 'react'
import { Platform } from 'react-native'

// 방향 잠금 모듈이 없는 예전 개발 빌드에서도 앱이 열리도록, 없으면 잠그지 않고 넘어간다.
let ScreenOrientation = null
try { ScreenOrientation = require('expo-screen-orientation') } catch { ScreenOrientation = null }

// 웹은 전체 화면이 아니면 방향을 잠글 수 없어서 건드리지 않는다.
export const CAN_LOCK_ORIENTATION = Platform.OS !== 'web' && Boolean(ScreenOrientation)

// 폰은 세로로 고정하고 편집기에서만 가로를 허용한다. 태블릿은 모든 방향을 쓴다.
// preferred('portrait' | 'landscape'): 편집기에서 세로·가로 전환 버튼으로 고른 방향. 없으면 기기를 돌리는 대로 따른다.
export function useOrientationLock(formFactor, allowLandscape, preferred = null) {
  useEffect(() => {
    if (!CAN_LOCK_ORIENTATION) return
    const { OrientationLock, lockAsync } = ScreenOrientation
    let lock = OrientationLock.DEFAULT // 플랫폼 기본값(iPhone은 거꾸로 든 세로 제외)
    if (formFactor === 'phone' && !allowLandscape) lock = OrientationLock.PORTRAIT_UP
    else if (formFactor === 'phone' && preferred) lock = preferred === 'landscape' ? OrientationLock.LANDSCAPE : OrientationLock.PORTRAIT_UP
    lockAsync(lock).catch(() => {})
  }, [formFactor, allowLandscape, preferred])
}
