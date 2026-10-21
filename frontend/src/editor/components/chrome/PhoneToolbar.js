import { Fragment } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import Icon from '../controls/Icon'

// 폰 편집기의 도구 막대. 도구 상태는 태블릿 리본(Ribbon)과 같이 EditorScreen이 소유한다.
// 세로(간편 편집): 자주 쓰는 도구만 아래 막대에 두고 나머지는 더보기 시트로 보낸다.
// 가로(정밀 편집): 오른쪽에 세운 막대에 모든 도구를 둔다.
const QUICK_TOOLS = [
  { tool: 'select', icon: 'cursor', label: '선택' },
  { tool: 'lasso', icon: 'lasso', label: '올가미 선택' },
  { tool: 'pen', icon: 'pen', label: '펜' },
  { tool: 'highlighter', icon: 'highlighter', label: '형광펜' },
  { tool: 'eraser', icon: 'eraser', label: '지우개' },
  { tool: 'text', icon: 'text', label: '텍스트' },
  { tab: 'sticker', icon: 'sticker', label: '스티커' },
]

// 가로 막대: 이동·고르기 / 그리기·쓰기 / 꾸미기 묶음
const FULL_TOOLS = [
  [
    { tool: 'hand', icon: 'hand', label: '손바닥 (화면 이동)' },
    { tool: 'select', icon: 'cursor', label: '선택' },
    { tool: 'lasso', icon: 'lasso', label: '올가미 선택' },
  ],
  [
    { tool: 'pen', icon: 'pen', label: '펜' },
    { tool: 'highlighter', icon: 'highlighter', label: '형광펜' },
    { tool: 'eraser', icon: 'eraser', label: '지우개' },
    { tool: 'text', icon: 'text', label: '텍스트' },
  ],
  [
    { tab: 'sticker', icon: 'sticker', label: '스티커' },
    { tab: 'tape', icon: 'tape', label: '마스킹테이프' },
    { tab: 'photo', icon: 'image', label: '사진·GIF' },
  ],
]

// 세로 더보기 시트: tool은 도구 선택, tab은 꾸미기 보관함, action은 화면 동작
const MORE_TOOLS = [
  { tool: 'hand', icon: 'hand', label: '손바닥' },
  { action: 'export', icon: 'share', label: '내보내기' },
  { tab: 'tape', icon: 'tape', label: '테이프' },
  { tab: 'photo', icon: 'image', label: '사진·GIF' },
  { action: 'focus', icon: 'focus', label: '집중 편집' },
]

// 가로 배치에서 양옆에 세운 막대의 폭 (버튼 44 + 막대 안쪽 여백·테두리 10 + 바깥 여백 8)
export const PHONE_TOOLBAR_RAIL = 62

const isActive = (item, activeTool, drawerTab) => (item.tab ? drawerTab === item.tab : Boolean(item.tool && !drawerTab && activeTool === item.tool))

export default function PhoneToolbar({ vertical, bottomInset = 0, activeTool, drawerTab, moreOpen, penColor, highlighterColor, onSelectTool, onOpenDrawer, onToggleMore, ...touch }) {
  const colorOf = (tool) => (tool === 'pen' ? penColor : tool === 'highlighter' ? highlighterColor : undefined)
  const press = (item) => (item.tab ? onOpenDrawer(item.tab) : onSelectTool(item.tool))
  const renderTool = (item) => (
    <Tool key={item.label} icon={item.icon} label={item.label} color={colorOf(item.tool)}
      active={isActive(item, activeTool, drawerTab)} onPress={() => press(item)} />
  )

  if (vertical) {
    // 키가 낮은 기기에서는 넘칠 수 있어 스크롤되게 한다.
    return (
      <View style={[styles.rail, styles.railRight, { bottom: Math.max(bottomInset, 8) }]} {...touch}>
        <ScrollView style={styles.railBar} contentContainerStyle={styles.railColumn} showsVerticalScrollIndicator={false}>
          {FULL_TOOLS.map((group, index) => (
            <Fragment key={index}>
              {index > 0 && <View style={styles.railDivider} />}
              {group.map(renderTool)}
            </Fragment>
          ))}
        </ScrollView>
      </View>
    )
  }

  const moreActive = moreOpen || MORE_TOOLS.some((item) => isActive(item, activeTool, drawerTab))
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 8) }]} {...touch}>
      <View style={[styles.bar, styles.barRow]}>
        {QUICK_TOOLS.map(renderTool)}
        <Tool icon="more" label="추가 도구" active={moreActive} onPress={onToggleMore} />
      </View>
    </View>
  )
}

