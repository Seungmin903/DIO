import { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../constants'
import { usePan } from '../hooks/usePan'
import { clamp, createId } from '../utils/common'
import { createStroke } from '../utils/strokes'
import ObjectContent from './canvas/ObjectView'
import { DEFAULT_PEN_SETTINGS, penPressure } from '../utils/penSettings'

// 입력 중에는 문서/이력을 변경하지 않고 손을 뗄 때 한 획으로 확정한다.
export default function PenInput({ zoom, dispatch, settings = DEFAULT_PEN_SETTINGS }) {
  const gesture = useRef(null)
  const [preview, setPreview] = useState(null)
  const point = (x, y) => ({ x: clamp(x, 0, PAGE_WIDTH), y: clamp(y, 0, PAGE_HEIGHT) })
  const handlers = usePan({
    onStart: (event) => {
      if ((event.button != null && event.button !== 0) || event.touches?.length > 1) return
      const start = point(event.locationX / zoom, event.locationY / zoom)
      const first = { ...start, pressure: penPressure(settings.kind) }
      gesture.current = { start, points: [first], id: createId(), settings: { ...settings }, time: Date.now() }
      setPreview(createStroke([first], { ...gesture.current.settings, id: gesture.current.id }))
    },
    onMove: (dx, dy, event) => {
      const g = gesture.current
      if (!g) return
      if (event.touches?.length > 1) {
        gesture.current = null
        setPreview(null)
        return
      }
      const next = point(g.start.x + dx / zoom, g.start.y + dy / zoom)
      const last = g.points[g.points.length - 1]
      if (Math.hypot(next.x - last.x, next.y - last.y) * zoom < 0.75) return
      const now = Date.now()
      const speed = Math.hypot(next.x - last.x, next.y - last.y) / Math.max(1, now - g.time)
      g.time = now
      g.points.push({ ...next, pressure: penPressure(g.settings.kind, speed) })
      setPreview(createStroke(g.points, { ...g.settings, id: g.id }))
    },
    onEnd: ({ cancelled }) => {
      const g = gesture.current
      gesture.current = null
      setPreview(null)
      if (g && !cancelled) dispatch({ type: 'addObjects', objects: [createStroke(g.points, { ...g.settings, id: g.id })] })
    },
  })
  return (
    <View accessibilityLabel="펜 입력 영역" style={StyleSheet.absoluteFill} {...handlers}>
      {preview && (
        <View pointerEvents="none" style={{ position: 'absolute', left: preview.x * zoom, top: preview.y * zoom }}>
          <ObjectContent object={preview} zoom={zoom} />
        </View>
      )}
    </View>
  )
}
