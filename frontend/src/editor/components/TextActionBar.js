import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import { TEXT_COLORS } from '../utils/text'
import { usePalette } from '../hooks/usePalettes'
import Icon from './controls/Icon'
import FadeScroll from './controls/FadeScroll'

export const TEXT_ACTION_BAR_WIDTH = 420
export const TEXT_ACTION_BAR_HEIGHT = 52 // 말풍선 한 줄(styles.bar) 높이. 줄 위에 붙일 자리가 있는지 잴 때 쓴다

// 웹: 버튼을 눌러도 입력창의 글자 선택(포커스)이 풀리지 않게 한다
const keepFocus = { onMouseDown: (event) => event.preventDefault?.() }

/**
 * 웹 전용 말풍선. 커서에서는 모두 선택 · 붙여넣기를, 문자열 선택 시에는 서식·링크·복사·잘라내기·삭제도 제공한다.
 * 앱(안드로이드 · iOS)은 시스템 글자 메뉴가 고르기 · 복사 · 붙여넣기를 맡고, 고른 글자 서식은 TextRangePanel 이 맡는다.
 * (시스템 메뉴를 끄면 안드로이드는 길게 눌러 고르기까지 막힌다.) '서식'을 누르면 아래에 고른 글자의 색·크기를 바꾸는 줄이 열린다.
 */
export default function TextActionBar({ onColor, onIncrease, onDecrease, onCopy, onCut, onPaste, onDelete, onLink, onSelectAll, hasSelection = true, hasText = false, canPaste = false, colorLabel = '선택 요소 색상', currentColor, linked = false }) {
  const textColors = usePalette?.('text')?.colors ?? TEXT_COLORS // 꾸미기 공방 '내 프리셋'의 글자 색
  const [formatOpen, setFormatOpen] = useState(false)
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {hasSelection && <>
          <LabeledButton icon="text" label="서식" active={formatOpen} onPress={() => setFormatOpen(!formatOpen)} />
          {onLink && <LabeledButton icon="link" label="링크" active={linked} onPress={onLink} />}
          <View style={styles.divider} />
          <IconButton icon="copy" label="복사" onPress={onCopy} />
          {onCut && <IconButton icon="scissors" label="잘라내기" onPress={onCut} />}
          <IconButton icon="trash" label="삭제" danger onPress={onDelete} />
        </>}
        {!hasSelection && hasText && onSelectAll && <LabeledButton icon="focus" label="모두 선택" onPress={onSelectAll} />}
        {canPaste && <LabeledButton icon="clipboard" label="붙여넣기" onPress={onPaste} />}
      </View>
      {hasSelection && formatOpen && (
        <View style={[styles.bar, styles.formatRow]}>
          {textColors.map((color) => (
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

/**
 * 앱에서 글을 고치는 동안 글자를 고르면 키보드 바로 위에 뜨는 '선택한 글자' 도구줄(삼성 노트 방식).
 * 복사 · 붙여넣기 등은 시스템 메뉴에 맡기고, 시스템 메뉴에 없는 고른 글자의 색 · 크기 · 링크만 둔다.
 * 시스템 메뉴는 고른 글자 바로 곁에 뜨고, 편집기는 글상자를 키보드보다 80 이상 위에 두므로 이 줄과 겹치지 않는다.
 */
export function TextRangePanel({ onColor, onIncrease, onDecrease, onLink, onClose, currentColor, linked = false, colorLabel = '선택 문자열 색상' }) {
  const textColors = usePalette?.('text')?.colors ?? TEXT_COLORS
  return (
    <View style={[styles.bar, styles.rangeBar]} accessibilityLabel="선택한 글자">
      <FadeScroll horizontal style={styles.rangeScroll} keyboardShouldPersistTaps="always" contentContainerStyle={styles.rangeContent}>
        {textColors.map((color) => (
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
        {onLink && <>
          <View style={styles.divider} />
          <LabeledButton icon="link" label="링크" active={linked} onPress={onLink} />
        </>}
        <View style={styles.divider} />
        <IconButton icon="close" label="글자 선택 풀기" onPress={onClose} />
      </FadeScroll>
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
      <Icon name={icon} size={17} forText={12.5} color={colors.text} />
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
  active: { backgroundColor: colors.primarySoft },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  divider: { width: 1, height: 22, marginHorizontal: 4, backgroundColor: colors.border },
  swatch: { width: 25, height: 25, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  chosen: { borderWidth: 3, borderColor: colors.primary },
  // 키보드 위 도구줄: 좁은 폰에서는 가로로 밀어 본다
  rangeBar: { maxWidth: '100%', paddingHorizontal: 0 },
  rangeScroll: { flexShrink: 1 },
  rangeContent: { alignItems: 'center', gap: 6, paddingHorizontal: 10 },
})
