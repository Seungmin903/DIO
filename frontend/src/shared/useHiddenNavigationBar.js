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
    // Expo Go·이전 개발 빌드에서는 JS 모듈만 존재하고 네이티브 구현 또는 메서드가
    // 빠질 수 있다. 이 경우 내부 색상/표시 설정 호출이 앱의 빨간 오류 화면으로
    // 이어지지 않도록 기능을 건너뛴다.
    if (!NavigationBar) return undefined
    const hide = () => {
      try {
        const pending = typeof NavigationBar.setHidden === 'function'
          ? NavigationBar.setHidden(true)
          : typeof NavigationBar.setVisibilityAsync === 'function'
            ? NavigationBar.setVisibilityAsync('hidden')
            : null
        // Expo Modules 구현은 환경에 따라 Promise를 돌려줄 수 있다. 예전 개발 빌드의
        // 네이티브 모듈이 이를 지원하지 않을 때 거부를 처리해 빨간 오류 화면을 막는다.
        if (pending && typeof pending.catch === 'function') pending.catch(() => {})
      } catch {
        // 시스템 내비게이션 바 제어는 보조 기능이므로 지원하지 않는 런타임에서는 무시한다.
      }
    }
    hide()
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') hide() })
    return () => subscription.remove()
  }, [])
}
