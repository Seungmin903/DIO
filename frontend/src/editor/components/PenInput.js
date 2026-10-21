import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../constants'
import { usePan } from '../hooks/usePan'
import { createId } from '../utils/common'
import { createStroke } from '../utils/strokes'
import ObjectContent from './canvas/ObjectView'
import { DEFAULT_PEN_SETTINGS, penPressure } from '../utils/penSettings'
import { createHighlighterHold } from '../utils/strokeAssist'

// 입력 중에는 문서/이력을 변경하지 않고 손을 뗄 때 한 획으로 확정한다.
export default function PenInput({ zoom, dispatch, pageWidth = PAGE_WIDTH, pageHeight = PAGE_HEIGHT, settings = DEFAULT_PEN_SETTINGS }) {
  const gesture = useRef(null)
  useEffect(() => () => { gesture.current?.hold?.cancel(); gesture.current = null }, [])
  const [preview, setPreview] = useState(null)
  const handlers = usePan({
    onStart: (event) => {
      gesture.current?.hold?.cancel()
      gesture.current = null
      setPreview(null)
      if ((event.button != null && event.button !== 0) || event.touches?.length > 1) return
      const start = { x: event.locationX / zoom, y: event.locationY / zoom }
      const first = { ...start, pressure: penPressure(settings.kind) }
      gesture.current = { start, points: [first], rawPoints: [first], id: createId(), settings: { ...settings }, time: Date.now() }
      const g = gesture.current
      if (settings.kind === 'highlighter') g.hold = createHighlighterHold({ start: first, zoom, onStraight: (points) => {
        if (gesture.current !== g) return
        g.straight = true
        g.points = points
        setPreview(createStroke(points, { ...g.settings, id: g.id }))
      } })
      setPreview(createStroke([first], { ...gesture.current.settings, id: gesture.current.id }))
    },
    onMove: (dx, dy, event) => {
      const g = gesture.current
      if (!g) return
      if (event.touches?.length > 1) {
        g.hold?.cancel()
        gesture.current = null
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
      setPreview(createStroke(g.points, { ...g.settings, id: g.id }))
    },
    onEnd: ({ cancelled }) => {
      const g = gesture.current
      g?.hold?.cancel()
      gesture.current = null
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
