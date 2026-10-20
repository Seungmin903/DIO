import { Pressable, StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import Icon from '../controls/Icon'

// 명세: 리본바는 아이콘 중심. 그리기·텍스트·링크·격자는 다른 담당 범위라 자리만 잡아 둔다.
const PLACEHOLDER_TOOLS = [
  { id: 'lasso', icon: 'lasso', label: '올가미 선택' },
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

export default function Ribbon({ drawerTab, onOpenDrawer, onSelectTool, onPlaceholder }) {
  return (
    <View style={styles.ribbon}>
      <Tool icon="cursor" label="선택" active={!drawerTab} onPress={onSelectTool} />
      {PLACEHOLDER_TOOLS.map((tool) => (
        <Tool key={tool.id} icon={tool.icon} label={tool.label} dim onPress={() => onPlaceholder(tool.label)} />
      ))}
      <View style={styles.divider} />
      {DECOR_TOOLS.map((tool) => (
        <Tool key={tool.tab} icon={tool.icon} label={tool.label} active={drawerTab === tool.tab} onPress={() => onOpenDrawer(tool.tab)} />
      ))}
      <View style={styles.divider} />
      <Tool icon="link" label="하이퍼링크" dim onPress={() => onPlaceholder('하이퍼링크')} />
      <Tool icon="grid" label="격자 가이드" dim onPress={() => onPlaceholder('격자 가이드')} />
    </View>
  )
}

function Tool({ icon, label, active, dim, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.tool, active && styles.toolActive, pressed && styles.toolPressed, dim && styles.toolDim]}
    >
      <Icon name={icon} size={21} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(110,146,198,0.2)',
    backgroundColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#0B1957',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  tool: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  toolActive: { backgroundColor: colors.surfaceSoft },
  toolPressed: { backgroundColor: colors.primarySoft },
  toolDim: { opacity: 0.32 },
  divider: { width: 1, height: 24, marginHorizontal: 5, backgroundColor: 'rgba(11,25,87,0.12)' },
})
