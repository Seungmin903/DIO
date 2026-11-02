import { useRef } from 'react'
import { View } from 'react-native'

// 닫는 동안 이미 숨긴 목록을 다시 렌더하지 않고, 다시 열면 최신 내용을 표시한다.
export default function PagePanelVisibility({ enabled, hidden, children }) {
  const lastVisible = useRef(children)
  if (!hidden) lastVisible.current = children
  if (!enabled) return children
  return <View style={hidden ? { opacity: 0 } : undefined} pointerEvents={hidden ? 'none' : 'auto'}
    accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>
    {hidden ? lastVisible.current : children}
  </View>
}
