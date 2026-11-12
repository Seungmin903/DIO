import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import Icon from './controls/Icon'

// 막대 폭 어림(자리 계산용): 완료 글자 버튼 + 아이콘 버튼 둘 + 구분선 둘
export const TEXT_EDIT_BAR_WIDTH = 200

// 웹: 버튼을 눌러도 입력창의 포커스 · 글자 선택이 풀리지 않게 한다(TextActionBar 와 같다)
const keepFocus = { onMouseDown: (event) => event.preventDefault?.() }

/**
 * 글을 고치는 동안 글상자 위(자리가 없으면 아래)에 뜨는 **상자 단위 동작** 막대(S15P31F106-482): `완료`(입력 확정 · 키보드 닫기) · 복제(지금 입력 · 서식을 저장한 사본) · 삭제.
 * 글자 모양(글꼴 · 크기 · 스타일 · 색 · 자간 · 줄간격)은 키보드 위 서식 줄(TextFormatStrip)이, 고른 글자의 색 · 크기 · 링크는 '선택한 글자' 줄(TextRangePanel)이 맡아
 * 막대는 상자 동작만 둔다 — 역할이 한 줄로 설명된다(실기 피드백 2026-11-10). 서식 줄은 늘 떠 있어 켜고 끄는 `서식` 버튼은 뺐다.
 * 삭제는 구분선으로 떼어 복제와 붙어 있지 않게 한다(글을 쓰다 오터치로 상자가 사라지면 손실이 크다). 기존 상자를 지우면 '되돌리기로 복구' 토스트를 띄운다(EditorScreen).
 * 한글 조합 중에는 완료 · 복제가 입력을 자르지 않도록 아무 일도 하지 않는다(commit 이 false 를 돌려준다).
 * 복사 · 붙여넣기 · 고르기는 시스템 글자 메뉴(앱) · 말풍선(웹)이 맡는다. 한 줄 고정(폭 약 200): 스크롤 뷰로 감싸면 웹에서 버튼을 누를 때 입력창 포커스가 풀려 편집이 끝났다.
 */
export default function TextEditBar({ onDone, onDuplicate, onDelete, style }) {
  return (
    <View style={[styles.bar, style]} accessibilityLabel="글상자 작업">
        <LabeledButton icon="check" label="완료" onPress={onDone} />
        <View style={styles.divider} />
        <IconButton icon="duplicate" label="복제" onPress={onDuplicate} />
        <View style={styles.divider} />
        <IconButton icon="trash" label="삭제" danger onPress={onDelete} />
    </View>
  )
}

function LabeledButton({ icon, label, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} {...keepFocus} onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Icon name={icon} size={17} forText={12.5} color={colors.text} />
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  )
}

function IconButton({ icon, label, danger, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} {...keepFocus} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={danger ? colors.danger : colors.text} />
    </Pressable>
  )
}

// 선택 바(ContextBar) · 글 말풍선(TextActionBar)과 같은 크기 · 모양
const styles = StyleSheet.create({
  bar: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, borderRadius: 16, backgroundColor: colors.surface, ...shadow.float },
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 42, paddingHorizontal: 10, borderRadius: 11 },
  buttonText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  iconButton: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  divider: { width: 1, height: 22, marginHorizontal: 4, backgroundColor: colors.border },
})
