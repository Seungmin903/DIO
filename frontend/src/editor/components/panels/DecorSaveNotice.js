import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'

// 문구만 바꿔 계정 동기화 실패(꾸미기 공방 스티커 · 테이프 탭)에도 쓴다.
// 흰 바탕 위 작은 오류 글자는 dangerStrong, 테두리는 danger(디자인 가이드 색 규칙)
export default function DecorSaveNotice({ error, pending, onRetry, retryLabel = '다시 저장', pendingLabel = '다시 저장 중…', accessibilityLabel = '꾸미기 보관함 저장 재시도' }) {
  if (!error) return null
  return <View accessibilityRole="alert" style={styles.notice}>
    <Text style={styles.message}>{error}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: pending, busy: pending }} disabled={pending} onPress={onRetry}
      style={[styles.button, pending && styles.disabled]}>
      <Text style={styles.buttonText}>{pending ? pendingLabel : retryLabel}</Text>
    </Pressable>
  </View>
}

const styles = StyleSheet.create({
  notice: { marginHorizontal: 16, marginBottom: 8, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, backgroundColor: colors.surface },
  message: { color: colors.dangerStrong, fontSize: 12, lineHeight: 18 },
  button: { alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  buttonText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: DISABLED_OPACITY },
})
