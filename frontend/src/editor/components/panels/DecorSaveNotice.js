import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'

export default function DecorSaveNotice({ error, pending, onRetry }) {
  if (!error) return null
  return <View accessibilityRole="alert" style={styles.notice}>
    <Text style={styles.message}>{error}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="꾸미기 보관함 저장 재시도"
      accessibilityState={{ disabled: pending, busy: pending }} disabled={pending} onPress={onRetry}
      style={[styles.button, pending && styles.disabled]}>
      <Text style={styles.buttonText}>{pending ? '다시 저장 중…' : '다시 저장'}</Text>
    </Pressable>
  </View>
}

const styles = StyleSheet.create({
  notice: { marginHorizontal: 16, marginBottom: 8, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, backgroundColor: colors.surface },
  message: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  button: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  buttonText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: DISABLED_OPACITY },
})
