import { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { colors } from '../../shared/theme'
import { usePan } from '../hooks/usePan'
import { createEraserSession, ERASER_RADIUS, normalizeEraserSize } from '../utils/eraser.js'
import { startPenMeasurement } from '../utils/penPerformance.js'

// 렌더링 환경에 requestAnimationFrame이 없으면(Node 테스트 등) 기다리지 않고 바로 실행한다.
const requestFrame = (callback) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : (callback(), 0))
const cancelFrame = (id) => { if (id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id) }
export const eraserPreviewInterval = (platform, compact) => platform === 'ios' && !compact ? 64 : 32

/**
 * mode: 'stroke'(획 지우기) | 'area'(영역 지우기). 영역 지우기는 onPreview(ids, 남은 조각) 로 지우는 중 모습을 넘긴다
 * 스터디 플래너 페이지: planner(지금 기록) · onPlannerErase(기록, 구간 점들) → 지운 결과(바뀐 것이 없으면 null).
 * 지나가는 구간마다 바로 지워 onPlannerPreview(기록)로 보여 주고, 손을 떼면 획 지우기와 한 번의 되돌리기로 묶어 확정한다.
 */
export default function EraserInput({ objects, zoom, dispatch, onPreview, compact = false, diameter = ERASER_RADIUS * 2, mode = 'stroke', target = 'all', planner, onPlannerErase, onPlannerPreview }) {
  const gesture = useRef(null)
  const frame = useRef(null)
  const pending = useRef(null)
  const [cursor, setCursor] = useState(null)
  const shown = useRef({ key: '', pieces: null }) // 마지막으로 캔버스에 넘긴 지울 목록
  const preview = (point, ids) => {
    pending.current = { point, ids }
    if (frame.current) return
    frame.current = requestFrame(() => {
      frame.current = null
      const next = pending.current
      pending.current = null
      if (!next) return
      setCursor(next.point)
      const active = gesture.current
      const now = performance.now()
      // 모든 입력을 판정하되 iPad에서는 무거운 조각 표시만 간격을 둔다.
      const previewInterval = eraserPreviewInterval(Platform?.OS, compact)
      if (mode === 'area' && active && now - (active.previewAt ?? -Infinity) < previewInterval) return
      if (active) active.previewAt = now
      const measurement = active?.measurement
      const fragmentsStarted = measurement?.clock()
      const pieces = mode === 'area' ? gesture.current?.session.replacements?.() ?? null : null
      if (measurement) measurement.record('eraserFragmentsMs', measurement.clock() - fragmentsStarted)
      if (gesture.current?.plannerShown === false) { gesture.current.plannerShown = true; onPlannerPreview?.(gesture.current.planner) }
      const key = next.ids.join(',')
      if (key === shown.current.key && pieces === shown.current.pieces) return
      shown.current = { key, pieces }
      const ticket = measurement ? { measurement, started: measurement.clock() } : null
      if (mode === 'area') onPreview(next.ids, pieces, ticket)
      else onPreview(next.ids, null, ticket)
    })
  }
  const reset = (measurement = null) => {
    gesture.current = null
    if (frame.current) cancelFrame(frame.current)
    frame.current = null
    pending.current = null
    setCursor(null)
    shown.current = { key: '', pieces: null }
    onPlannerPreview?.(null)
    onPreview([], null, measurement ? { measurement, started: measurement.clock(), metric: 'eraserFinalizeToLayoutMs' } : null)
  }
  useEffect(() => () => { gesture.current?.measurement?.end({ cancelled: true, reason: 'unmount' }); gesture.current?.session.finish(true); reset() }, [])
  const erasePlanner = points => {
    const g = gesture.current
    if (!g || !onPlannerErase || target !== 'all') return
    const next = onPlannerErase(g.planner, points)
    if (next) { g.planner = next; g.plannerShown = false }
  }
  const handlers = usePan({
    onStart: (event) => {
      gesture.current?.measurement?.end({ cancelled: true, reason: 'restart' })
      reset()
      if ((event.button != null && event.button !== 0) || event.touches?.length > 1 || !Number.isFinite(zoom) || zoom <= 0) return
      const start = { x: event.locationX / zoom, y: event.locationY / zoom }
      const measurement = startPenMeasurement({ kind: 'eraser', eraserMode: mode, width: diameter, zoom, objectCount: objects.length })
      const setupStarted = measurement?.clock()
      const session = createEraserSession(objects, normalizeEraserSize(diameter) / 2, mode, target)
      if (measurement) measurement.record('eraserSetupMs', measurement.clock() - setupStarted)
      gesture.current = { start, previous: start, session, measurement, planner, plannerShown: true }
      erasePlanner([start])
      const started = measurement?.clock()
      const ids = session.move(start)
      if (measurement) measurement.record('eraserMoveMs', measurement.clock() - started)
      preview(start, ids)
    },
    onMove: (dx, dy, event) => {
      const g = gesture.current
      if (!g) return
      if (event.touches?.length > 1) { g.measurement?.end({ cancelled: true, reason: 'multi-touch' }); g.session.finish(true); reset(); return }
      g.measurement?.move(event)
      const next = { x: g.start.x + dx / zoom, y: g.start.y + dy / zoom }
      const started = g.measurement?.clock()
      erasePlanner([g.previous, next])
      const ids = g.session.move(g.previous, next)
      if (g.measurement) g.measurement.record('eraserMoveMs', g.measurement.clock() - started)
      preview(next, ids)
      g.previous = next
    },
    onEnd: ({ cancelled }) => {
      const g = gesture.current
      const started = g?.measurement?.clock()
      const action = g?.session.finish(cancelled)
      reset(g?.measurement)
      const erased = !cancelled && g && g.planner !== planner ? g.planner : null
      if (erased) dispatch({ type: 'setPlanner', planner: erased, ...(action ? { after: action } : {}) })
      else if (action) dispatch(action)
      if (g?.measurement) {
        g.measurement.record('eraserFinalizeMs', g.measurement.clock() - started)
        g.measurement.end({ cancelled: Boolean(cancelled), affectedObjects: action?.ids?.length ?? Object.keys(action?.replacements ?? {}).length })
      }
    },
  })
  const size = normalizeEraserSize(diameter) * zoom
  return <View accessibilityLabel="지우개 입력 영역" style={StyleSheet.absoluteFill} {...handlers}>
    {cursor && <View pointerEvents="none" style={[styles.cursor, { left: cursor.x * zoom - size / 2, top: cursor.y * zoom - size / 2, width: size, height: size, borderRadius: size / 2 }]} />}
  </View>
}

const styles = StyleSheet.create({
  cursor: { position: 'absolute', borderWidth: 1.5, borderColor: colors.primary, backgroundColor: 'rgba(255,255,255,0.4)' },
})
