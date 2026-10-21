import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../constants'
import { usePan } from '../hooks/usePan'
import { createId } from '../utils/common'
import { createStroke } from '../utils/strokes'
import ObjectContent from './canvas/ObjectView'
import { DEFAULT_PEN_SETTINGS, penPressure } from '../utils/penSettings'
import { createHighlighterHold } from '../utils/strokeAssist'

// 렌더링 환경에 requestAnimationFrame이 없으면(Node 테스트 등) 기다리지 않고 바로 실행한다.
const requestFrame = (callback) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : (callback(), 0))
const cancelFrame = (id) => { if (id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id) }

// 입력 중에는 문서/이력을 변경하지 않고 손을 뗄 때 한 획으로 확정한다.
export default function PenInput({ zoom, dispatch, pageWidth = PAGE_WIDTH, pageHeight = PAGE_HEIGHT, settings = DEFAULT_PEN_SETTINGS, straightAssist = true }) {
  const gesture = useRef(null)
  const previewFrame = useRef(null)
  const pendingPreview = useRef(null)
  // 좌표는 모두 보존하고 전체 획 변환은 화면 프레임당 한 번만 한다.
  const schedulePreview = (g) => {
    pendingPreview.current = g
    if (previewFrame.current) return
    previewFrame.current = requestFrame(() => {
      previewFrame.current = null
      const next = pendingPreview.current
      pendingPreview.current = null
      if (next && gesture.current === next) setPreview(createStroke(next.points, { ...next.settings, id: next.id }))
    })
  }
  useEffect(() => () => {
    gesture.current?.hold?.cancel()
    gesture.current = null
    if (previewFrame.current) cancelFrame(previewFrame.current)
  }, [])
  const [preview, setPreview] = useState(null)
  const cancelPendingPreview = () => {
    cancelFrame(previewFrame.current)
    previewFrame.current = null
    pendingPreview.current = null
  }
  // 같은 입력 View를 유지하되 좌표계·도구 정책이 바뀌면 진행 획만 취소한다.
  useLayoutEffect(() => {
    gesture.current?.hold?.cancel()
    gesture.current = null
    cancelPendingPreview()
    setPreview(null)
  }, [zoom, pageWidth, pageHeight, settings.kind, straightAssist])
  const handlers = usePan({
    onStart: (event) => {
      gesture.current?.hold?.cancel()
      gesture.current = null
      cancelPendingPreview()
      setPreview(null)
      if ((event.button != null && event.button !== 0) || event.touches?.length > 1) return
      const start = { x: event.locationX / zoom, y: event.locationY / zoom }
      const first = { ...start, pressure: penPressure(settings.kind) }
      gesture.current = { start, points: [first], rawPoints: [first], id: createId(), settings: { ...settings }, time: Date.now() }
      const g = gesture.current
      if (straightAssist) g.hold = createHighlighterHold({ start: first, zoom, onStraight: (points) => {
        if (gesture.current !== g) return
        g.straight = true
        g.points = points
        schedulePreview(g)
      } })
      schedulePreview(g)
    },
    onMove: (dx, dy, event) => {
      const g = gesture.current
      if (!g) return
      if (event.touches?.length > 1) {
        g.hold?.cancel()
        gesture.current = null
        cancelPendingPreview()
        setPreview(null)
        return
      }
      const last = g.rawPoints[g.rawPoints.length - 1]
      // 바깥 좌표도 그대로 보존하고, 페이지 영역에서만 잘라 표시한다.
      const next = { x: g.start.x + dx / zoom, y: g.start.y + dy / zoom }
      const outside = next.x < 0 || next.x > pageWidth || next.y < 0 || next.y > pageHeight
      if (outside) { g.hold?.cancel(); g.straight = false; g.points = g.rawPoints }
      if (Math.hypot(next.x - last.x, next.y - last.y) * zoom < 0.75) return
      const now = Date.now()
      const speed = Math.hypot(next.x - last.x, next.y - last.y) / Math.max(1, now - g.time)
      g.time = now
      const sample = { ...next, pressure: penPressure(g.settings.kind, speed) }
      g.rawPoints.push(sample)
      if (g.straight) g.points = [g.points[0], sample]
      else g.points = g.rawPoints
      if (!outside) g.hold?.move(sample)
      schedulePreview(g)
    },
    onEnd: ({ cancelled }) => {
      const g = gesture.current
      g?.hold?.cancel()
      gesture.current = null
      if (previewFrame.current) {
        cancelFrame(previewFrame.current)
        previewFrame.current = null
      }
      pendingPreview.current = null
      setPreview(null)
      if (g && !cancelled) {
        dispatch({ type: 'addObjects', objects: [createStroke(g.points, { ...g.settings, id: g.id })] })
        // 새 획은 올가미로 지정하기 전까지 직접 조작하지 않는다.
        dispatch({ type: 'selectExact', ids: [] })
      }
    },
  })
  return (
    <View accessibilityLabel={settings.kind === 'highlighter' ? '형광펜 입력 영역' : '펜 입력 영역'} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} {...handlers}>
      {preview && (
        <View pointerEvents="none" style={{ position: 'absolute', left: preview.x * zoom, top: preview.y * zoom }}>
          <ObjectContent object={preview} zoom={zoom} />
        </View>
      )}
    </View>
  )
}
