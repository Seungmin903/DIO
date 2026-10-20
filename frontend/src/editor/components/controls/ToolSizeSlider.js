import { useRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { usePan } from '../../hooks/usePan'

// 펜·형광펜·지우개의 크기 조절은 같은 표시와 입력 방식을 사용한다.
export default function ToolSizeSlider({ value, onChange, min, max, step = 1, label }) {
  const width = useRef(1), start = useRef(0)
  const limit = (number) => Math.max(min, Math.min(max, number))
  const update = (x) => onChange(limit(Math.round((min + x / width.current * (max - min)) / step) * step))
  const handlers = usePan({
    onStart: (event) => { start.current = event.locationX; update(start.current) },
    onMove: (dx) => update(start.current + dx),
  })
  return <View accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value }}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} tabIndex={0}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={(event) => onChange(limit(value + (event.nativeEvent.actionName === 'increment' ? step : -step)))}
    {...(Platform.OS === 'web' && { onKeyDown: (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      onChange(event.key === 'Home' ? min : event.key === 'End' ? max : limit(value + (['ArrowRight', 'ArrowUp'].includes(event.key) ? step : -step)))
    } })}
    onLayout={(event) => { width.current = Math.max(1, event.nativeEvent.layout.width) }} style={styles.slider} {...handlers}>
    <View pointerEvents="none" style={styles.track} />
    <View pointerEvents="none" style={[styles.thumb, { left: `${(value - min) / (max - min) * 100}%` }]} />
  </View>
}

const styles = StyleSheet.create({
  slider: { flex: 1, height: 40, justifyContent: 'center', marginHorizontal: 8 },
  track: { height: 5, borderRadius: 4, backgroundColor: colors.textMuted },
  thumb: { position: 'absolute', width: 20, height: 20, marginLeft: -10, borderRadius: 10, backgroundColor: colors.primary },
})
