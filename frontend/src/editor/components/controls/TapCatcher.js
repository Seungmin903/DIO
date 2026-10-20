import { useRef } from 'react'
import { View } from 'react-native'

const TAP_SLOP = 10 // 손가락 탭의 흔들림 (캔버스 빈 곳 탭과 같은 기준)

/**
 * 빈 곳 탭을 받는 조각. 다른 요소를 감싸지 않고(자식 없음) 빈 자리에만 깔아 둔다.
 * 목록·스크롤을 감싸는 부모가 터치를 잡으면 Android 에서 스크롤이 잘 안 먹어서, 감싸지 않는 방식으로 둔다.
 * 살짝 누르고 뗄 때만 onTap, 끌면 무시한다.
 */
export default function TapCatcher({ onTap, style }) {
  const start = useRef(null)
  return (
    <View
      style={style}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(event) => {
        start.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
      }}
      onResponderRelease={(event) => {
        const s = start.current
        start.current = null
        if (s && Math.hypot(event.nativeEvent.pageX - s.x, event.nativeEvent.pageY - s.y) < TAP_SLOP) onTap()
      }}
      onResponderTerminate={() => {
        start.current = null
      }}
    />
  )
}
