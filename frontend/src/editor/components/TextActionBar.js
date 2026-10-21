import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import { TEXT_COLORS } from '../utils/text'
import Icon from './controls/Icon'

export const TEXT_ACTION_BAR_WIDTH = 420

export default function TextActionBar({ onColor, onIncrease, onDecrease, onCopy, onDelete, onLink, colorLabel = '선택 요소 색상', currentColor, linked = false }) {
  const action = (name, icon, onPress, danger = false) => <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={onPress}
    {...{ onMouseDown: (event) => event.preventDefault?.() }}
    style={({ pressed }) => [styles.button, pressed && styles.pressed, name === '링크' && linked && styles.pressed]}>
    <Icon name={icon} size={20} color={danger ? colors.danger : colors.text} />
  </Pressable>
  return <View style={styles.bar}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.content}>
      {TEXT_COLORS.map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`${colorLabel} ${color}`} accessibilityState={{ selected: currentColor?.toUpperCase() === color.toUpperCase() }}
        onMouseDown={(event) => event.preventDefault?.()} onPress={() => onColor(color)} style={[styles.swatch, { backgroundColor: color }, currentColor?.toUpperCase() === color.toUpperCase() && styles.chosen]} />)}
      <View style={styles.divider} />
      {action('글씨 축소', 'textSmaller', onDecrease)}
      {action('글씨 확대', 'textLarger', onIncrease)}
      <View style={styles.divider} />
      {action('복사', 'copy', onCopy)}
      {action('삭제', 'trash', onDelete, true)}
      <View style={styles.divider} />
      {action('링크', 'link', onLink)}
    </ScrollView>
  </View>
}

const styles = StyleSheet.create({
  bar: { width: TEXT_ACTION_BAR_WIDTH, maxWidth: '100%', height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface, ...shadow.float },
  content: { alignItems: 'center', gap: 4, paddingHorizontal: 9 },
  swatch: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: colors.border }, chosen: { borderWidth: 3, borderColor: colors.primary },
  button: { width: 34, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 22, width: 1, marginHorizontal: 3, backgroundColor: colors.border }, pressed: { backgroundColor: colors.primarySoft },
})
