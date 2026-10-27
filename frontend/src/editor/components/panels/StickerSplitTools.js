import { Pressable, StyleSheet, Text, View } from 'react-native'
import Icon from '../controls/Icon'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'

export function SplitAction({ label, onPress, disabled = false, active = false, primary = false }) {
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} aria-disabled={disabled} aria-pressed={active} onPress={onPress}
    style={({ pressed }) => [s.button, active && s.active, primary && s.primary, pressed && s.pressed, disabled && s.disabled]}>
    <Text style={[s.buttonText, primary && s.primaryText]}>{label}</Text>
  </Pressable>
}
export function SplitIconAction({ label, icon, onPress, disabled = false, active = false }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} aria-disabled={disabled} aria-pressed={active} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.iconButton, active && s.active, pressed && s.pressed, disabled && s.disabled]}><Icon name={icon} size={21} color={colors.text} /></Pressable>
}
export default function StickerSplitTools({ section, onChange, disabled, hasResults, children }) {
  return <View style={s.tools}>
    <View style={s.tabs}>{[['region', '영역'], ['selection', '선택'], ['grouping', '묶기'], ['background', '배경']].map(([id, label]) => {
      const unavailable = !!disabled || (!hasResults && (id === 'selection' || id === 'grouping'))
      return <Pressable key={id} disabled={unavailable} accessibilityRole="button" accessibilityLabel={`${label} 도구`} accessibilityState={{ expanded: section === id, disabled: unavailable }} aria-expanded={section === id} aria-disabled={unavailable}
        onPress={() => onChange(section === id ? null : id)} style={({ pressed }) => [s.tab, section === id && s.active, pressed && s.pressed, unavailable && s.disabled]}><Text numberOfLines={1} style={s.buttonText}>{label}</Text></Pressable>
    })}</View>
    {!!section && <View style={s.panel}>{children}</View>}
  </View>
}
const s = StyleSheet.create({
  tools: { gap: 8, marginTop: 12 }, tabs: { flexDirection: 'row', gap: 6 },
  tab: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  panel: { padding: 12, gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  button: { minHeight: 44, maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: 14, fontWeight: '700', color: colors.text }, active: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary }, primaryText: { color: colors.surface },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.surface },
  disabled: { opacity: DISABLED_OPACITY }, pressed: { opacity: 0.7 },
})
