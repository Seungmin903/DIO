import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { NOW_LINE_COLOR } from '../../templates/dayPlanner.js'

const REFRESH_MS = 30 * 1000

/** 데일리 플래너 시간표의 현재 시각 줄(빨간 줄 + 왼쪽 동그라미). 화면에서만 그리고 터치는 받지 않는다. nowLine: planner.nowLine(기록, 지금) */
export default function DayNowLine({ planner, value, zoom }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), REFRESH_MS)
    return () => clearInterval(timer)
  }, [])
  const line = planner.nowLine(value, now)
  if (!line) return null
  const dot = 8 * zoom, thick = Math.max(1.5, 1.6 * zoom)
  return (
    <View pointerEvents="none" accessibilityLabel="현재 시각" style={[styles.layer, { left: line.x * zoom, top: line.y * zoom - thick / 2, width: line.w * zoom, height: thick }]}>
      <View style={[styles.line, { height: thick }]} />
      <View style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2, left: -dot / 2, top: (thick - dot) / 2 }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', zIndex: 2 },
  line: { backgroundColor: NOW_LINE_COLOR, borderRadius: 1 },
  dot: { position: 'absolute', backgroundColor: NOW_LINE_COLOR },
})
