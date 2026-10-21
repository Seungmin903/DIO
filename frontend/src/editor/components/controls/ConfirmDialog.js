import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'

/**
 * 한 번 묻는 확인 창 (취소 / 확정). 웹에서도 같은 모양이 나오도록 RN Alert 대신 직접 그린다.
 * open 이 거짓이면 아무것도 그리지 않는다.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel = '삭제', danger = true, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <Modal transparent animationType="none" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="닫기">
        {/* 카드 안을 눌러도 닫히지 않게 터치를 여기서 받는다 */}
        <Pressable style={styles.card} onPress={() => {}} accessibilityRole="alert">
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.button, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [styles.button, danger ? styles.danger : styles.primary, pressed && styles.confirmPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(11,25,87,0.28)' },
  card: { width: 320, maxWidth: '100%', padding: 20, borderRadius: 20, backgroundColor: colors.surface, ...shadow.float },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  message: { marginTop: 8, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  button: { minWidth: 76, height: 42, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: colors.primarySoft },
  danger: { backgroundColor: colors.danger },
  primary: { backgroundColor: colors.primary },
  confirmPressed: { opacity: 0.85 },
  cancelText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  confirmText: { fontSize: 14, fontWeight: '800', color: colors.surface },
})
