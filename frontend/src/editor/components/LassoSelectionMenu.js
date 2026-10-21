import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import Icon from './controls/Icon'
import { clamp, unionBounds } from '../utils/common'

const EDGE = 8
const GAP = 16

// 화면 픽셀 크기를 유지하고 선택 영역 바로 아래에 붙인다. 아래 공간이 없으면 위로 옮긴다.
export default function LassoSelectionMenu({ objects, mode, zoom, pageWidth, pageHeight, onModeChange, anchor }) {
  const [size, setSize] = useState({ width: 0, height: 44 })
  const bounds = unionBounds(objects)
  const width = pageWidth * zoom, height = pageHeight * zoom
  const below = anchor ? anchor.top + anchor.height + 8 : bounds.bottom * zoom + GAP
  const top = clamp(below + size.height <= height - EDGE ? below : (anchor ? anchor.top - 8 : bounds.top * zoom - GAP) - size.height,
    EDGE, Math.max(EDGE, height - size.height - EDGE))
  const left = clamp(bounds.cx * zoom - size.width / 2, EDGE, Math.max(EDGE, width - size.width - EDGE))
  return <View accessibilityLabel="올가미 선택 메뉴" style={[styles.menu, { top, left, maxWidth: Math.max(1, width - EDGE * 2), opacity: size.width ? 1 : 0 }]}
    onLayout={({ nativeEvent: { layout } }) => setSize(current => current.width === layout.width && current.height === layout.height ? current : { width: layout.width, height: layout.height })}
    onStartShouldSetResponder={() => true}>
    <Action icon="plus" label="추가 선택" selected={mode === 'add'} onPress={() => onModeChange('add')} />
    <View style={styles.divider} />
    <Action icon="minus" label="선택에서 제외" selected={mode === 'subtract'} onPress={() => onModeChange('subtract')} />
  </View>
}

function Action({ icon, label, selected, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} aria-pressed={selected}
    onPress={onPress} style={({ pressed }) => [styles.action, selected && styles.active, pressed && styles.pressed]}>
    <Icon name={icon} size={16} color={selected ? colors.primary : colors.text} />
    <Text style={styles.text}>{label}</Text>
  </Pressable>
}

const styles = StyleSheet.create({
  menu: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, ...shadow.float },
  action: { minHeight: 44, flexShrink: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11, borderWidth: 1, borderColor: 'transparent' },
  divider: { width: 1, height: 22, marginHorizontal: 2, backgroundColor: colors.border },
  text: { color: colors.text, fontSize: 12.5, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  active: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pressed: { backgroundColor: colors.primarySoft },
})
