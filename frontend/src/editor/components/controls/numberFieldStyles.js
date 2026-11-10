import { Platform, StyleSheet } from 'react-native'
import { colors } from '../../../shared/theme'

/**
 * 옵션 창 숫자 칸 모양(칸 + 글자). 자간 · 줄간격(NumberStepper)과 글자 크기 칸이 함께 써서 같은 모양으로 둔다(2026-11-10).
 * 글자 14/700 · 가운데 · border 테두리 · 모서리 9 · 높이 40
 */
export const numberFieldStyles = StyleSheet.create({
  box: { height: 40, paddingHorizontal: 4, justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  // 안드로이드 글꼴 위아래 여백을 빼야 숫자가 칸 세로 가운데에 놓인다
  input: { flex: 1, padding: 0, textAlign: 'center', textAlignVertical: 'center', fontSize: 14, fontWeight: '700', color: colors.text, includeFontPadding: false, ...(Platform.OS === 'web' && { outlineStyle: 'none' }) },
})
