import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, DISABLED_OPACITY } from '../../../shared/theme'

// Session-only control: commit one undo entry per drag, and release parent scrolling on every exit.
export default function StickerSplitSlider({ label, value, max, min = 0, step = 1, disabled, onPreview, onCommit, onCancel, onInteraction }) {
  const width = useRef(1), drag = useRef(null)
  const [trackWidth, setTrackWidth] = useState(1)
  function change(x) {
    const next = Math.max(min, Math.min(max, Math.round((min + Math.max(0, Math.min(1, (x - 13) / Math.max(1, width.current - 26))) * (max - min)) / step) * step))
    drag.current.value = Number(next.toFixed(4)); onPreview(drag.current.value)
  }
  function finish(cancel = false) {
    const current = drag.current; drag.current = null; onInteraction?.(false)
    if (current) { if (cancel) onCancel?.(); else onCommit(current.value) }
  }
  const nudge = delta => onCommit(Number(Math.max(min, Math.min(max, value + delta)).toFixed(4)))
  return <View style={[s.row, disabled && { opacity: DISABLED_OPACITY }]}>
    <Pressable disabled={disabled || value <= min} onPress={() => nudge(-step)} accessibilityLabel={`${label} 줄이기`} style={s.button}><Text style={s.text}>−</Text></Pressable>
    <View collapsable={false} style={s.track} onLayout={e => { width.current = e.nativeEvent.layout.width; setTrackWidth(width.current) }} accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }} accessibilityState={{ disabled }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => { if (!disabled) nudge(e.nativeEvent.actionName === 'increment' ? step : -step) }}
      onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={e => { drag.current = { origin: e.nativeEvent.pageX - e.nativeEvent.locationX, value }; onInteraction?.(true); change(e.nativeEvent.locationX) }}
      onResponderMove={e => { if (drag.current) change(e.nativeEvent.pageX - drag.current.origin) }}
      onResponderRelease={() => finish()} onResponderTerminate={() => finish(true)} onResponderTerminationRequest={() => false}>
      <View pointerEvents="none" style={s.line} />
      <View pointerEvents="none" style={[s.thumb, { left: Math.max(0, (value - min) / (max - min)) * Math.max(0, trackWidth - 26) }]} />
    </View>
    <Pressable disabled={disabled || value >= max} onPress={() => nudge(step)} accessibilityLabel={`${label} 늘리기`} style={s.button}><Text style={s.text}>+</Text></Pressable>
  </View>
}
const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 9 }, text: { color: colors.text, fontSize: 20 }, track: { flex: 1, height: 44, justifyContent: 'center' }, line: { height: 4, backgroundColor: colors.surfaceSoft, borderRadius: 2 }, thumb: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary } })
