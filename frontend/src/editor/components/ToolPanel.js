import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, DISABLED_OPACITY } from '../../shared/theme'
import Icon from './controls/Icon'

// 도구 옵션·보관함·내보내기가 공유하는 제목과 표면 기준.
// 스티커·마테·사진 옵션 창(MorePanel)과 같은 느낌: 둥근 유리 카드, 굵은 제목, 작은 회색 구역 제목, 회색 바탕의 세그먼트 버튼.
// dragHandlers: 폰 세로 하단 시트(PhoneSheet)가 넘긴다 — 제목 줄을 아래로 끌어 닫는다
export function ToolPanelHeader({ icon, title, onClose, closeLabel, disabled = false, dragHandlers, children }) {
  return <View style={toolPanelStyles.heading} {...dragHandlers}>
    <View style={toolPanelStyles.titleRow}><Icon name={icon} size={18} forText={15} /><Text style={toolPanelStyles.title}>{title}</Text></View>
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
// steadyLabel: 켜고 꺼도 칸 안 글자는 그대로 두고 켜짐은 테두리로만 보인다(글자 서식 B · I · U · S 처럼 글자 자체가 표시인 칸)
export function Segmented({ items, selected, onPress, disabled = false, separate = false, steadyLabel = false }) {
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
            {item.icon ? item.icon : <Text style={[toolPanelStyles.segmentText, on && !steadyLabel && toolPanelStyles.segmentTextActive, item.textStyle]}>{item.label}</Text>}
          </Pressable>
        )
      })}
    </View>
  )
}

// 떠 있는 창(옵션·도구 설정·보관함·대화상자·버블)의 모서리 둥글기. 선택 바는 16.
// B안: 카드 12 (코덱스 17·21·22번). 앵커 패널은 그림자 없이 테두리만
export const PANEL_RADIUS = 12

export const toolPanelStyles = StyleSheet.create({
  card: {
    width: 320, // 코덱스 17·18·22·23·24번: 앵커 패널 폭 320
    maxWidth: '100%',
    maxHeight: 590, // 가로 태블릿에서 쓸 수 있는 높이까지(코덱스 2026-11-02, 480 에서 늘림). 바깥 칸이 더 작으면(폰) flexShrink 로 줄어들고 그때만 안에서 스크롤
    flexShrink: 1,
    borderRadius: PANEL_RADIUS,
    backgroundColor: colors.surface, // 흰 면 + 1px 테두리, 그림자 없음
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  // 하단 시트 안: 폭 꽉 · 높이는 시트가 정한다(안에서 스크롤). 윗모서리 · 테두리는 PhoneSheet 가 그린다
  sheetCard: { width: '100%', maxHeight: '100%', borderRadius: 0, borderWidth: 0, flexShrink: 1 },
  heading: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 8, paddingTop: 6 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  scrollFrame: { flexGrow: 1, flexShrink: 1, minHeight: 0 }, // FadeScroll 바깥 칸: 예전 ScrollView 기본 배치(늘고 줄어듦)를 그대로 잇는다
  content: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 2, gap: 10 }, // 큰 구역 사이 10(코덱스 2026-11-02, 12 에서 줄여 스크롤 없이 들어가게)
  // 구역 제목 (MorePanel 의 sectionTitle 과 같다)
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  // B안 테두리 칩: 칸마다 흰 면 + cardBorder 테두리, 고른 칸은 primaryStrong 테두리(그림자 · 회색 판 없음). 칸 사이 6
  segment: { flexDirection: 'row', gap: 6 },
  segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  segmentActive: { borderColor: colors.primaryStrong, borderWidth: 2 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {},
  chipActive: { borderColor: colors.primaryStrong, borderWidth: 2 },
  segmentText: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '800' },
  dim: { opacity: DISABLED_OPACITY },
})
