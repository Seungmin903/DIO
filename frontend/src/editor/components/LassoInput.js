import { useLayoutEffect, useRef, useState } from 'react'
import { Keyboard, Platform, StyleSheet, View } from 'react-native'
import Svg, { Path, Polygon } from 'react-native-svg'
import { colors } from '../../shared/theme'
import { clamp } from '../utils/common'
import { applyLassoSelection, hasLassoArea, lassoHitIds, lassoPolygon, objectLassoCorners } from '../utils/lassoGeometry.js'

const MIN_MOVEMENT = 10
const SAMPLE_DISTANCE = 2

// 선택·문서 상태는 드래그 종료 때 한 번만 반영한다. 이 입력층은 객체 위에서도 동작한다.
export default function LassoInput({ objects, selectedIds, shape, mode, zoom, pageWidth, pageHeight, onCommit, captureAll = true, onDrawingChange, onClearSelection }) {
  const gesture = useRef(null)
  useLayoutEffect(() => () => { gesture.current = null; onDrawingChange?.(false) }, [onDrawingChange])
  const [draft, setDraft] = useState(null)
  const [drawing, setDrawing] = useState(false)
  const cancel = () => { gesture.current = null; setDraft(null); setDrawing(false); onDrawingChange?.(false) }
  const input = {
    onStart: event => {
      cancel()
      if ((Platform.OS === 'web' && event.button != null && event.button !== 0) || event.touches?.length > 1) return
      Keyboard.dismiss()
      setDrawing(true)
      onDrawingChange?.(true)
      const start = { x: clamp(event.locationX / zoom, 0, pageWidth), y: clamp(event.locationY / zoom, 0, pageHeight) }
      gesture.current = { start, captureAll, pageX: event.pageX, pageY: event.pageY, points: [start], base: [...selectedIds], objects, maxMove: 0, result: null }
    },
    onMove: (dx, dy, event) => {
      const g = gesture.current
      if (!g) return
      if (event.touches?.length > 1 || g.objects !== objects) { cancel(); return }
      g.maxMove = Math.max(g.maxMove, Math.hypot(dx, dy))
      const next = { x: clamp(g.start.x + dx / zoom, 0, pageWidth), y: clamp(g.start.y + dy / zoom, 0, pageHeight) }
      const last = g.points[g.points.length - 1]
      if (Math.hypot(next.x - last.x, next.y - last.y) * zoom < SAMPLE_DISTANCE) return
      g.points = shape === 'freeform' ? [...g.points, next] : [g.start, next]
      const polygon = lassoPolygon(shape, g.start, g.points)
      const valid = g.maxMove >= MIN_MOVEMENT && hasLassoArea(polygon)
      const ids = valid ? applyLassoSelection(objects, g.base, lassoHitIds(objects, polygon), mode) : mode === 'replace' ? [] : g.base
      g.result = valid ? ids : null
      setDraft({ polygon, ids })
    },
    onEnd: ({ cancelled }) => {
      const g = gesture.current
      cancel()
      if (!cancelled && g && g.objects === objects) {
        if (g.result !== null) onCommit(g.result)
        else if (g.maxMove < MIN_MOVEMENT && (!g.captureAll || !lassoHitIds(objects, [g.start]).length)) onClearSelection?.()
      }
    },
  }
  // 올가미 입력 면 자체가 터치를 받는다. SVG·상세 창의 갱신과 독립적으로 화면 좌표 차이를 추적한다.
  const handlers = {
    onStartShouldSetResponder: () => true,
    onStartShouldSetResponderCapture: event => (event.nativeEvent.touches?.length ?? 1) === 1,
    onResponderTerminationRequest: event => (event.nativeEvent.touches?.length ?? 0) > 1,
    onResponderGrant: event => input.onStart(event.nativeEvent),
    onResponderMove: event => {
      const g = gesture.current
      if (g) input.onMove(event.nativeEvent.pageX - g.pageX, event.nativeEvent.pageY - g.pageY, event.nativeEvent)
    },
    onResponderRelease: () => input.onEnd({ cancelled: false }),
    onResponderTerminate: () => input.onEnd({ cancelled: true }),
  }
  const previewIds = new Set(draft?.ids ?? (mode === 'replace' ? [] : selectedIds))
  const polygon = draft?.polygon ?? []
  const path = polygon.length ? 'M' + polygon.map(p => p.x + ' ' + p.y).join('L') + 'Z' : ''
  return (
    <View style={[styles.layer, { width: pageWidth * zoom, height: pageHeight * zoom, zIndex: captureAll ? 3 : 0 }]} pointerEvents="box-none" collapsable={false}>
      <View accessibilityLabel={shape === 'freeform' ? '자유형 올가미 입력 영역' : '네모 올가미 입력 영역'} style={StyleSheet.absoluteFill} pointerEvents="box-only" collapsable={false} {...handlers}>
      <Svg pointerEvents="none" width={pageWidth * zoom} height={pageHeight * zoom} viewBox={'0 0 ' + pageWidth + ' ' + pageHeight}>
        {drawing && objects.filter(object => !object.hidden && previewIds.has(object.id)).map(object => (
          <Polygon key={object.id} points={objectLassoCorners(object).map(p => p.x + ',' + p.y).join(' ')}
            fill={colors.primarySoft} stroke={colors.primary} strokeWidth={1.5 / zoom} />
        ))}
        {path ? <Path d={path} fill={colors.primarySoft} fillRule="evenodd" stroke={colors.primary}
          strokeWidth={1.5 / zoom} strokeDasharray={[6 / zoom, 4 / zoom]} /> : null}
      </Svg>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({ layer: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' } })
