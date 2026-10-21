import { ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../shared/theme'

// 형태 선택은 리본 아래에, 선택 후 작업 메뉴는 캔버스의 선택 영역 아래에 표시한다.
export default function LassoSettings({ shape, onShapeChange, onClose }) {
  return <View style={toolPanelStyles.card} accessibilityLabel="올가미 형태 설정">
    <ToolPanelHeader icon="lasso" title="올가미" closeLabel="올가미 설정 닫기" onClose={onClose} />
    <View style={[toolPanelStyles.content, { flexDirection: 'row' }]}>
    {[['rectangle', '네모'], ['freeform', '자유형']].map(([id, label]) => (
      <Pressable key={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: shape === id }}
        aria-pressed={shape === id} onPress={() => onShapeChange(id)}
        style={({ pressed }) => [styles.button, shape === id && styles.selected, pressed && styles.pressed]}>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    ))}
    </View>
  </View>
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', padding: 6, gap: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, ...shadow.card },
  close: { width: 44, minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginLeft: 4 },
  closeText: { color: colors.text, fontSize: 22 },
  label: { color: colors.text, fontSize: 13 },
  button: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pressed: { backgroundColor: colors.surfaceSoft },
})
