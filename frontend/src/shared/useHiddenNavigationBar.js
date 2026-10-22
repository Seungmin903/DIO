import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'

// 내비게이션 바 모듈이 없는 예전 개발 빌드에서도 앱이 열리도록, 없으면 그냥 넘어간다.
let NavigationBar = null
if (Platform.OS === 'android') {
  try { NavigationBar = require('expo-navigation-bar') } catch { NavigationBar = null }
}

// Android 하단 내비게이션(뒤로가기) 바를 숨긴다. 아래에서 위로 쓸어 올리면 잠시 나타났다가 다시 숨는다.
// 앱이 다시 앞으로 오면 시스템이 바를 되살릴 수 있어 그때마다 다시 숨긴다.
export function useHiddenNavigationBar() {
  useEffect(() => {
    if (!NavigationBar) return undefined
    const hide = () => { NavigationBar.setVisibilityAsync('hidden').catch(() => {}) }
    hide()
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') hide() })
    return () => subscription.remove()
  }, [])
}
