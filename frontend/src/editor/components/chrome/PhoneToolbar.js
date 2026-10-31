import { Fragment } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import Icon from '../controls/Icon'
import SharingEntry from '../../../sharing/SharingEntry'

// 폰 편집기의 도구 막대. 도구 상태는 태블릿 리본(Ribbon)과 같이 EditorScreen이 소유한다.
// 세로(간편 편집): 모든 도구를 상단 가로 스크롤 막대에 둔다.
// 가로(정밀 편집): 오른쪽에 세운 막대에 모든 도구를 둔다.
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
    { tool: 'shape', icon: 'shape', label: '도형' },
    { tab: 'tape', icon: 'tape', label: '마스킹테이프' },
    { tab: 'photo', icon: 'image', label: '사진·GIF' },
  ],
]

const GUIDE_TOOL = { action: 'guides', icon: 'grid', label: '격자 가이드' }

// 가로 배치에서 양옆에 세운 막대의 폭 (버튼 44 + 막대 안쪽 여백·테두리 10 + 바깥 여백 8)
export const PHONE_TOOLBAR_RAIL = 62

const isActive = (item, activeTool, drawerTab, guidesActive) => (
  item.action === 'guides' ? guidesActive : item.tab ? drawerTab === item.tab : Boolean(item.tool && !drawerTab && activeTool === item.tool)
)

export default function PhoneToolbar({ sharingMembers = [], onOpenSharing, invitationCount = 0, vertical, bottomInset = 0, activeTool, drawerTab, guidesActive, penColor, highlighterColor, onSelectTool, onOpenDrawer, onOpenGuides, ...touch }) {
  const colorOf = (tool) => (tool === 'pen' ? penColor : tool === 'highlighter' ? highlighterColor : undefined)
  const press = (item) => {
    if (item.tab) onOpenDrawer(item.tab)
    else if (item.tool) onSelectTool(item.tool)
    else if (item.action === 'guides') onOpenGuides?.()
  }
  const renderTool = (item) => (
    <Tool key={item.label} icon={item.icon} label={item.label} color={colorOf(item.tool)}
      active={isActive(item, activeTool, drawerTab, guidesActive)} onPress={() => press(item)} />
  )
  const toolGroups = [...FULL_TOOLS, [GUIDE_TOOL]]

  if (vertical) {
    // 키가 낮은 기기에서는 넘칠 수 있어 스크롤되게 한다.
    return (
      <View style={[styles.rail, styles.railRight, { bottom: Math.max(bottomInset, 8) }]} {...touch}>
        <ScrollView style={styles.railBar} contentContainerStyle={styles.railColumn} showsVerticalScrollIndicator={false}>
          {onOpenSharing && <SharingEntry members={sharingMembers} compact count={invitationCount} onPress={onOpenSharing}/>}
          {toolGroups.map((group, index) => (
            <Fragment key={index}>
              {index > 0 && <View style={styles.railDivider} />}
              {group.map(renderTool)}
            </Fragment>
          ))}
        </ScrollView>
      </View>
    )
  }

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 8) }]} {...touch}>
      <View style={[styles.bar, styles.barViewport]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.barRow}
          accessibilityLabel="편집 도구"
          keyboardShouldPersistTaps="handled"
        >
          {onOpenSharing && <SharingEntry members={sharingMembers} compact count={invitationCount} onPress={onOpenSharing}/>}
          {toolGroups.map((group, index) => (
            <Fragment key={index}>
              {index > 0 && <View style={styles.rowDivider} />}
              {group.map(renderTool)}
            </Fragment>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}

/** 폰 가로 배치의 왼쪽 막대: 홈·페이지 목록 / 세로 전환·레이어·내보내기·집중 편집 */
export function PhoneEditorRail({ sharingMembers = [], pagesOpen, layersOpen, readOnly, onHome, onTogglePages, onToggleOrientation, onToggleLayers, onExport, onFocus, exportEnabled = true, onOpenSharing, invitationCount = 0, ...touch }) {
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
          {onOpenSharing && <SharingEntry vertical members={sharingMembers} compact count={invitationCount} onPress={onOpenSharing}/>}
          {exportEnabled && <Tool icon="share" label="내보내기" onPress={onExport} />}
          <Tool icon="focus" label="집중 편집" onPress={onFocus} />
        </View>
      </ScrollView>
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
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(129,138,195,0.2)',
  backgroundColor: 'rgba(255,255,255,0.97)',
  ...shadow.card,
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingTop: 6 },
  bar: card,
  barViewport: { overflow: 'hidden' },
  barRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 },
  rowDivider: { width: 1, height: 28, marginHorizontal: 5, backgroundColor: 'rgba(11,23,102,0.12)' },
  // 가로 배치의 양옆 막대
  rail: { position: 'absolute', top: 8, width: PHONE_TOOLBAR_RAIL - 8 },
  railLeft: { left: 8, bottom: 8 },
  railRight: { right: 8 },
  // 막대는 위아래 끝까지 세우고, 도구가 많으면 안에서 스크롤한다.
  railBar: { ...card, flex: 1 },
  railColumn: { alignItems: 'center', gap: 2 },
  railSpread: { flexGrow: 1, justifyContent: 'space-between' },
  railGroup: { alignItems: 'center', gap: 2 },
  railDivider: { width: 28, height: 1, marginVertical: 5, backgroundColor: 'rgba(11,23,102,0.12)' },
  // iOS HIG 최소 터치 영역 44pt
  tool: { width: 44, height: 44, borderRadius: 10, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  toolActive: { backgroundColor: colors.surface, borderColor: colors.primary }, // 선택: 흰 면 + 테두리 2px
  toolPressed: {}, // 눌림 효과 없음(사용자 지시)
  colorLine: { position: 'absolute', bottom: 5, width: 16, height: 3, borderRadius: 2 },
})
