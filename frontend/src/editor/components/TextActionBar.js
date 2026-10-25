import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import { TEXT_COLORS } from '../utils/text'
import Icon from './controls/Icon'

export const TEXT_ACTION_BAR_WIDTH = 420

// 웹: 버튼을 눌러도 입력창의 글자 선택(포커스)이 풀리지 않게 한다
const keepFocus = { onMouseDown: (event) => event.preventDefault?.() }

/**
 * 커서에서는 붙여넣기를, 문자열 선택 시에는 서식·링크·복사·삭제도 제공한다.
 * '서식'을 누르면 아래에 고른 글자의 색·크기를 바꾸는 줄이 열린다.
 */
export default function TextActionBar({ onColor, onIncrease, onDecrease, onCopy, onPaste, onDelete, onLink, hasSelection = true, canPaste = false, colorLabel = '선택 요소 색상', currentColor, linked = false }) {
  const [formatOpen, setFormatOpen] = useState(false)
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {hasSelection && <>
          <LabeledButton icon="text" label="서식" active={formatOpen} onPress={() => setFormatOpen(!formatOpen)} />
          {onLink && <LabeledButton icon="link" label="링크" active={linked} onPress={onLink} />}
          <View style={styles.divider} />
          <IconButton icon="copy" label="복사" onPress={onCopy} />
          <IconButton icon="trash" label="삭제" danger onPress={onDelete} />
        </>}
        {canPaste && <LabeledButton icon="clipboard" label="붙여넣기" onPress={onPaste} />}
      </View>
      {hasSelection && formatOpen && (
        <View style={[styles.bar, styles.formatRow]}>
          {TEXT_COLORS.map((color) => (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`${colorLabel} ${color}`}
              accessibilityState={{ selected: currentColor?.toUpperCase() === color.toUpperCase() }}
              {...keepFocus}
              onPress={() => onColor(color)}
              style={[styles.swatch, { backgroundColor: color }, currentColor?.toUpperCase() === color.toUpperCase() && styles.chosen]}
            />
          ))}
          <View style={styles.divider} />
          <IconButton icon="textSmaller" label="글씨 축소" onPress={onDecrease} />
          <IconButton icon="textLarger" label="글씨 확대" onPress={onIncrease} />
        </View>
      )}
    </View>
  )
}

function LabeledButton({ icon, label, active, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(active) }}
      {...keepFocus}
      onPress={onPress}
      style={({ pressed }) => [styles.button, active && styles.active, pressed && styles.pressed]}
    >
      <Icon name={icon} size={17} color={colors.text} />
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  )
}

function IconButton({ icon, label, danger, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...keepFocus}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} color={danger ? colors.danger : colors.text} />
    </Pressable>
  )
}

// 선택 바(ContextBar)와 같은 크기·모양
const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-start', gap: 6 },
  bar: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, borderRadius: 16, backgroundColor: colors.surface, ...shadow.float },
  formatRow: { gap: 6, paddingHorizontal: 10 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 42, paddingHorizontal: 10, borderRadius: 11 },
  buttonText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  iconButton: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: colors.surfaceSoft },
  pressed: { backgroundColor: colors.primarySoft },
  divider: { width: 1, height: 22, marginHorizontal: 4, backgroundColor: colors.border },
  swatch: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: colors.border },
  chosen: { borderWidth: 3, borderColor: colors.primary },
})
