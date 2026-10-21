import { useContext, useLayoutEffect, useRef, useState } from 'react'
import { PanResponder } from 'react-native'
import { PalmRejectionContext, usePalmRejectingPan } from './usePalmRejection'

const MOVE_THRESHOLD = 3

function createResponder(handlersRef) {
  let startTime = 0
  let moved = false
  return PanResponder.create({
    onStartShouldSetPanResponder: () => !handlersRef.current.disabled,
    // 움직일 때 새로 터치를 가져가지 않는다. (true 면 손가락이 조금만 움직여도 안쪽 버튼의 누름을 빼앗아
    // Android 에서 편집 바 같은 버튼이 하나도 눌리지 않았다. 끌기는 처음 닿을 때 이미 잡는다)
    onMoveShouldSetPanResponder: () => false,
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
 * PalmRejectionContext 안(펜·지우개 입력 영역)에서는 손바닥을 거르는 끌기를 쓴다.
 */
export function usePan(handlers) {
  const handlersRef = useRef(handlers)
  useLayoutEffect(() => {
    handlersRef.current = handlers
  })
  const [responder] = useState(() => createResponder(handlersRef))
  const palm = useContext(PalmRejectionContext)
  const palmHandlers = usePalmRejectingPan(handlers)
  return palm ? palmHandlers : responder.panHandlers
}
