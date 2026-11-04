import EditorModal from './EditorModal'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import { PANEL_RADIUS } from '../ToolPanel'

/**
 * 한 번 묻는 확인 창 (취소 / 확정). 웹에서도 같은 모양이 나오도록 RN Alert 대신 직접 그린다.
 * open 이 거짓이면 아무것도 그리지 않는다.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel = '삭제', cancelLabel = '취소', danger = true, showCancel = true, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <EditorModal transparent animationType="none" onRequestClose={onCancel}>
      <ConfirmDialogContent title={title} message={message} confirmLabel={confirmLabel} cancelLabel={cancelLabel} danger={danger} showCancel={showCancel} onConfirm={onConfirm} onCancel={onCancel} />
    </EditorModal>
  )
}

export function ConfirmDialogContent({ title, message, confirmLabel = '삭제', cancelLabel = '취소', danger = true, showCancel = true, onConfirm, onCancel }) {
  return (
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="닫기">
        {/* 카드 안을 눌러도 닫히지 않게 터치를 여기서 받는다 */}
        <Pressable style={styles.card} onPress={() => {}} accessibilityRole="alert">
          <Text style={styles.title}>{title}</Text>
          {message ? <Text lineBreakStrategyIOS="hangul-word" style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            {showCancel && <Pressable onPress={onCancel} style={({ pressed }) => [styles.button, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>}
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
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
  card: { width: 320, maxWidth: '100%', padding: 20, borderRadius: PANEL_RADIUS, backgroundColor: colors.surface, ...shadow.float },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  message: { marginTop: 8, fontSize: 13, lineHeight: 19, color: colors.textMuted, ...(Platform.OS === 'web' && { wordBreak: 'keep-all' }) }, // 한글은 단어 단위로 줄을 바꾼다
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  button: { minWidth: 76, height: 42, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  danger: { backgroundColor: colors.dangerStrong }, // 흰 글자를 올리는 위험 버튼은 dangerStrong(6.0:1). danger(3.85:1)는 아이콘 · 테두리용
  primary: { backgroundColor: colors.primaryStrong },
  confirmPressed: {}, // 눌림 효과 없음(사용자 지시)
  cancelText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  confirmText: { fontSize: 14, fontWeight: '700', color: colors.surface },
})
