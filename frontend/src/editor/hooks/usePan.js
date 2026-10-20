import { useLayoutEffect, useRef, useState } from 'react'
import { PanResponder } from 'react-native'

const MOVE_THRESHOLD = 3

function createResponder(handlersRef) {
  let startTime = 0
  let moved = false
  return PanResponder.create({
    onStartShouldSetPanResponder: () => !handlersRef.current.disabled,
    onMoveShouldSetPanResponder: () => !handlersRef.current.disabled,
    // 두 번째 손가락이 닿으면(확대·축소, 화면 이동) 보는 영역에 넘긴다. 한 손가락 동작은 끝까지 지킨다.
    onPanResponderTerminationRequest: (event) => (event.nativeEvent.touches?.length ?? 0) > 1,
    onPanResponderGrant: (event) => {
      startTime = Date.now()
      moved = false
      handlersRef.current.onStart?.(event.nativeEvent)
    },
    onPanResponderMove: (event, gesture) => {
      if (Math.hypot(gesture.dx, gesture.dy) > MOVE_THRESHOLD) moved = true
      handlersRef.current.onMove?.(gesture.dx, gesture.dy, event.nativeEvent)
    },
    onPanResponderRelease: () => {
      handlersRef.current.onEnd?.({ moved, duration: Date.now() - startTime })
    },
    onPanResponderTerminate: () => {
      handlersRef.current.onEnd?.({ moved, duration: 0, cancelled: true })
    },
  })
}

/**
 * PanResponder 를 감싼 훅. 핸들러는 최신 값을 쓰도록 ref 로 보관한다.
 * onStart(event) / onMove(dx, dy, event) / onEnd({ moved, duration })
 */
export function usePan(handlers) {
  const handlersRef = useRef(handlers)
  useLayoutEffect(() => {
    handlersRef.current = handlers
  })
  const [responder] = useState(() => createResponder(handlersRef))
  return responder.panHandlers
}
