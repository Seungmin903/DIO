import { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import { moveRegion, regionDragAction, resizeRegion, validRegion } from '../utils/regionGeometry.js'
import StaticPage from './canvas/StaticPage'
import RegionOverlay from './RegionOverlay'

const MARGIN = 24
const WEB = Platform.OS === 'web'
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const pagePoint = (point, view) => ({ x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom })

export default function RegionViewport({ page, pageSize, region, draft, ratio, onDraft, onChange }) {
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const [savedView, setSavedView] = useState(null)
  const [live, setLive] = useState(null)
  const liveRef = useRef(null), gesture = useRef(null), mouse = useRef(null), input = useRef(null)
  const wheelIdle = useRef(null), handleWheel = useRef(null)
  const fit = Math.max(0.01, Math.min(1, (frame.width - MARGIN * 2) / pageSize.width, (frame.height - MARGIN * 2) / pageSize.height))
  const view = savedView ?? { scale: 1, zoom: fit, x: (frame.width - pageSize.width * fit) / 2, y: (frame.height - pageSize.height * fit) / 2 }

  const currentView = () => liveRef.current ?? view
  const updateView = next => { liveRef.current = next; setLive(next) }
  const finishView = () => {
    if (liveRef.current) setSavedView(liveRef.current)
    updateView(null)
  }
  const limitOffset = (offset, visible, extent) => {
    const minVisible = Math.min(MARGIN * 2, visible, extent)
    return clamp(offset, minVisible - extent, visible - minVisible)
  }
  const place = (requested, anchor, screen) => {
    const scale = clamp(requested, 0.5, 4), zoom = fit * scale
    return {
      scale, zoom,
      x: limitOffset(screen.x - anchor.x * zoom, frame.width, pageSize.width * zoom),
      y: limitOffset(screen.y - anchor.y * zoom, frame.height, pageSize.height * zoom),
    }
  }

  const startViewGesture = ([a, b], startView) => {
    if (gesture.current?.kind === 'area') onDraft(null)
    gesture.current = {
      kind: 'view', ids: [a.id, b.id], distance: Math.max(1, distance(a, b)),
      scale: startView.scale, anchor: pagePoint(midpoint(a, b), startView),
    }
  }
  const start = points => {
    if (!points.length) return
    const startView = currentView()
    if (wheelIdle.current !== null) {
      clearTimeout(wheelIdle.current)
      wheelIdle.current = null
      finishView()
    }
    if (points.length >= 2) {
      if (!gesture.current?.ids) startViewGesture(points, startView)
      return
    }
    if (gesture.current) return
    const [point] = points
    gesture.current = { kind: 'area', point, region, zoom: startView.zoom, action: regionDragAction(pagePoint(point, startView), region, startView.zoom) }
  }
  const move = points => {
    const current = gesture.current
    if (points.length >= 2) {
      const [a, b] = current?.ids?.map(id => points.find(point => point.id === id)) ?? []
      if (!a || !b) { startViewGesture(points, currentView()); return }
      updateView(place(current.scale * distance(a, b) / current.distance, current.anchor, midpoint(a, b)))
      return
    }
    if (current?.kind !== 'area' || !current.action || points.length !== 1) return
    const dx = points[0].x - current.point.x, dy = points[0].y - current.point.y
    if (!current.next && Math.hypot(dx, dy) < 3) return
    const x = dx / current.zoom, y = dy / current.zoom
    current.next = current.action === 'move' ? moveRegion(current.region, x, y, pageSize) : resizeRegion(current.region, current.action, x, y, pageSize, ratio)
    onDraft(current.next)
  }
  const end = points => {
    const current = gesture.current
    if (points.length) {
      // 확대 중 손가락 하나를 떼도 나머지는 새 영역 드래그로 해석하지 않는다.
      if (current?.kind === 'view' && points.length === 1) gesture.current = { kind: 'view' }
      return
    }
    gesture.current = null
    if (current?.kind === 'view') { finishView(); return }
    if (current?.next && validRegion(current.next, pageSize, ratio)) {
      const { x, y, width, height } = current.region
      const next = current.next
      if (x !== next.x || y !== next.y || width !== next.width || height !== next.height) { onChange(next); return }
    }
    onDraft(null)
  }
  const cancel = () => {
    gesture.current = null
    mouse.current = null
    onDraft(null)
    updateView(null)
  }
  const onLayout = ({ nativeEvent: { layout: { width, height } } }) => {
    if (width === frame.width && height === frame.height) return
    if (gesture.current) cancel()
    clearTimeout(wheelIdle.current)
    wheelIdle.current = null
    updateView(null)
    setFrame({ width, height })
    setSavedView(null)
  }

  // Android Modal에서 responder에는 빠지던 두 번째 접촉도 터치 이벤트에는 들어온다.
  // 위치가 변하지 않는 한 입력 층에서 모서리·영역 이동·보기 제스처를 함께 처리한다.
  const pointsFrom = ({ nativeEvent, currentTarget }) => {
    const rect = WEB ? currentTarget.getBoundingClientRect() : null
    return Array.from(nativeEvent.touches ?? [], touch => ({
      id: touch.identifier, x: rect ? touch.clientX - rect.left : touch.locationX, y: rect ? touch.clientY - rect.top : touch.locationY,
    }))
  }
  const pointerPoint = ({ nativeEvent, currentTarget }) => {
    const rect = currentTarget.getBoundingClientRect()
    return { id: nativeEvent.pointerId, x: nativeEvent.clientX - rect.left, y: nativeEvent.clientY - rect.top }
  }
  const platformHandlers = WEB ? {
    onPointerDown: event => {
      const { pointerType, pointerId, button } = event.nativeEvent
      if (pointerType === 'touch' || button !== 0 || gesture.current) return
      mouse.current = pointerId
      event.currentTarget.setPointerCapture?.(pointerId)
      start([pointerPoint(event)])
    },
    onPointerMove: event => { if (event.nativeEvent.pointerId === mouse.current) move([pointerPoint(event)]) },
    onPointerUp: event => {
      if (event.nativeEvent.pointerId !== mouse.current) return
      mouse.current = null
      end([])
    },
    onPointerCancel: event => { if (event.nativeEvent.pointerId === mouse.current) cancel() },
    onLostPointerCapture: event => { if (event.nativeEvent.pointerId === mouse.current) cancel() },
  } : {
    onStartShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderTerminate: cancel,
  }
  handleWheel.current = event => {
    event.preventDefault()
    if (gesture.current) return
    const current = currentView()
    const rect = event.currentTarget.getBoundingClientRect()
    const at = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const anchor = pagePoint(at, current)
    updateView(event.ctrlKey || event.metaKey
      ? place(current.scale * Math.exp(-event.deltaY * 0.01), anchor, at)
      : place(current.scale, anchor, { x: at.x - event.deltaX, y: at.y - event.deltaY }))
    clearTimeout(wheelIdle.current)
    wheelIdle.current = setTimeout(() => { wheelIdle.current = null; finishView() }, 160)
  }
  useEffect(() => {
    if (!WEB) return undefined
    const node = input.current
    const wheel = event => handleWheel.current(event)
    node?.addEventListener('wheel', wheel, { passive: false })
    return () => { node?.removeEventListener('wheel', wheel); clearTimeout(wheelIdle.current) }
  }, [])

  return <View testID="region-viewport" onLayout={onLayout} style={styles.viewport}>
    {frame.width > 0 && frame.height > 0 && <View pointerEvents="none" style={[styles.page, {
      left: view.x, top: view.y, width: pageSize.width * view.zoom, height: pageSize.height * view.zoom,
      transform: [{ translateX: (live?.x ?? view.x) - view.x }, { translateY: (live?.y ?? view.y) - view.y }, { scale: (live?.zoom ?? view.zoom) / view.zoom }],
    }]}>
      <StaticPage page={page} zoom={view.zoom} still />
      <RegionOverlay selection={draft ?? region} zoom={view.zoom} />
    </View>}
    {live && live.scale !== view.scale && <View pointerEvents="none" style={styles.badge}><Text style={styles.zoom}>{Math.round(live.scale * 100)}%</Text></View>}
    <View ref={input} collapsable={false} style={styles.input} {...platformHandlers}
      onTouchStart={event => start(pointsFrom(event))} onTouchMove={event => move(pointsFrom(event))}
      onTouchEnd={event => end(pointsFrom(event))} onTouchCancel={cancel} />
  </View>
}

const styles = StyleSheet.create({
  viewport: { flex: 1, alignSelf: 'stretch', overflow: 'hidden' },
  page: { position: 'absolute', transformOrigin: 'left top', backgroundColor: colors.surface, boxShadow: '0px 8px 20px rgba(28, 28, 28, 0.07)' },
  input: { ...StyleSheet.absoluteFill, ...(WEB && { touchAction: 'none', userSelect: 'none' }) },
  badge: { position: 'absolute', top: 84, alignSelf: 'center', paddingHorizontal: 14, height: 34, justifyContent: 'center', borderRadius: 17, backgroundColor: colors.surface, ...shadow.float },
  zoom: { fontSize: 13, fontWeight: '700', color: colors.text },
})
