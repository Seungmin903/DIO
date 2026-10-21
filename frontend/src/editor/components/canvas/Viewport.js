import { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { notePointerDown, notePointerUp, touchKind } from '../../utils/stylus'

const WHEEL_IDLE_MS = 160 // 휠이 이만큼 멈추면 확대·이동을 확정한다

/**
 * 편집 화면의 보는 영역. 페이지를 offset 위치에 zoom 배율로 둔다.
 * - 두 손가락: 벌리고 오므려 확대·축소(손가락 사이 지점 기준), 끌어서 화면 이동
 * - 한 손가락은 그대로 캔버스(선택·이동·펜)에 넘긴다. 손바닥 도구(dragToPan)일 때는 한 손가락으로 화면을 옮긴다.
 * - 웹: 휠·트랙패드로 이동, Ctrl(⌘)+휠·트랙패드 핀치로 확대·축소
 * 예전의 가로·세로 ScrollView 는 기기에서 요소를 끄는 손가락을 스크롤이 먼저 가져가서 쓰지 않는다.
 *
 * scale 은 '화면에 맞춤' 대비 배율, offset 은 페이지 왼쪽 위의 화면 위치.
 *
 * 손가락으로 확대·축소·이동하는 동안에는 부모 상태를 바꾸지 않고 페이지를 transform 으로만 늘이고 옮긴다.
 * (매 프레임 배율이 바뀌면 속지 SVG·요소·썸네일이 전부 다시 그려져 버벅였다) 손을 떼면 onView 로 한 번만 확정한다.
 * resolveZoom(scale, pagePoint, screenPoint) / resolvePan(view, dx, dy): 부모의 배율·위치 제한을 적용한 보기 { scale, zoom, x, y }
 */
export default function Viewport({ zoom, offset, scale, resolveZoom, resolvePan, onView, onTapEmpty, dragToPan = false, children, style, onLayout }) {
  const pinch = useRef(null)
  const [live, setLive] = useState(null) // 손가락으로 움직이는 중인 보기 (확정 전)
  const liveRef = useRef(null)
  const origin = useRef({ x: 0, y: 0 })
  const nodeRef = useRef(null)
  const tap = useRef(null) // 페이지 밖 여백을 한 손가락으로 누른 위치
  const panFrom = useRef(null) // 손바닥 도구: 지난번 손가락 위치
  const latest = useRef({})
  latest.current = { zoom, offset, scale, resolveZoom, resolvePan, onView, onTapEmpty, dragToPan }
  const currentView = () => liveRef.current ?? { scale: latest.current.scale, zoom: latest.current.zoom, x: latest.current.offset.x, y: latest.current.offset.y }
  const preview = (view) => {
    liveRef.current = view
    setLive(view)
  }
  // 손을 떼면 움직인 결과를 부모에 한 번만 넘긴다. (같은 이벤트 안이라 transform 해제와 함께 한 번에 그려진다)
  const commit = () => {
    const view = liveRef.current
    liveRef.current = null
    setLive(null)
    if (view) latest.current.onView?.(view)
  }

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
    const { zoom: z, x: ox, y: oy, scale: s } = currentView()
    const o = { x: ox, y: oy }
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
          if (panFrom.current) preview(latest.current.resolvePan(currentView(), pageX - panFrom.current.x, pageY - panFrom.current.y))
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
      preview(latest.current.resolveZoom(g.scale * (Math.hypot(p.x - q.x, p.y - q.y) / g.distance), g.point, mid))
    },
    onResponderRelease: () => {
      pinch.current = null
      panFrom.current = null
      commit()
      if (tap.current) latest.current.onTapEmpty?.()
      tap.current = null
    },
    onResponderTerminate: () => {
      pinch.current = null
      panFrom.current = null
      commit()
      tap.current = null
    },
  }

  // 웹: 휠·트랙패드
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined
    const node = nodeRef.current
    if (!node?.addEventListener) return undefined
    // 휠도 손가락 제스처처럼 transform 으로 미리 보여 주고, 휠이 멈추면 한 번만 확정한다.
    let idle = null
    const handleWheel = (event) => {
      event.preventDefault()
      const { resolveZoom: zoomTo, resolvePan: panTo } = latest.current
      const view = currentView()
      if (event.ctrlKey || event.metaKey) {
        const rect = node.getBoundingClientRect()
        const at = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        preview(zoomTo(view.scale * Math.exp(-event.deltaY * 0.01), { x: (at.x - view.x) / view.zoom, y: (at.y - view.y) / view.zoom }, at))
      } else {
        preview(panTo(view, -event.deltaX, -event.deltaY))
      }
      clearTimeout(idle)
      idle = setTimeout(commit, WHEEL_IDLE_MS)
    }
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      clearTimeout(idle)
      node.removeEventListener('wheel', handleWheel)
    }
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
      <View
        style={[
          { position: 'absolute', left: offset.x, top: offset.y },
          live && {
            transformOrigin: 'left top',
            transform: [{ translateX: live.x - offset.x }, { translateY: live.y - offset.y }, { scale: live.zoom / zoom }],
          },
        ]}
      >
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // 웹 터치: 브라우저 자체 확대·스크롤 대신 이 영역이 두 손가락 제스처를 받는다.
  viewport: { flex: 1, overflow: 'hidden', ...Platform.select({ web: { touchAction: 'none' }, default: {} }) },
})
