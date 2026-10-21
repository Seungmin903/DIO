import { ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import { ERASER_MAX_SIZE, ERASER_MIN_SIZE, normalizeEraserSize } from '../utils/eraser.js'
import ToolSizeSlider from './controls/ToolSizeSlider'

export default function EraserSettings({ size, onChange, onClose }) {
  const value = normalizeEraserSize(size)
  const update = (next) => onChange(normalizeEraserSize(next))
  return <View style={toolPanelStyles.card}>
    <ToolPanelHeader icon="eraser" title="지우개" closeLabel="지우개 설정 닫기" onClose={onClose} />
    <View style={toolPanelStyles.content}>
    <View style={styles.preview} pointerEvents="none">
      <View style={[styles.circle, { width: value, height: value, borderRadius: value / 2 }]} />
    </View>
    <View style={styles.row}>
      <Text style={styles.label}>크기</Text>
      <ToolSizeSlider label="지우개 크기" value={value} min={ERASER_MIN_SIZE} max={ERASER_MAX_SIZE} step={1} onChange={update} />
      <Text style={styles.value}>{value}</Text>
    </View>
    </View>
  </View>
}

const styles = StyleSheet.create({
  panel: { width: 280, maxWidth: '100%', padding: 16, gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, elevation: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' }, label: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  value: { width: 28, color: colors.text, fontWeight: '700', fontSize: 12 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  preview: { height: 84, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF7', borderRadius: 12 },
  circle: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: 'rgba(255,255,255,0.4)' },
})
