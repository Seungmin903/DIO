import { useEffect, useRef, useState } from 'react'
import { AppState, Platform, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import { readingDragLocked, readingGestureAction } from '../../utils/readingGestures.js'
import { notePointerDown, notePointerUp, touchKind, stylus, resetStylusPointers } from '../../utils/stylus'

const FINGER_PAN_SLOP = 12

const WHEEL_IDLE_MS = 160 // 휠이 이만큼 멈추면 확대·이동을 확정한다
const LONG_PRESS_MS = 450 // 캔버스 빈 곳 길게 누르기와 같은 시간

// 앱: 끌기를 시작 · 끝낼 때 변형이 붙었다 떨어지면 안쪽 Skia 캔버스(연필 획)가 한두 프레임 비어 깜박였다(2026-11-04 실기기 녹화).
// 그래서 변형은 늘 걸어 두고 값만 바꾼다. 웹은 변형이 있으면 글자가 흐려질 수 있어 예전 방식(끌 때만 변형) 그대로.
const IDENTITY_VIEW = Platform.OS === 'web' ? null : { transformOrigin: 'left top', transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] }
const viewTransform = (live, offset, zoom) => live
  ? { transformOrigin: 'left top', transform: [{ translateX: live.x - offset.x }, { translateY: live.y - offset.y }, { scale: live.zoom / zoom }] }
  : IDENTITY_VIEW

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
 * onMovingChange(moving): 확대·이동을 시작할 때 true, 확정할 때 false (그동안 GIF 를 멈추는 데 쓴다)
 * onLongPress(point): 한 손가락을 움직이지 않고 오래 누르면 그 자리의 페이지 좌표 { x, y } 를 알린다.
 *   손바닥 도구에서는 페이지도 이 영역이 받으므로, 캔버스 빈 곳 메뉴(붙여넣기 · 속지 색)를 여기서 연다. 그 뒤 손을 뗄 때까지 화면을 옮기지 않는다.
 */
export default function Viewport({ fingerPan = false, reading = false, readingLinkRef, onReadingAction, onReadingDrag, zoom, offset, scale, resolveZoom, resolvePan, onView, onMovingChange, onTapEmpty, onLongPress, dragToPan = false, interactionLocked = false, children, style, onLayout }) {
  const readerGesture = useRef(null)
  const viewportWidth = useRef(0)
  const viewportHeight = useRef(0)
  const pinch = useRef(null)
  const [live, setLive] = useState(null) // 손가락으로 움직이는 중인 보기 (확정 전)
  const liveRef = useRef(null)
  const origin = useRef({ x: 0, y: 0 })
  const nodeRef = useRef(null)
  const tap = useRef(null) // 페이지 밖 여백을 한 손가락으로 누른 위치
  const panFrom = useRef(null) // 손바닥 도구: 지난번 손가락 위치
  const fingerFrom = useRef(null)
  const fingerPanning = useRef(false)
  const hold = useRef(null) // 길게 누르기 { timer, fired }
  const motion = useRef({ panY: 0, zoomed: false, cancelled: false })
  const latest = useRef({})
  useEffect(() => {
    const reset = () => resetStylusPointers()
    const end = event => notePointerUp({ nativeEvent: event })
    const subscription = AppState?.addEventListener('change', state => { if (state !== 'active') reset() })
    if (Platform.OS === 'web') {
      window.addEventListener('pointerup', end, true)
      window.addEventListener('pointercancel', end, true)
      window.addEventListener('blur', reset)
    }
    return () => {
      subscription?.remove()
      if (Platform.OS === 'web') {
        window.removeEventListener('pointerup', end, true)
        window.removeEventListener('pointercancel', end, true)
        window.removeEventListener('blur', reset)
      }
      reset()
      clearTimeout(hold.current?.timer)
    }
  }, [])
  latest.current = { fingerPan, reading, readingLinkRef, onReadingAction, onReadingDrag, zoom, offset, scale, resolveZoom, resolvePan, onView, onMovingChange, onTapEmpty, onLongPress, dragToPan: interactionLocked ? false : dragToPan, interactionLocked }
  const currentView = () => liveRef.current ?? { scale: latest.current.scale, zoom: latest.current.zoom, x: latest.current.offset.x, y: latest.current.offset.y }
  const preview = (view) => {
    if (!liveRef.current) latest.current.onMovingChange?.(true)
    liveRef.current = view
    setLive(view)
  }
  // 손을 떼면 움직인 결과를 부모에 한 번만 넘긴다. (같은 이벤트 안이라 transform 해제와 함께 한 번에 그려진다)
  const resetMotion = () => { motion.current = { panY: 0, zoomed: false, cancelled: false } }
  const commit = (cancelled = false) => {
    const view = liveRef.current
    liveRef.current = null
    setLive(null)
    if (view) {
      latest.current.onView?.(view, { ...motion.current, cancelled })
      latest.current.onMovingChange?.(false)
    }
    resetMotion()
  }

  // 화면(창) 좌표 → 보는 영역 안 좌표
  const measure = () => nodeRef.current?.measureInWindow?.((x, y) => (origin.current = { x, y }))
  const local = (touch) => ({ x: touch.pageX - origin.current.x, y: touch.pageY - origin.current.y })

  // 두 손가락 확대·축소·이동. 펜이 함께 닿아 있으면(손바닥 + 펜) 제스처가 아니다.
  const twoFingers = (event) => {
    if (latest.current.interactionLocked || stylus?.activePen) return false
    const touches = event.nativeEvent.touches ?? []
    return touches.length >= 2 && !touches.some((t) => touchKind(t) === 'pen')
  }
  // 펜만 그리는 동안 펜 · 형광펜 · 지우개 위의 한 손가락은 화면을 옮긴다. 살짝 얹은 손바닥이 옮기지 않게 조금 움직인 뒤에 잡는다.
  const fingerPans = (event) => {
    const touches = event.nativeEvent.touches ?? []
    if (latest.current.interactionLocked || !latest.current.fingerPan) return false
    if (stylus?.activePen || touches.length !== 1 || touchKind(touches[0]) !== 'touch') return false
    const from = fingerFrom.current
    return Boolean(from && Math.hypot(touches[0].pageX - from.x, touches[0].pageY - from.y) > FINGER_PAN_SLOP)
  }
  const cancelHold = () => {
    clearTimeout(hold.current?.timer)
    hold.current = null
  }
  // 누른 자리(창 좌표)를 기억해 두고, 그 자리에 머물러 있으면 페이지 좌표로 알린다
  const startHold = (pageX, pageY) => {
    cancelHold()
    if (!latest.current.onLongPress) return
    const current = { fired: false }
    current.timer = setTimeout(() => {
      if (hold.current !== current || !tap.current || pinch.current) return
      current.fired = true
      const point = local({ pageX, pageY })
      const { zoom: z, x, y } = currentView()
      latest.current.onLongPress?.({ x: (point.x - x) / z, y: (point.y - y) / z })
    }, LONG_PRESS_MS)
    hold.current = current
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
      mid,
    }
  }

  const startReader = event => {
    const e = event.nativeEvent
    const target = event.target ?? e.target
    const element = target?.nodeType === 3 ? target.parentElement : target
    return { x: e.pageX, y: e.pageY, lastX: e.pageX, lastY: e.pageY, link: Boolean(element?.closest?.('[role="link"],a')), maxDistance: 0, at: Date.now(), scale: latest.current.scale, pinched: (e.touches?.length ?? 1) > 1 }
  }
  const responder = {
    onStartShouldSetResponderCapture: event => {
      if (latest.current.reading && !latest.current.interactionLocked) {
        if ((event.nativeEvent.touches?.length ?? 1) === 1) {
          if (latest.current.readingLinkRef) latest.current.readingLinkRef.current = false
          readerGesture.current = startReader(event)
        }
        else if (readerGesture.current) readerGesture.current.pinched = true
      }
      const started = event.nativeEvent.touches ?? []
      fingerFrom.current = started.length === 1 ? { x: started[0].pageX, y: started[0].pageY } : null
      return twoFingers(event)
    },
    onMoveShouldSetResponderCapture: event => {
      if (twoFingers(event) || fingerPans(event)) return true
      const g = readerGesture.current
      return Boolean(latest.current.reading && !latest.current.interactionLocked && g && Math.hypot(event.nativeEvent.pageX - g.x, event.nativeEvent.pageY - g.y) > 10)
    },
    // 페이지가 받지 않은 한 손가락 터치(= 페이지 밖 여백)도 여기서 받는다. 떼면 선택 해제.
    onStartShouldSetResponder: () => !latest.current.interactionLocked && !(latest.current.reading && readerGesture.current?.link),
    // 여백에 얹힌 손바닥(탭 대기 중)이 펜 입력을 막지 않게, 확대·축소나 손바닥 도구로 옮기는 중이 아니면 넘긴다.
    onResponderTerminationRequest: () => !pinch.current && !latest.current.dragToPan && !fingerPanning.current,
    onResponderGrant: (event) => {
      if (latest.current.interactionLocked) return
      measure()
      if (latest.current.reading && !readerGesture.current) readerGesture.current = startReader(event)
      resetMotion()
      fingerPanning.current = fingerPans(event)
      panFrom.current = latest.current.dragToPan || fingerPanning.current ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : null
      if (twoFingers(event)) { if (readerGesture.current) readerGesture.current.pinched = true; startPinch(event) }
      else if (!fingerPanning.current) {
        tap.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
        if (!latest.current.reading) startHold(event.nativeEvent.pageX, event.nativeEvent.pageY)
      }
    },
    onResponderStart: (event) => {
      // 이미 받은 한 손가락에 두 번째가 닿으면, 첫 이동 전에 기준 거리를 잡는다.
      if (pinch.current || hold.current?.fired || !twoFingers(event)) return
      tap.current = null
      cancelHold()
      startPinch(event)
    },
    onResponderMove: (event) => {
      if (latest.current.interactionLocked) return
      // 손가락(손바닥)으로 옮기던 중에 펜이 닿으면 옮기던 것을 되돌리고 펜에 맡긴다
      if (fingerPanning.current && stylus?.activePen) {
        fingerPanning.current = false
        panFrom.current = null
        liveRef.current = null
        setLive(null)
        latest.current.onMovingChange?.(false)
        resetMotion()
        return
      }
      if (latest.current.reading && readerGesture.current) {
        const g = readerGesture.current
        g.lastX = event.nativeEvent.pageX
        g.lastY = event.nativeEvent.pageY
        g.maxDistance = Math.max(g.maxDistance, Math.hypot(g.lastX - g.x, g.lastY - g.y))
        g.dragged = readingDragLocked({ dx: g.lastX - g.x, dy: g.lastY - g.y, duration: Date.now() - g.at, scale: g.scale, dragged: g.dragged })
        if (twoFingers(event)) g.pinched = true
        // 확대하지 않은 상태의 가로 끌기: 손가락을 따라 책장이 넘어간다
        const drag = latest.current.onReadingDrag
        if (drag && g.scale <= 1) {
          const dx = g.lastX - g.x, dy = g.lastY - g.y
          if (g.turning && g.pinched) { drag({ type: 'cancel' }); g.turning = false; g.lockChecked = true }
          else if (!g.pinched && !g.lockChecked && Math.hypot(dx, dy) > 12) {
            g.lockChecked = true
            if (Math.abs(dx) >= Math.abs(dy) * 1.5) g.turning = drag({ type: 'start', dx, y: viewportHeight.current > 0 ? (g.y - origin.current.y) / viewportHeight.current : undefined }) === true
          }
          if (g.turning) drag({ type: 'move', dx })
        }
      }
      // 페이지 밖 여백에서 시작해 이미 받은 터치도 조금 움직이면 손가락 이동으로 넘어간다
      if (!fingerPanning.current && !pinch.current && fingerPans(event)) {
        fingerPanning.current = true
        panFrom.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
        tap.current = null
        cancelHold()
      }
      if (tap.current && Math.hypot(event.nativeEvent.pageX - tap.current.x, event.nativeEvent.pageY - tap.current.y) > 10)
        tap.current = null
      if (!tap.current && hold.current && !hold.current.fired) cancelHold()
      // 메뉴를 띄운 터치는 손을 뗄 때까지 화면을 옮기지 않는다 (메뉴가 손가락을 따라 밀려나지 않게)
      if (hold.current?.fired) return
      if (!twoFingers(event)) {
        // 한 손가락으로 줄어든 뒤의 새 핀치는 현재 배율과 새 거리에서 시작한다.
        pinch.current = null
        // 손바닥 도구: 한 손가락으로 끌어 화면 이동 (두 손가락에서 한 손가락으로 돌아오면 그 자리부터 다시)
        if ((latest.current.reading ? currentView().scale > 1 : latest.current.dragToPan || fingerPanning.current) && (event.nativeEvent.touches?.length ?? 1) === 1) {
          const { pageX, pageY } = event.nativeEvent
          if (panFrom.current) {
            const dy = pageY - panFrom.current.y
            motion.current.panY += dy
            preview(latest.current.resolvePan(currentView(), pageX - panFrom.current.x, dy))
          }
          panFrom.current = { x: pageX, y: pageY }
        }
        return
      }
      panFrom.current = null
      tap.current = null
      cancelHold()
      if (!pinch.current) startPinch(event)
      const [a, b] = event.nativeEvent.touches
      const p = local(a)
      const q = local(b)
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
      const g = pinch.current
      const distanceRatio = Math.hypot(p.x - q.x, p.y - q.y) / g.distance
      motion.current.panY = mid.y - g.mid.y
      if (Math.abs(distanceRatio - 1) > 0.04) motion.current.zoomed = true
      preview(latest.current.resolveZoom(g.scale * distanceRatio, g.point, mid))
    },
    onResponderEnd: (event) => {
      if (!twoFingers(event)) { pinch.current = null; panFrom.current = null }
    },
    onResponderRelease: (event) => {
      fingerPanning.current = false
      const held = hold.current?.fired
      cancelHold()
      pinch.current = null
      panFrom.current = null
      const g = readerGesture.current
      const e = event?.nativeEvent
      if (g?.turning) {
        latest.current.onReadingDrag?.({ type: 'end', dx: (e?.pageX ?? g.lastX) - g.x, duration: Date.now() - g.at })
        readerGesture.current = null
        commit()
        tap.current = null
        return
      }
      const maxDistance = g ? Math.max(g.maxDistance, Math.hypot((e?.pageX ?? g.lastX) - g.x, (e?.pageY ?? g.lastY) - g.y)) : 0
      const action = latest.current.reading && g ? readingGestureAction({
        dx: (e?.pageX ?? g.lastX) - g.x, dy: (e?.pageY ?? g.lastY) - g.y,
        duration: Date.now() - g.at, scale: g.scale, pinched: g.pinched, dragged: g.dragged, maxDistance,
        x: g.x - origin.current.x, width: viewportWidth.current,
      }) : null
      readerGesture.current = null
      commit()
      if (action && !(maxDistance <= 10 && (g.link || latest.current.readingLinkRef?.current))) latest.current.onReadingAction?.(action)
      if (!latest.current.reading && tap.current && !held) latest.current.onTapEmpty?.()
      tap.current = null
    },
    onResponderTerminate: () => {
      fingerPanning.current = false
      cancelHold()
      pinch.current = null
      panFrom.current = null
      if (readerGesture.current?.turning) latest.current.onReadingDrag?.({ type: 'cancel' })
      readerGesture.current = null
      commit(true)
      tap.current = null
    },
  }

  // 웹: 휠·트랙패드
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined
    const node = nodeRef.current
    if (!node?.addEventListener) return undefined
    // 브라우저의 글자 선택·링크 끌기가 읽기 스와이프를 가져가지 않게 한다.
    const preventReaderSelection = event => { if (latest.current.reading) event.preventDefault() }
    node.addEventListener('selectstart', preventReaderSelection, true)
    node.addEventListener('dragstart', preventReaderSelection, true)
    // 휠도 손가락 제스처처럼 transform 으로 미리 보여 주고, 휠이 멈추면 한 번만 확정한다.
    let idle = null
    const handleWheel = (event) => {
      event.preventDefault()
      if (latest.current.interactionLocked) return
      const { resolveZoom: zoomTo, resolvePan: panTo } = latest.current
      const view = currentView()
      if (!liveRef.current) resetMotion()
      if (event.ctrlKey || event.metaKey) {
        motion.current.zoomed = true
        const rect = node.getBoundingClientRect()
        const at = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        preview(zoomTo(view.scale * Math.exp(-event.deltaY * 0.01), { x: (at.x - view.x) / view.zoom, y: (at.y - view.y) / view.zoom }, at))
      } else {
        motion.current.panY -= event.deltaY
        preview(panTo(view, -event.deltaX, -event.deltaY))
      }
      clearTimeout(idle)
      idle = setTimeout(commit, WHEEL_IDLE_MS)
    }
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      clearTimeout(idle)
      node.removeEventListener('wheel', handleWheel)
      node.removeEventListener('selectstart', preventReaderSelection, true)
      node.removeEventListener('dragstart', preventReaderSelection, true)
    }
  }, [])

  return (
    <View
      ref={nodeRef}
      style={[styles.viewport, style]}
      onLayout={(event) => {
        measure()
        viewportWidth.current = event.nativeEvent.layout.width
        viewportHeight.current = event.nativeEvent.layout.height
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
          viewTransform(live, offset, zoom),
        ]}
      >
        {children}
      </View>
      {/* 확대·축소하는 동안에만 배율을 보여 주고, 손을 떼면(확정하면) 바로 숨긴다 */}
      {live && live.scale !== scale && (
        <View style={styles.zoomBadge} pointerEvents="none">
          <Text style={styles.zoomText}>{Math.round(live.scale * 100)}%</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // 웹 터치: 브라우저 자체 확대·스크롤 대신 이 영역이 두 손가락 제스처를 받는다.
  viewport: { flex: 1, overflow: 'hidden', ...Platform.select({ web: { touchAction: 'none' }, default: {} }) },
  // 툴바 바로 아래 가운데
  zoomBadge: { position: 'absolute', top: 84, alignSelf: 'center', paddingHorizontal: 14, height: 34, justifyContent: 'center', borderRadius: 17, backgroundColor: colors.surface, ...shadow.float },
  zoomText: { fontSize: 13, fontWeight: '700', color: colors.text },
})
