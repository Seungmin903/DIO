import { useEffect, useLayoutEffect, useRef } from 'react'
import { AppState, Platform, StyleSheet, View } from 'react-native'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../constants'
import { usePan } from '../hooks/usePan'
import { useStylusTouchBridge } from '../hooks/useStylusTouchBridge'
import { createId } from '../utils/common'
import { createStroke } from '../utils/strokes'
import PenPreview from './PenPreview'
import { createPenPreviewStore } from '../utils/penPreviewStore.js'
import { createStrokePreview } from '../utils/strokePreview.js'
import { previewSegmentFor } from '../utils/pencilBrush.js'
import { startPenMeasurement, reportPenInputRejected } from '../utils/penPerformance.js'
import { DEFAULT_PEN_SETTINGS, createPenPressureSampler } from '../utils/penSettings'
import { getPenDynamics } from '../../shared/penDynamics'
import { createHighlighterHold } from '../utils/strokeAssist'
import { createPenPointerInput } from '../utils/penPointerInput.js'
import { withStylusSensor } from '../utils/stylusSensor.js'
import { createPenMotion, penEventTime } from '../utils/penMotion.js'
import { endHookLength, trimEndHook } from '../utils/penHook.js'
import { isSameIOSPenContact, setPenPointerActive } from '../utils/stylus'
import { penMaterialSeed } from '../utils/penMaterials.js'

// 렌더링 환경에 requestAnimationFrame이 없으면(Node 테스트 등) 기다리지 않고 바로 실행한다.
const requestFrame = (callback) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : (callback(), 0))
const cancelFrame = (id) => { if (id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id) }
// 끝점은 필터 값이 아니라 펜 끝 실제 좌표로 확정한다
const atPenTip = (last, before, tip) => ({ ...last, ...tip, inkDistance: (before.inkDistance ?? 0) + Math.hypot(tip.x - before.x, tip.y - before.y) })

