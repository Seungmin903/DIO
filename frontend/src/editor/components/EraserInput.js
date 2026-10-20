import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '../../shared/theme'
import { usePan } from '../hooks/usePan'
import { createEraserSession, ERASER_RADIUS, normalizeEraserSize } from '../utils/eraser.js'

export default function EraserInput({ objects, zoom, dispatch, onPreview, diameter = ERASER_RADIUS * 2 }) {
  const gesture = useRef(null)
  const [cursor, setCursor] = useState(null)
  const reset = () => { gesture.current = null; setCursor(null); onPreview([]) }
  useEffect(() => () => { gesture.current?.session.finish(true); gesture.current = null; onPreview([]) }, [onPreview])
  const handlers = usePan({
    onStart: (event) => {
      reset()
      if ((event.button != null && event.button !== 0) || event.touches?.length > 1 || !Number.isFinite(zoom) || zoom <= 0) return
      const start = { x: event.locationX / zoom, y: event.locationY / zoom }
      const session = createEraserSession(objects, normalizeEraserSize(diameter) / 2)
      gesture.current = { start, previous: start, session }
      onPreview(session.move(start))
      setCursor(start)
    },
    onMove: (dx, dy, event) => {
      const g = gesture.current
      if (!g) return
      if (event.touches?.length > 1) { g.session.finish(true); reset(); return }
      const next = { x: g.start.x + dx / zoom, y: g.start.y + dy / zoom }
      onPreview(g.session.move(g.previous, next))
      g.previous = next
      setCursor(next)
    },
    onEnd: ({ cancelled }) => {
      const action = gesture.current?.session.finish(cancelled)
      reset()
      if (action) dispatch(action)
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
