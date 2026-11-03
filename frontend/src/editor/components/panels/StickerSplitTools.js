import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import DioButton from '../../../shared/DioButton'
import FadeScroll from '../controls/FadeScroll'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'

// 제작 화면 문법(디자인 가이드 5.8): 버튼은 DioButton(높이 48), 주 동작은 채움 · 나머지는 토널, 고른 도구는 selected
// onGray: 회색 작업 판 위에 놓는 버튼은 토널이 묻혀서 흰 면 + 윤곽으로 둔다(공방 트레이와 같은 규칙)
export function SplitAction({ label, displayLabel = label, icon, choice = false, onPress, disabled = false, active = false, primary = false, onGray = false }) {
  return <DioButton variant={onGray ? 'ghost' : primary ? 'filled' : 'tonal'} outline={onGray} label={label} text={displayLabel} icon={icon} selected={Boolean(active)} disabled={Boolean(disabled)}
    style={[choice && s.choice, onGray && s.onGray]} onPress={onPress} />
}
export function SplitChoiceGroup({ label, children }) {
  return <View accessibilityRole="toolbar" accessibilityLabel={label} style={s.choiceGroup}>{children}</View>
}
export function SplitSettingTitle({ title, value }) {
  return <View style={s.settingTitle}><Text style={s.statusTitle}>{title}</Text><View style={s.statusBadge}><Text style={s.summary}>{value}</Text></View></View>
}
export function SplitIconAction({ label, icon, onPress, disabled = false, active = false, onGray = false }) {
  return <DioButton variant="icon" label={label} icon={icon} selected={Boolean(active)} disabled={Boolean(disabled)} style={onGray ? s.onGray : undefined} onPress={onPress} />
}
export default function StickerSplitTools({ section, onChange, disabled, hasResults, summaries = {}, children }) {
  const tabs = [['background', '배경 조정'], ['selection', '포함·제외'], ['grouping', '객체 묶기'], ['results', '스티커 확인']]
  // 폰(폭 600 미만)은 네 탭이 한 줄에 같은 폭으로 들어가 첫 탭이 잘리지 않는다(브라우저 탭 모양은 그대로)
  const { width } = useWindowDimensions(), phone = width < 600
  const strip = useRef(null), positions = useRef({})
  function revealTab() {
    if (section === 'results') strip.current?.scrollToEnd({ animated: false })
    else strip.current?.scrollTo({ x: positions.current[section] ?? 0, animated: false })
  }
  useEffect(revealTab, [section])
  return <View style={s.tools}>
    <FadeScroll scrollRef={strip} horizontal fadeRgb="240,241,249" contentContainerStyle={s.tabs}
      onContentSizeChange={revealTab} accessibilityRole="tablist" accessibilityLabel="스티커 제작 도구">
    {tabs.map(([id, label]) => {
      const unavailable = !!disabled || (!hasResults && id !== 'background')
      return <Pressable key={id} disabled={unavailable} accessibilityRole="tab" accessibilityLabel={label}
          accessibilityState={{ selected: section === id, disabled: unavailable }} aria-selected={section === id} aria-disabled={unavailable}
          onLayout={event => { positions.current[id] = event.nativeEvent.layout.x }}
          onPress={() => { if (section !== id) onChange(id) }} style={[s.tab, phone && s.tabPhone, section === id && s.tabSelected, unavailable && s.disabled]}>
          <Text numberOfLines={1} style={[s.sectionTitle, phone && s.sectionTitlePhone, section === id && s.selectedTitle]}>{label}</Text>
        </Pressable>
    })}</FadeScroll>
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
  tabPhone: { minWidth: 0, flexBasis: 0, paddingHorizontal: 2 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  sectionTitlePhone: { fontSize: 13 },
  selectedTitle: { fontWeight: '800' },
  choiceGroup: { flexDirection: 'row', gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.cardBorder },
  choice: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  settingTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8 },
  statusTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  statusBadge: { borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, paddingHorizontal: 10, paddingVertical: 6 },
  summary: { color: colors.text, fontSize: 14, fontWeight: '600' },
  panel: { paddingTop: 16, paddingBottom: 16, gap: 12 },
  onGray: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  disabled: { opacity: DISABLED_OPACITY }, // 눌림 효과 없음(사용자 지시)
})