// 입력 중에는 문서/이력을 변경하지 않고 손을 뗄 때 한 획으로 확정한다.
// onPlannerStroke(points, settings): 스터디 플래너 속지가 획을 칸 기록으로 받았으면 true (획을 남기지 않는다)
export default function PenInput({ zoom, dispatch, pageWidth = PAGE_WIDTH, pageHeight = PAGE_HEIGHT, settings = DEFAULT_PEN_SETTINGS, straightAssist = true, objectCount = 0, onPlannerStroke, onStrokeCommitted }) {
  const gesture = useRef(null)
  const previewFrame = useRef(null)
  const pendingPreview = useRef(null)
  const previewStore = useRef(null)
  const input = useRef(null)
  const pointer = useRef(null)
  if (!pointer.current) pointer.current = createPenPointerInput(() => input.current,
    (active, id) => setPenPointerActive(id, active))
  const inputRef = useStylusTouchBridge(pointer.current)
  if (!previewStore.current) previewStore.current = createPenPreviewStore()
  const setPreview = next => previewStore.current.publish(next)
  const publishPreview = g => {
    const started = g.measurement?.clock()
    // 손을 뗄 때 확정할 모양(갈고리 자르기 · 끝점 좌표)을 쓰는 중에도 그대로 보여 준다: 뗄 때 끝이 다시 그려져 달라 보이지 않게
    const points = g.points, tip = !g.straight && points.length > 1 ? atPenTip(points.at(-1), points.at(-2), g.lastRaw) : null
    const count = tip ? endHookLength(points, zoom, tip) : points.length
    const parts = g.preview.snapshot(points, count)
    if (tip && count === points.length) parts.at(-1).points[parts.at(-1).points.length - 1] = tip
    if (g.measurement) {
      g.measurement.preview()
      g.measurement.record('previewSnapshotMs', g.measurement.clock() - started)
    }
    setPreview({ strokeId: g.id, parts, settings: g.settings, measurement: g.measurement })
  }
  // 좌표는 모두 보존하고, 화면 프레임마다 미리보기의 꼬리 구간만 갱신한다.
  const schedulePreview = (g) => {
    pendingPreview.current = g
    if (previewFrame.current) return
    previewFrame.current = requestFrame(() => {
      previewFrame.current = null
      const next = pendingPreview.current
      pendingPreview.current = null
      if (next && gesture.current === next) {
        publishPreview(next)
      }
    })
  }
  useEffect(() => () => {
    pointer.current.cancel()
    gesture.current?.hold?.cancel()
    gesture.current?.measurement?.end({ cancelled: true, reason: 'unmount' })
    gesture.current = null
    if (previewFrame.current) cancelFrame(previewFrame.current)
    previewStore.current.publish(null)
    previewStore.current.clearPending()
  }, [])
  useEffect(() => {
    const subscription = AppState?.addEventListener('change', state => {
      if (state !== 'active') {
        pointer.current.cancel()
        input.current?.onEnd({ cancelled: true })
      }
    })
    return () => subscription?.remove()
  }, [])
  const cancelPendingPreview = () => {
    cancelFrame(previewFrame.current)
    previewFrame.current = null
    pendingPreview.current = null
  }
  // 같은 입력 View를 유지하되 좌표계·도구 정책이 바뀌면 진행 획만 취소한다.
  useLayoutEffect(() => {
    pointer.current.cancel()
    gesture.current?.hold?.cancel()
    gesture.current?.measurement?.end({ cancelled: true, reason: 'policy-change' })
    gesture.current = null
    cancelPendingPreview()
    setPreview(null)
    previewStore.current.clearPending()
  }, [zoom, pageWidth, pageHeight, settings.kind, straightAssist])
  input.current = {
    onRejected: reportPenInputRejected,
    onStart: (raw) => {
      // 안드로이드 S펜 필압 · 기울기는 네이티브 센서에서 붙인다(터치 경로에는 없다)
      const event = withStylusSensor(raw)
      const previous = gesture.current
      if (event.pointerType === 'pen' && previous?.inputSource === 'responder' && isSameIOSPenContact(previous.responderTouch, event.pointerId)) {
        previous.pointerOffset = { x: event.locationX / zoom - previous.start.x, y: event.locationY / zoom - previous.start.y }
        previous.inputSource = 'pointer'
        return
      }
      gesture.current?.hold?.cancel()
      gesture.current?.measurement?.end({ cancelled: true, reason: 'restart' })
      gesture.current = null
      cancelPendingPreview()
      setPreview(null)
      if ((event.button != null && event.button !== 0) || event.touches?.length > 1) return
      const start = { x: event.locationX / zoom, y: event.locationY / zoom }
      const dynamics = getPenDynamics(), pressure = createPenPressureSampler(settings.kind, dynamics.pressure, dynamics.tilt)
      const first = { ...start, pressure: pressure.sample(event), time: 0, inkDistance: 0, speed: 0 }
      const time = penEventTime(event)
      const force = pressure.force()
      if (force != null) first.force = force
      if (dynamics.tilt) for (const key of ['tiltX', 'tiltY']) if (Number.isFinite(event[key])) first[key] = event[key]
      const points = [first]
      const id = createId()
      gesture.current = { start, points, rawPoints: points, lastRaw: first, pressure, inputSource: event.pointerType === 'pen' ? 'pointer' : 'responder', responderTouch: { identifier: event.identifier, pageX: event.pageX, pageY: event.pageY }, motion: createPenMotion(first), preview: createStrokePreview(previewSegmentFor(settings.kind)), id,
        // 연필도 버전 3: 점마다 속도를 저장해 빠르게 쓴 곳을 옅게 그린다(pencilStroke)
        settings: { ...settings, ...(['fountain', 'felt', 'pencil'].includes(settings.kind) && { renderVersion: 3, materialSeed: penMaterialSeed(id) }) }, time, startTime: time, tilt: dynamics.tilt }
      const g = gesture.current
      g.measurement = startPenMeasurement({ kind: settings.kind, width: settings.width, zoom, objectCount, straightAssist,
        coordinateBasis: event.coordinateBasis ?? 'responder', inputChannel: event.inputChannel ?? 'responder', inputRecovery: event.recoveredPreviousPointer ? 'pointer-recontact' : null })
      if (straightAssist) g.hold = createHighlighterHold({ start: first, zoom, onStraight: (points) => {
        if (gesture.current !== g) return
        g.straight = true
        g.points = points
        schedulePreview(g)
      } })
      // 짧은 획도 다음 RAF 전에 끝날 수 있다. 시작점은 즉시 전달한다.
      publishPreview(g)
    },
    onMove: (dx, dy, raw) => {
      const g = gesture.current
      if (!g) return
      const event = withStylusSensor(raw)
      g.measurement?.move(event)
      if (event.touches?.length > 1) {
        g.hold?.cancel()
        g.measurement?.end({ cancelled: true, reason: 'multi-touch' })
        gesture.current = null
        cancelPendingPreview()
        setPreview(null)
        return
      }
      const last = g.rawPoints[g.rawPoints.length - 1]
      // 바깥 좌표도 그대로 보존하고, 페이지 영역에서만 잘라 표시한다.
      const offset = event.pointerType === 'pen' ? g.pointerOffset : null
      const next = { x: g.start.x + dx / zoom + (offset?.x ?? 0), y: g.start.y + dy / zoom + (offset?.y ?? 0) }
      const outside = next.x < 0 || next.x > pageWidth || next.y < 0 || next.y > pageHeight
      if (outside) { g.hold?.cancel(); g.straight = false; g.points = g.rawPoints }
      const now = Math.max(g.time, penEventTime(event))
      const elapsed = Math.max(1, now - g.time)
      const distance = Math.hypot(next.x - last.x, next.y - last.y)
      const speed = distance / elapsed
      // 속도 배율은 화면 속도(px/ms)로 정한다. 확대해서 써도 같은 손놀림이면 같은 굵기다
      const pressure = g.pressure.sample(event, speed * zoom, elapsed)
      const metadata = { pressure, time: now - g.startTime, speed: Math.min(20, speed) }
      const force = g.pressure.force()
      if (force != null && !event.isRelease) metadata.force = force
      if (g.tilt) for (const key of ['tiltX', 'tiltY']) if (Number.isFinite(event[key])) metadata[key] = event[key]
      if (distance * zoom < 0.75) {
        if (event.isRelease) {
          g.lastRaw = next
          // 시각은 그대로 둔다: 멈췄다 떼었다고 끝 갈고리 판정이 쓰는 중과 달라지면 뗄 때 갈고리가 나타난다
          g.rawPoints[g.rawPoints.length - 1] = { ...last, ...next }
          g.points = g.straight ? [g.points[0], g.rawPoints.at(-1)] : g.rawPoints
          return
        }
        // 움직이지 않고 누르는 힘만 바뀌어도 꼬리를 갱신한다. 같은 좌표를 쌓지 않는다.
        if (!event.isRelease && (Math.abs(pressure - last.pressure) > 0.01 || (force != null && force !== last.force))) {
          const sample = { ...last, ...metadata }
          g.rawPoints[g.rawPoints.length - 1] = sample
          g.points = g.straight ? [g.points[0], sample] : g.rawPoints
          g.time = now
          schedulePreview(g)
        }
        return
      }
      g.time = now
      g.lastRaw = next
      const sample = settings.kind === 'highlighter' ? { ...next, ...metadata }
        : g.motion.sample({ ...next, ...metadata }, elapsed, event.isRelease)
      if (event.isRelease) for (const key of ['force', 'speed', 'tiltX', 'tiltY']) if (last[key] != null) sample[key] = last[key]
      sample.inkDistance = (last.inkDistance ?? 0) + Math.hypot(sample.x - last.x, sample.y - last.y)
      g.rawPoints.push(sample)
      if (g.straight) g.points = [g.points[0], sample]
      else g.points = g.rawPoints
      if (!outside) g.hold?.move(sample)
      schedulePreview(g)
    },
    onEnd: ({ cancelled, reason }) => {
      const g = gesture.current
      g?.hold?.cancel()
      gesture.current = null
      if (previewFrame.current) {
        cancelFrame(previewFrame.current)
        previewFrame.current = null
      }
      pendingPreview.current = null
      if (!g || cancelled || Platform?.OS !== 'web') setPreview(null)
      if (g && !cancelled && onPlannerStroke?.(g.points, g.settings)) {
        setPreview(null)
        g.measurement?.end({ cancelled: false, endReason: reason, points: g.rawPoints.length, straight: Boolean(g.straight) })
        return
      }
      if (g && !cancelled) {
        if (!g.straight && g.rawPoints.length > 1) {
          g.rawPoints[g.rawPoints.length - 1] = atPenTip(g.rawPoints.at(-1), g.rawPoints.at(-2), g.lastRaw)
          // 펜을 뗄 때 말린 끝(갈고리)은 꺾인 점에서 자른다
          g.points = trimEndHook(g.rawPoints, zoom)
        }
        if (typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_PEN_PRESSURE_DEBUG === '1') {
          console.info('[pen-pressure]', JSON.stringify({ kind: g.settings.kind, input: g.inputSource, ...g.pressure.report() }))
        }
        const started = g.measurement?.clock()
        const completed = createStroke(g.points, { ...g.settings, id: g.id })
        if (g.measurement) {
          const inside = point => point.x >= 0 && point.x <= pageWidth && point.y >= 0 && point.y <= pageHeight
          g.measurement.record('startInsidePage', inside(g.points[0]) ? 1 : 0)
          g.measurement.record('pointsOutsidePage', g.points.filter(point => !inside(point)).length)
        }
        if (Platform?.OS === 'web') {
          const handedOff = performance.now()
          previewStore.current.hold({ strokeId: g.id, parts: g.preview.snapshot(g.points), settings: g.settings, measurement: g.measurement }, reason => {
            g.measurement?.handoffEnd?.(reason, performance.now() - handedOff)
          })
        }
        dispatch({ type: 'addObjects', objects: [completed] })
        onStrokeCommitted?.(completed)
        // 새 획은 올가미로 지정하기 전까지 직접 조작하지 않는다.
        dispatch({ type: 'selectExact', ids: [] })
        if (g.measurement) g.measurement.record('finalizeJsMs', g.measurement.clock() - started)
      }
      g?.measurement?.end({ cancelled: Boolean(cancelled), endReason: reason, points: g.rawPoints.length, straight: Boolean(g.straight) })
    },
  }
  // Pointer and responder events can both be dispatched for the same Pencil.
  // Only their current owner is allowed to update/finish a gesture.
  const handlers = usePan({
    externalPointer: true,
    onStart: event => { if (!pointer.current.active) input.current.onStart(event) },
    onMove: (...args) => { if (!pointer.current.active) input.current.onMove(...args) },
    onEnd: event => { if (!pointer.current.active) input.current.onEnd(event) },
  })
  return (
    <View ref={inputRef} accessibilityLabel={settings.kind === 'highlighter' ? '형광펜 입력 영역' : '펜 입력 영역'} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} {...handlers} {...pointer.current.handlers}>
      <PenPreview store={previewStore.current} zoom={zoom} pageWidth={pageWidth} pageHeight={pageHeight} kind={settings.kind} />
    </View>
  )
}
