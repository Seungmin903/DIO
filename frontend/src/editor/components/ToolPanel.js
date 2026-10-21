import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import Icon from './controls/Icon'

// 도구 옵션·보관함·내보내기가 공유하는 제목과 표면 기준.
export function ToolPanelHeader({ icon, title, onClose, closeLabel, disabled = false, children }) {
  return <View style={toolPanelStyles.heading}>
    <View style={toolPanelStyles.titleRow}><Icon name={icon} size={18} /><Text style={toolPanelStyles.title}>{title}</Text></View>
    {children}
    <Pressable accessibilityRole="button" accessibilityLabel={closeLabel ?? `${title} 닫기`} disabled={disabled} onPress={onClose} style={[toolPanelStyles.close, disabled && { opacity: 0.4 }]}><Icon name="close" size={18} /></Pressable>
  </View>
}
export const toolPanelStyles = StyleSheet.create({
  card: { width: 320, maxWidth: '100%', maxHeight: '100%', flexShrink: 1, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, ...shadow.float },
  heading: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 8, paddingVertical: 4 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  content: { padding: 16, paddingTop: 0, gap: 12 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
})
