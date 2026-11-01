import { useEffect, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Icon from '../controls/Icon'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'

export function SplitAction({ label, displayLabel = label, icon, choice = false, onPress, disabled = false, active = false, primary = false }) {
  disabled = Boolean(disabled); active = Boolean(active)
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} aria-disabled={disabled} aria-pressed={active} onPress={onPress}
    style={({ pressed }) => [s.button, choice && s.choice, active && s.active, primary && s.primary, pressed && s.pressed, disabled && s.disabled]}>
    {!!icon && <Icon name={icon} size={18} color={primary ? colors.surface : colors.text} />}
    <Text numberOfLines={1} style={[s.buttonText, primary && s.primaryText]}>{displayLabel}</Text>
  </Pressable>
}
export function SplitChoiceGroup({ label, children }) {
  return <View accessibilityRole="toolbar" accessibilityLabel={label} style={s.choiceGroup}>{children}</View>
}
export function SplitSettingTitle({ title, value }) {
  return <View style={s.settingTitle}><Text style={s.statusTitle}>{title}</Text><View style={s.statusBadge}><Text style={s.summary}>{value}</Text></View></View>
}
export function SplitIconAction({ label, icon, onPress, disabled = false, active = false }) {
  disabled = Boolean(disabled); active = Boolean(active)
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} aria-disabled={disabled} aria-pressed={active} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.iconButton, active && s.active, pressed && s.pressed, disabled && s.disabled]}><Icon name={icon} size={21} color={colors.text} /></Pressable>
}
export default function StickerSplitTools({ section, onChange, disabled, hasResults, summaries = {}, children }) {
  const tabs = [['background', '배경 조정'], ['selection', '포함·제외'], ['grouping', '객체 묶기'], ['results', '스티커 확인']]
  const strip = useRef(null), positions = useRef({})
  function revealTab() {
    if (section === 'results') strip.current?.scrollToEnd({ animated: false })
    else strip.current?.scrollTo({ x: positions.current[section] ?? 0, animated: false })
  }
  useEffect(revealTab, [section])
  return <View style={s.tools}>
    <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}
      onContentSizeChange={revealTab} accessibilityRole="tablist" accessibilityLabel="스티커 제작 도구">
    {tabs.map(([id, label]) => {
      const unavailable = !!disabled || (!hasResults && id !== 'background')
      return <Pressable key={id} disabled={unavailable} accessibilityRole="tab" accessibilityLabel={label}
          accessibilityState={{ selected: section === id, disabled: unavailable }} aria-selected={section === id} aria-disabled={unavailable}
          onLayout={event => { positions.current[id] = event.nativeEvent.layout.x }}
          onPress={() => { if (section !== id) onChange(id) }} style={[s.tab, section === id && s.tabSelected, unavailable && s.disabled]}>
          <Text numberOfLines={1} style={[s.sectionTitle, section === id && s.selectedTitle]}>{label}</Text>
        </Pressable>
    })}</ScrollView>
    {!!section && <View style={s.panel}>
      {!!summaries[section] && <View testID="sticker-tool-status" style={s.status}>
        <Text style={s.statusTitle}>{{ background: '배경 방식', selection: '제외된 객체', grouping: '묶기 거리', results: '총 개수' }[section]}</Text>
        <View style={s.statusBadge}><Text style={s.summary}>{summaries[section]}</Text></View>
      </View>}
      {children}
    </View>}
  </View>
}
const s = StyleSheet.create({
  tools: { backgroundColor: colors.surface },
  tabs: { flexGrow: 1, gap: 4, paddingTop: 4, paddingHorizontal: 8, backgroundColor: colors.surfaceMuted, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderBottomWidth: 1, borderColor: colors.cardBorder },
  tab: { flexGrow: 1, minWidth: 108, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.surfaceMuted, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderBottomColor: colors.cardBorder, marginBottom: -1 },
  tabSelected: { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderBottomColor: colors.surface },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  selectedTitle: { fontWeight: '800' },
  choiceGroup: { flexDirection: 'row', gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.cardBorder },
  choice: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  settingTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8 },
  statusTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  statusBadge: { borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, paddingHorizontal: 10, paddingVertical: 6 },
  summary: { color: colors.text, fontSize: 14, fontWeight: '600' },
  panel: { paddingTop: 16, paddingBottom: 16, gap: 12 },
  button: { flexDirection: 'row', gap: 6, minHeight: 44, maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: 14, fontWeight: '700', color: colors.text }, active: { borderColor: colors.primaryStrong, borderWidth: 2 },
  primary: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong }, primaryText: { color: colors.surface },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.surface },
  disabled: { opacity: DISABLED_OPACITY }, pressed: {}, // 눌림 효과 없음(사용자 지시)
})
