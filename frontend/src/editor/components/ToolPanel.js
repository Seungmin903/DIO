import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow, DISABLED_OPACITY } from '../../shared/theme'
import Icon from './controls/Icon'

// 도구 옵션·보관함·내보내기가 공유하는 제목과 표면 기준.
// 스티커·마테·사진 옵션 창(MorePanel)과 같은 느낌: 둥근 유리 카드, 굵은 제목, 작은 회색 구역 제목, 회색 바탕의 세그먼트 버튼.
export function ToolPanelHeader({ icon, title, onClose, closeLabel, disabled = false, children }) {
  return <View style={toolPanelStyles.heading}>
    <View style={toolPanelStyles.titleRow}><Icon name={icon} size={18} /><Text style={toolPanelStyles.title}>{title}</Text></View>
    {children}
    <Pressable accessibilityRole="button" accessibilityLabel={closeLabel ?? `${title} 닫기`} disabled={disabled} onPress={onClose} style={[toolPanelStyles.close, disabled && { opacity: DISABLED_OPACITY }]}><Icon name="close" size={18} /></Pressable>
  </View>
}

/**
 * 스티커·마테·사진 옵션과 같은 세그먼트 버튼. 회색 바탕 위에 고른 칸만 흰색으로 뜬다.
 * items: [{ id, label?, icon?, a11y?, textStyle?, disabled? }], selected(id) → 고른 칸인지, onPress(id)
 * 한 칸만 고르는 경우(정렬)와 여러 칸을 켜고 끄는 경우(굵게·기울임) 모두 같은 모양으로 쓴다.
 * separate: 글자 칸을 여러 개 켜고 끄는 줄(보조선)은 켜진 칸끼리 붙어 보여 간격이 달라 보이므로, 칸마다 바탕을 두고 같은 간격으로 띄운다.
 */
export function Segmented({ items, selected, onPress, disabled = false, separate = false }) {
  return (
    <View style={[separate ? toolPanelStyles.chips : toolPanelStyles.segment, disabled && toolPanelStyles.dim]}>
      {items.map((item) => {
        const itemDisabled = disabled || Boolean(item.disabled)
        const on = !item.disabled && selected(item.id)
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.a11y ?? item.label}
            accessibilityState={{ selected: on, disabled: itemDisabled }}
            disabled={itemDisabled}
            onPress={() => onPress(item.id)}
            style={[toolPanelStyles.segmentItem, separate && toolPanelStyles.chip, on && (separate ? toolPanelStyles.chipActive : toolPanelStyles.segmentActive), item.disabled && toolPanelStyles.dim]}
          >
            {item.icon ? item.icon : <Text style={[toolPanelStyles.segmentText, on && toolPanelStyles.segmentTextActive, item.textStyle]}>{item.label}</Text>}
          </Pressable>
        )
      })}
    </View>
  )
}

// 떠 있는 창(옵션·도구 설정·보관함·대화상자·버블)의 모서리 둥글기. 선택 바는 16.
export const PANEL_RADIUS = 24

export const toolPanelStyles = StyleSheet.create({
  card: {
    width: 300,
    maxWidth: '100%',
    maxHeight: '100%',
    flexShrink: 1,
    borderRadius: PANEL_RADIUS,
    backgroundColor: 'rgba(255,255,255,0.97)',
    // 웹에서는 뒤 캔버스가 살짝 비치는 유리 질감 (네이티브는 불투명에 가까운 흰 배경)
    ...Platform.select({ web: { backgroundColor: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(18px)' }, default: {} }),
    overflow: 'hidden',
    ...shadow.float,
  },
  heading: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 8, paddingTop: 6 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  content: { paddingHorizontal: 16, paddingBottom: 18, paddingTop: 2, gap: 12 },
  // 구역 제목 (MorePanel 의 sectionTitle 과 같다)
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  // 칸 사이 3 간격: 여러 칸을 함께 켰을 때(보조선·굵게/기울임) 흰 칸끼리 붙어 보이지 않게
  segment: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: 11, backgroundColor: colors.surfaceMuted },
  segmentItem: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: colors.surface, boxShadow: '0px 1px 3px rgba(11, 25, 87, 0.14)' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: colors.surfaceMuted, borderWidth: 1.5, borderColor: 'transparent', borderRadius: 11 },
  chipActive: { backgroundColor: colors.surface, borderColor: colors.primary },
  segmentText: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '800' },
  dim: { opacity: DISABLED_OPACITY },
})
