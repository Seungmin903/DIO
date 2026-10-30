import { useEffect } from 'react'
import { AppState, Dimensions, Keyboard, Platform } from 'react-native'

// 내비게이션 바 모듈이 없는 예전 개발 빌드에서도 앱이 열리도록, 없으면 그냥 넘어간다.
let NavigationBar = null
if (Platform.OS === 'android') {
  try { NavigationBar = require('expo-navigation-bar') } catch { NavigationBar = null }
}

// 바가 나타난 뒤 다시 숨기기까지 기다리는 시간. 쓸어 올려 잠깐 쓰는 동안은 두고, 그 뒤엔 숨긴다.
const REHIDE_DELAY_MS = 1800

// Android 하단 내비게이션(뒤로가기) 바를 숨긴다. 아래에서 위로 쓸어 올리면 잠시 나타났다가 다시 숨는다.
// 시스템은 앱이 앞으로 올 때뿐 아니라 키보드 · 대화상자(Modal) · 창 크기/회전이 바뀔 때도 바를 되살릴 수 있어서,
// 그런 때마다 다시 숨기고, 바가 실제로 보이게 되면(시스템이 알려 준다) 잠시 뒤 숨긴다.
export function useHiddenNavigationBar() {
  useEffect(() => {
    if (!NavigationBar) return undefined
    let timer = null
    const hide = () => { NavigationBar.setVisibilityAsync('hidden').catch(() => {}) }
    // 바뀐 직후엔 시스템이 아직 바를 그리는 중일 수 있어 바로 한 번, 조금 뒤에 한 번 더 숨긴다.
    const hideSoon = () => { hide(); clearTimeout(timer); timer = setTimeout(hide, REHIDE_DELAY_MS) }
    hide()
    const subscriptions = [
      AppState.addEventListener('change', state => { if (state === 'active') hideSoon() }),
      Dimensions.addEventListener('change', hideSoon),
      Keyboard.addListener('keyboardDidHide', hideSoon),
      Keyboard.addListener('keyboardDidShow', hideSoon),
      NavigationBar.addVisibilityListener?.(({ visibility }) => { if (visibility === 'visible') hideSoon() }),
    ].filter(Boolean)
    return () => { clearTimeout(timer); subscriptions.forEach(subscription => subscription.remove()) }
  }, [])
}
