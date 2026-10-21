import { useEffect, useRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { notePointerDown, notePointerUp, touchKind } from '../../utils/stylus'

/**
 * 편집 화면의 보는 영역. 페이지를 offset 위치에 zoom 배율로 둔다.
 * - 두 손가락: 벌리고 오므려 확대·축소(손가락 사이 지점 기준), 끌어서 화면 이동
 * - 한 손가락은 그대로 캔버스(선택·이동·펜)에 넘긴다. 손바닥 도구(dragToPan)일 때는 한 손가락으로 화면을 옮긴다.
 * - 웹: 휠·트랙패드로 이동, Ctrl(⌘)+휠·트랙패드 핀치로 확대·축소
 * 예전의 가로·세로 ScrollView 는 기기에서 요소를 끄는 손가락을 스크롤이 먼저 가져가서 쓰지 않는다.
 *
 * scale 은 '화면에 맞춤' 대비 배율, offset 은 페이지 왼쪽 위의 화면 위치.
 * onPinch(scale, pagePoint, screenPoint): pagePoint(페이지 좌표)가 screenPoint 에 오도록 scale 로 맞춰 달라는 요청
 * onPan(dx, dy): 화면 이동 요청. 배율·위치 제한은 부모가 한다.
 */
export default function Viewport({ zoom, offset, scale, onPinch, onPan, onTapEmpty, dragToPan = false, children, style, onLayout }) {
  const pinch = useRef(null)
  const origin = useRef({ x: 0, y: 0 })
  const nodeRef = useRef(null)
  const tap = useRef(null) // 페이지 밖 여백을 한 손가락으로 누른 위치
  const panFrom = useRef(null) // 손바닥 도구: 지난번 손가락 위치
  const latest = useRef({ zoom, offset, scale, onPinch, onPan, onTapEmpty, dragToPan })
  latest.current = { zoom, offset, scale, onPinch, onPan, onTapEmpty, dragToPan }

  // 화면(창) 좌표 → 보는 영역 안 좌표
  const measure = () => nodeRef.current?.measureInWindow?.((x, y) => (origin.current = { x, y }))
  const local = (touch) => ({ x: touch.pageX - origin.current.x, y: touch.pageY - origin.current.y })

  // 두 손가락 확대·축소·이동. 펜이 함께 닿아 있으면(손바닥 + 펜) 제스처가 아니다.
  const twoFingers = (event) => {
    const touches = event.nativeEvent.touches ?? []
    return touches.length >= 2 && !touches.some((t) => touchKind(t) === 'pen')
  }
  const startPinch = (event) => {
    const [a, b] = event.nativeEvent.touches
    const p = local(a)
    const q = local(b)
    const { zoom: z, offset: o, scale: s } = latest.current
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
    // 손가락 사이 아래에 있던 페이지 지점을 계속 손가락 사이에 둔다.
    pinch.current = {
      distance: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)),
      scale: s,
      point: { x: (mid.x - o.x) / z, y: (mid.y - o.y) / z },
    }
  }

  const responder = {
    onStartShouldSetResponderCapture: twoFingers,
    onMoveShouldSetResponderCapture: twoFingers,
    // 페이지가 받지 않은 한 손가락 터치(= 페이지 밖 여백)도 여기서 받는다. 떼면 선택 해제.
    onStartShouldSetResponder: () => true,
    // 여백에 얹힌 손바닥(탭 대기 중)이 펜 입력을 막지 않게, 확대·축소나 손바닥 도구로 옮기는 중이 아니면 넘긴다.
    onResponderTerminationRequest: () => !pinch.current && !latest.current.dragToPan,
    onResponderGrant: (event) => {
      measure()
      panFrom.current = latest.current.dragToPan ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : null
      if (twoFingers(event)) startPinch(event)
      else tap.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
    },
    onResponderMove: (event) => {
      if (tap.current && Math.hypot(event.nativeEvent.pageX - tap.current.x, event.nativeEvent.pageY - tap.current.y) > 10)
        tap.current = null
      if (!twoFingers(event)) {
        // 손바닥 도구: 한 손가락으로 끌어 화면 이동 (두 손가락에서 한 손가락으로 돌아오면 그 자리부터 다시)
        if (latest.current.dragToPan && (event.nativeEvent.touches?.length ?? 1) === 1) {
          const { pageX, pageY } = event.nativeEvent
          if (panFrom.current) latest.current.onPan(pageX - panFrom.current.x, pageY - panFrom.current.y)
          panFrom.current = { x: pageX, y: pageY }
        }
        return
      }
      panFrom.current = null
      tap.current = null
      if (!pinch.current) startPinch(event)
      const [a, b] = event.nativeEvent.touches
      const p = local(a)
      const q = local(b)
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
      const g = pinch.current
      latest.current.onPinch(g.scale * (Math.hypot(p.x - q.x, p.y - q.y) / g.distance), g.point, mid)
    },
    onResponderRelease: () => {
      pinch.current = null
      panFrom.current = null
      if (tap.current) latest.current.onTapEmpty?.()
      tap.current = null
    },
    onResponderTerminate: () => {
      pinch.current = null
      panFrom.current = null
      tap.current = null
    },
  }

  // 웹: 휠·트랙패드
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined
    const node = nodeRef.current
    if (!node?.addEventListener) return undefined
    const handleWheel = (event) => {
      event.preventDefault()
      const { zoom: z, offset: o, scale: s, onPinch: pinchTo, onPan: panBy } = latest.current
      if (event.ctrlKey || event.metaKey) {
        const rect = node.getBoundingClientRect()
        const at = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        pinchTo(s * Math.exp(-event.deltaY * 0.01), { x: (at.x - o.x) / z, y: (at.y - o.y) / z }, at)
      } else {
        panBy(-event.deltaX, -event.deltaY)
      }
    }
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <View
      ref={nodeRef}
      style={[styles.viewport, style]}
      onLayout={(event) => {
        measure()
        onLayout?.(event)
      }}
      {...responder}
      // 펜·손가락 구분: 포인터 이벤트의 pointerType 을 터치 identifier 별로 적어 둔다 (utils/stylus)
      onPointerDownCapture={notePointerDown}
      onPointerUpCapture={notePointerUp}
      onPointerCancelCapture={notePointerUp}
    >
      <View style={{ position: 'absolute', left: offset.x, top: offset.y }}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  // 웹 터치: 브라우저 자체 확대·스크롤 대신 이 영역이 두 손가락 제스처를 받는다.
  viewport: { flex: 1, overflow: 'hidden', ...Platform.select({ web: { touchAction: 'none' }, default: {} }) },
})