/** 폰 가로 배치의 왼쪽 막대: 홈·페이지 목록 / 세로 전환·레이어·내보내기·집중 편집 */
export function PhoneEditorRail({ pagesOpen, layersOpen, readOnly, onHome, onTogglePages, onToggleOrientation, onToggleLayers, onExport, onFocus, ...touch }) {
  return (
    <View style={[styles.rail, styles.railLeft]} {...touch}>
      <ScrollView style={styles.railBar} contentContainerStyle={[styles.railColumn, styles.railSpread]} showsVerticalScrollIndicator={false}>
        <View style={styles.railGroup}>
          <Tool icon="chevronLeft" label="다이어리 홈" onPress={onHome} />
          <Tool icon="panel" label="페이지 목록" active={pagesOpen} onPress={onTogglePages} />
        </View>
        <View style={styles.railGroup}>
          {onToggleOrientation && <Tool icon="rotate" label="세로 간편 편집으로 전환" onPress={onToggleOrientation} />}
          {!readOnly && <Tool icon="layers" label="레이어" active={layersOpen} onPress={onToggleLayers} />}
          <Tool icon="share" label="내보내기" onPress={onExport} />
          <Tool icon="focus" label="집중 편집" onPress={onFocus} />
        </View>
      </ScrollView>
    </View>
  )
}

/** 더보기에서 고르는 도구 묶음. 편집 화면 위(도구 막대 쪽)에 시트로 띄운다. */
export function PhoneMoreTools({ activeTool, drawerTab, onSelectTool, onOpenDrawer, onExport, onFocus, onClose }) {
  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>추가 도구</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="추가 도구 닫기" style={styles.sheetClose}>
          <Icon name="close" size={18} />
        </Pressable>
      </View>
      <View style={styles.sheetGrid}>
        {MORE_TOOLS.map((item) => {
          const active = isActive(item, activeTool, drawerTab)
          const press = () => {
            if (item.tool) onSelectTool(item.tool)
            else if (item.tab) onOpenDrawer(item.tab)
            else if (item.action === 'export') onExport()
            else onFocus()
          }
          return (
            <Pressable key={item.label} onPress={press} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.sheetItem, active && styles.toolActive, pressed && styles.toolPressed]}>
              <Icon name={item.icon} size={22} />
              <Text style={styles.sheetLabel}>{item.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function Tool({ icon, label, active, onPress, color }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(active) }}
      aria-pressed={Boolean(active)}
      style={({ pressed }) => [styles.tool, active && styles.toolActive, pressed && styles.toolPressed]}
    >
      <Icon name={icon} size={21} />
      {color && <View pointerEvents="none" accessible={false} style={[styles.colorLine, { backgroundColor: color }]} />}
    </Pressable>
  )
}

const card = {
  padding: 4,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(110,146,198,0.2)',
  backgroundColor: 'rgba(255,255,255,0.97)',
  ...shadow.card,
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingTop: 6 },
  bar: card,
  barRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // 가로 배치의 양옆 막대
  rail: { position: 'absolute', top: 8, width: PHONE_TOOLBAR_RAIL - 8 },
  railLeft: { left: 8, bottom: 8 },
  railRight: { right: 8 },
  // 막대는 위아래 끝까지 세우고, 도구가 많으면 안에서 스크롤한다.
  railBar: { ...card, flex: 1 },
  railColumn: { alignItems: 'center', gap: 2 },
  railSpread: { flexGrow: 1, justifyContent: 'space-between' },
  railGroup: { alignItems: 'center', gap: 2 },
  railDivider: { width: 28, height: 1, marginVertical: 5, backgroundColor: 'rgba(11,25,87,0.12)' },
  // iOS HIG 최소 터치 영역 44pt
  tool: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  toolActive: { backgroundColor: colors.surfaceSoft, borderColor: colors.primary },
  toolPressed: { backgroundColor: colors.primarySoft },
  colorLine: { position: 'absolute', bottom: 5, width: 16, height: 3, borderRadius: 2 },
  sheet: { width: '100%', maxWidth: 420, padding: 18, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, ...shadow.float },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  sheetClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetItem: { width: '23%', minWidth: 72, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  sheetLabel: { fontSize: 11.5, fontWeight: '700', color: colors.text },
})
