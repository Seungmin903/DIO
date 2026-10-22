import { useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import Icon from '../controls/Icon'

// 도구 상태는 EditorScreen이 소유하고 캔버스와 공유한다.
// 화면 이동·고르기 도구
const NAV_TOOLS = [
  { id: 'hand', icon: 'hand', label: '손바닥 (화면 이동)' },
  { id: 'select', icon: 'cursor', label: '선택' },
  { id: 'lasso', icon: 'lasso', label: '올가미 선택' },
]

// 그리기·쓰기 도구
const INPUT_TOOLS = [
  { id: 'pen', icon: 'pen', label: '펜' },
  { id: 'highlighter', icon: 'highlighter', label: '형광펜' },
  { id: 'eraser', icon: 'eraser', label: '지우개' },
  { id: 'text', icon: 'text', label: '텍스트' },
]

const DECOR_TOOLS = [
  { tab: 'sticker', icon: 'sticker', label: '스티커' },
  { tab: 'tape', icon: 'tape', label: '마스킹테이프' },
  { tab: 'photo', icon: 'image', label: '사진' },
]

export default function Ribbon({ activeTool, drawerTab, onOpenDrawer, onSelectTool, onPlaceholder, onAnchor, penColor, highlighterColor, guidesActive, onOpenGuides }) {
  return (
    <View style={styles.shell}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ribbon} accessibilityLabel="편집 도구" keyboardShouldPersistTaps="handled">
        {NAV_TOOLS.map((tool) => (
          <Tool onAnchor={onAnchor} key={tool.id} icon={tool.icon} label={tool.label} dim={tool.pending}
            active={!drawerTab && activeTool === tool.id}
            onPress={() => tool.pending ? onPlaceholder(tool.label) : onSelectTool(tool.id)} />
        ))}
        <View style={styles.divider} />
        {INPUT_TOOLS.map((tool) => (
          <Tool color={tool.id === 'pen' ? penColor : tool.id === 'highlighter' ? highlighterColor : undefined} onAnchor={onAnchor} key={tool.id} icon={tool.icon} label={tool.label} dim={tool.pending}
            active={!drawerTab && activeTool === tool.id}
            onPress={() => tool.pending ? onPlaceholder(tool.label) : onSelectTool(tool.id)} />
        ))}
        <View style={styles.divider} />
        {DECOR_TOOLS.map((tool) => (
          <Tool onAnchor={onAnchor} key={tool.tab} icon={tool.icon} label={tool.label} active={drawerTab === tool.tab} onPress={() => onOpenDrawer(tool.tab)} />
        ))}
        <View style={styles.divider} />
        {/* 하이퍼링크는 요소를 누르면 뜨는 옵션 바에서 건다 */}
        <Tool onAnchor={onAnchor} icon="guides" label="격자 가이드" active={guidesActive} onPress={onOpenGuides} />
      </ScrollView>
    </View>
  )
}

function Tool({ icon, label, active, dim, onPress, onAnchor, color }) {
  const ref = useRef(null)
  const measure = () => ref.current?.measureInWindow?.((x, y, width, height) => onAnchor?.({ x, y, width, height }))
  return (
    <Pressable
      ref={ref}
      onLayout={active ? measure : undefined}
      onPress={() => { measure(); onPress() }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      aria-pressed={Boolean(active)}
      style={({ pressed }) => [styles.tool, active && styles.toolActive, pressed && styles.toolPressed, dim && styles.toolDim]}
    >
      <Icon name={icon} size={21} />
      {color && <View pointerEvents="none" accessible={false} style={[styles.colorDot, { backgroundColor: color }]} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  colorDot: { position: 'absolute', right: 3, bottom: 3, width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: colors.surface, shadowColor: colors.text, shadowOpacity: 0.18, shadowRadius: 1, shadowOffset: { width: 0, height: 0 } },
  shell: {
    maxWidth: '100%',
    flexShrink: 1,
    padding: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(110,146,198,0.2)',
    backgroundColor: 'rgba(255,255,255,0.95)',
    shadowColor: colors.text,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    overflow: 'hidden',
  },
  ribbon: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tool: { width: 42, height: 42, borderRadius: 11, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  toolActive: { backgroundColor: colors.surfaceSoft, borderColor: colors.primary },
  toolPressed: { backgroundColor: colors.primarySoft },
  toolDim: { opacity: 0.32 },
  divider: { width: 1, height: 24, marginHorizontal: 5, backgroundColor: 'rgba(11,25,87,0.12)' },
})
