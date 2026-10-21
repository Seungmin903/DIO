import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '../../shared/theme'
import { usePan } from '../hooks/usePan'
import { createEraserSession, ERASER_RADIUS, normalizeEraserSize } from '../utils/eraser.js'

// 렌더링 환경에 requestAnimationFrame이 없으면(Node 테스트 등) 기다리지 않고 바로 실행한다.
const requestFrame = (callback) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : (callback(), 0))
const cancelFrame = (id) => { if (id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id) }

export default function EraserInput({ objects, zoom, dispatch, onPreview, diameter = ERASER_RADIUS * 2 }) {
  const gesture = useRef(null)
  const frame = useRef(null)
  const pending = useRef(null)
  const [cursor, setCursor] = useState(null)
  const preview = (point, ids) => {
    pending.current = { point, ids }
    if (frame.current) return
    frame.current = requestFrame(() => {
      frame.current = null
      const next = pending.current
      pending.current = null
      if (!next) return
      setCursor(next.point)
      onPreview(next.ids)
    })
  }
  const reset = () => {
    gesture.current = null
    if (frame.current) cancelFrame(frame.current)
    frame.current = null
    pending.current = null
    setCursor(null)
    onPreview([])
  }
  useEffect(() => () => { gesture.current?.session.finish(true); reset() }, [])
  const handlers = usePan({
    onStart: (event) => {
      reset()
      if ((event.button != null && event.button !== 0) || event.touches?.length > 1 || !Number.isFinite(zoom) || zoom <= 0) return
      const start = { x: event.locationX / zoom, y: event.locationY / zoom }
      const session = createEraserSession(objects, normalizeEraserSize(diameter) / 2)
      gesture.current = { start, previous: start, session }
      preview(start, session.move(start))
    },
    onMove: (dx, dy, event) => {
      const g = gesture.current
      if (!g) return
      if (event.touches?.length > 1) { g.session.finish(true); reset(); return }
      const next = { x: g.start.x + dx / zoom, y: g.start.y + dy / zoom }
      preview(next, g.session.move(g.previous, next))
      g.previous = next
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
