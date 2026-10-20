import { useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import Icon from './Icon'

/**
 * RN 기본 컴포넌트에는 슬라이더가 없어서 직접 만든다.
 * onStart 는 끌기를 시작할 때 한 번 (되돌리기 지점을 만들 때 쓴다).
 */
export default function Slider({ value, min, max, step, onChange, onStart, minusLabel = '줄이기', plusLabel = '늘리기' }) {
  const [trackWidth, setTrackWidth] = useState(1)
  const startRef = useRef(0)
  const toValue = (x) => min + clamp(x / trackWidth, 0, 1) * (max - min)
  const ratio = clamp((value - min) / (max - min), 0, 1)

  const panHandlers = usePan({
    onStart: (event) => {
      onStart?.()
      startRef.current = event.locationX
      onChange(toValue(event.locationX))
    },
    onMove: (dx) => onChange(toValue(startRef.current + dx)),
  })

  const nudge = (delta) => {
    onStart?.()
    onChange(clamp(Math.round((value + delta) / step) * step, min, max))
  }

  return (
    <View style={styles.row}>
      <Pressable onPress={() => nudge(-step)} style={styles.stepButton} accessibilityLabel={minusLabel}>
        <Icon name="minus" size={16} />
      </Pressable>
      <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)} {...panHandlers}>
        <View style={styles.trackLine} pointerEvents="none" />
        <View style={[styles.trackFill, { width: `${ratio * 100}%` }]} pointerEvents="none" />
        <View style={[styles.thumb, { left: ratio * trackWidth - 13 }]} pointerEvents="none" />
      </View>
      <Pressable onPress={() => nudge(step)} style={styles.stepButton} accessibilityLabel={plusLabel}>
        <Icon name="plus" size={16} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F9',
  },
  track: { flex: 1, height: 44, justifyContent: 'center' },
  trackLine: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: colors.surfaceSoft },
  trackFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  thumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
})
