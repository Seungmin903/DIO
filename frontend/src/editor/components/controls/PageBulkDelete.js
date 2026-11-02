import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, DISABLED_OPACITY, radius } from '../../../shared/theme'
import ConfirmDialog from './ConfirmDialog'
import Icon from './Icon'

export default function PageBulkDelete({ pages, ids, onDelete, onReset, onDone, canUndoDelete = true }) {
  const [pending, setPending] = useState(null)
  const confirmed = useRef(false)
  const selected = pages.filter(page => ids.includes(page.id)).map(page => page.id)
  const blocked = !selected.length || selected.length >= pages.length
  return <View style={styles.actions}>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked }} disabled={blocked} hitSlop={{ top: 6, bottom: 6 }}
      accessibilityLabel={`선택한 ${selected.length}개 삭제`}
      style={({ pressed }) => [styles.delete, blocked && styles.disabled, pressed && styles.pressed]}
      onPress={() => { confirmed.current = false; setPending(selected) }}>
      <Icon name="trash" size={14} forText={11.5} color={colors.danger} />
      <Text style={styles.deleteText}>선택 삭제</Text>
    </Pressable>
    {selected.length >= pages.length && <Text style={styles.hint}>페이지는 최소 한 장 남겨 주세요.</Text>}
    {onReset && <Pressable accessibilityRole="button" accessibilityLabel="다이어리 초기화" hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [styles.reset, pressed && styles.pressed]}
      onPress={() => { confirmed.current = false; setPending('reset') }}>
      <Text style={styles.resetText}>다이어리 초기화</Text>
    </Pressable>}
    <ConfirmDialog open={Boolean(pending)} title={pending === 'reset' ? '다이어리를 초기화할까요?' : `${pending?.length ?? 0}개 페이지를 삭제할까요?`}
      confirmLabel={pending === 'reset' ? '초기화' : '삭제'}
      message={pending === 'reset' ? `필터와 선택에 관계없이 모든 ${pages.length}개 페이지와 내용을 지우고 빈 페이지 한 장을 남겨요. 제목과 표지는 유지돼요. 되돌리기는 현재 편집 중에만 가능해요.` : (canUndoDelete ? '선택한 페이지의 내용이 함께 삭제돼요. 되돌리기로 복구할 수 있어요.' : '선택한 페이지의 내용이 함께 삭제되고 공유 멤버에게도 반영돼요. 여기서 되돌릴 수 없어요.')}
      onCancel={() => setPending(null)} onConfirm={() => {
        if (!pending || confirmed.current) return
        confirmed.current = true
        if (pending === 'reset') {
          onReset?.()
          setPending(null)
          onDone()
          return
        }
        const valid = pages.filter(page => pending.includes(page.id)).map(page => page.id)
        if (valid.length && valid.length < pages.length) onDelete(valid)
        setPending(null)
        onDone()
      }} />
  </View>
}

const styles = StyleSheet.create({
  actions: { gap: 12, paddingTop: 6, paddingBottom: 6 },
  delete: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  deleteText: { color: colors.danger, fontSize: 11.5, fontWeight: '700' },
  reset: { minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  resetText: { color: colors.textMuted, fontSize: 11.5, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  disabled: { opacity: DISABLED_OPACITY },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
})
