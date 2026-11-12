import { useEffect } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import EditorModal from '../../editor/components/controls/EditorModal'
import { PANEL_RADIUS } from '../../editor/components/ToolPanel'
import AppIcon from '../../shared/AppIcon'
import DioButton from '../../shared/DioButton'
import { colors, shadow } from '../../shared/theme'
import { skippedSummary } from '../services/guestDiaryImport.js'
import { useGuestDiaryImport } from '../hooks/useGuestDiaryImport'

// 로그인 직후 게스트 다이어리 옮기기: 묻기 → 진행 → 결과(빠진 항목 · 실패 다시 시도). 모양은 ConfirmDialog 카드와 같다.
// 진행 중에는 닫지 않는다(앱을 꺼도 다음 로그인 때 이어서 보낸다).
export default function GuestImportDialog({ model }) {
  const { phase, candidates, progress, imported, failed, slots, selected, pending, capacityError } = model
  if (!phase) return null
  const summary = skippedSummary(imported.flatMap(row => row.skipped.map(item => ({ kind: item.kind, count: item.count }))))
  // 손글씨 글꼴은 글자가 옮겨진다. 빠진 항목이 아니라 보이는 모양에 대한 알림이다.
  const skipped = summary.filter(row => row.kind !== 'personalFont'), fontNotice = summary.length > skipped.length
  const kept = imported.filter(row => !row.removeOriginal).length
  const percent = progress ? Math.floor(((progress.index + progress.done / Math.max(1, progress.total)) / Math.max(1, progress.count)) * 100) : 0
  const selectedCount = selected?.size ?? 0
  const selectedNewCount = selected ? [...selected].filter(id => !pending.has(id)).length : 0
  return (
    <EditorModal transparent animationType="none" onRequestClose={phase === 'running' ? () => {} : phase === 'ask' ? model.later : model.close}>
      <View style={styles.backdrop}>
        <View style={[styles.card, phase === 'ask' && styles.selectionCard]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {phase === 'ask' && <>
            <Text style={[styles.title, styles.selectionTitle]}>다이어리 옮기기</Text>
            <Text style={[styles.message, capacityError && styles.error]}>{capacityError || (slots == null
              ? '옮길 수 있는 개수를 확인하고 있어요.'
              : slots === 0
                ? '계정 보관함이 가득 찼어요. 자리를 비운 뒤 새 다이어리를 옮길 수 있어요.'
                : `이 기기에서 계정으로 최대 ${slots}권 더 옮길 수 있어요.`)}</Text>
            {slots != null && <ScrollView style={styles.choices} contentContainerStyle={styles.choiceList}>
              {candidates.map(diary => {
                const checked = selected.has(diary.id)
                const continuing = pending.has(diary.id)
                const disabled = !checked && !continuing && selectedNewCount >= slots
                return <Pressable key={diary.id} accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled }} disabled={disabled}
                  onPress={() => model.toggle(diary.id)} style={[styles.choice, checked && styles.choiceOn, disabled && styles.dim]}>
                  <View style={styles.choiceText}>
                    <Text style={styles.choiceTitle}>{diary.title || '제목 없음'}</Text>
                    {continuing && <Text style={styles.choiceDetail}>이어서 옮기기</Text>}
                  </View>
                  <View style={[styles.check, checked && styles.checkOn]}>
                    {checked && <AppIcon name="check" size={14} color={colors.surface} strokeWidth={2.8} />}
                  </View>
                </Pressable>
              })}
            </ScrollView>}
            {slots != null && <Text style={styles.message}>옮기기가 끝난 다이어리는 이 기기에서 지워져요.</Text>}
            <View style={styles.actions}>
              <DioButton variant="ghost" label="나중에" onPress={model.later} />
              {capacityError
                ? <DioButton variant="filled" label="다시 시도" onPress={model.retryCapacity} />
                : <DioButton variant="filled" label={selectedCount ? `${selectedCount}권 옮기기` : '옮기기'}
                  disabled={!selectedCount || slots == null} onPress={model.start} />}
            </View>
          </>}
          {phase === 'running' && progress && <>
            <Text style={styles.title}>{`옮기는 중 ${percent}%`}</Text>
            <Text style={styles.message} numberOfLines={1}>{`${progress.title} (${progress.index + 1}/${progress.count})`}</Text>
            <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
              <View style={[styles.bar, { width: `${percent}%` }]} />
            </View>
          </>}
          {phase === 'done' && <>
            <Text style={styles.title}>{failed.some(row => row.lookup) ? '옮기기 정보를 확인하지 못했어요' : failed.length ? `${failed.length}권을 옮기지 못했어요` : `${imported.length}권을 옮겼어요.`}</Text>
            {failed.length > 0 && imported.length > 0 && <Text style={styles.message}>{`${imported.length}권은 옮겼어요.`}</Text>}
            {failed.length > 0 && <Text style={[styles.message, styles.error]}>{failed[0].error?.message || '연결을 확인한 뒤 다시 시도해 주세요.'}</Text>}
            {skipped.length > 0 && <View style={styles.skipped}>
              <Text style={styles.label}>옮기지 못한 항목</Text>
              {skipped.map(row => <Text key={row.kind} style={styles.message}>{`· ${row.label}${row.count > 1 ? ` ${row.count}개` : ''}`}</Text>)}
            </View>}
            {kept > 0 && <Text style={styles.message}>{`${kept}권의 원본은 기기에 남겨 뒀어요.`}</Text>}
            {fontNotice && <Text style={styles.message}>내 손글씨 글꼴은 다른 기기에서 기본 글꼴로 보여요.</Text>}
            <View style={styles.actions}>
              {failed.length > 0
                ? <><ActionButton label="닫기" onPress={model.close} /><ActionButton filled label="다시 시도" onPress={model.retry} /></>
                : <ActionButton filled label="확인" onPress={model.close} />}
            </View>
          </>}
        </View>
      </View>
    </EditorModal>
  )
}

// 공용 ConfirmDialog 와 같은 버튼: 취소 · 닫기는 글자만, 확정은 primaryStrong 채움(지라 665). 눌림 효과 없음
function ActionButton({ label, filled = false, disabled = false, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
      disabled={disabled} onPress={onPress} style={[styles.button, filled && styles.primary, disabled && styles.dim]}>
      <Text maxFontSizeMultiplier={0} style={filled ? styles.confirmText : styles.cancelText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { minWidth: 76, minHeight: 48, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.primaryStrong },
  cancelText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  confirmText: { fontSize: 14, fontWeight: '700', color: colors.surface },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
  card: { width: 320, maxWidth: '100%', padding: 20, borderRadius: PANEL_RADIUS, backgroundColor: colors.surface, ...shadow.float },
  selectionCard: { width: 400 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  selectionTitle: { fontSize: 18 },
  message: { marginTop: 8, fontSize: 13, lineHeight: 19, color: colors.textMuted, ...(Platform.OS === 'web' && { wordBreak: 'keep-all' }) },
  error: { color: colors.dangerStrong },
  label: { marginTop: 12, fontSize: 13, fontWeight: '700', color: colors.text },
  skipped: { marginTop: 4 },
  choices: { maxHeight: 208, marginTop: 16 },
  choiceList: { gap: 8 },
  choice: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 12 },
  choiceOn: { borderColor: colors.primaryStrong, backgroundColor: colors.surfaceSoft },
  choiceText: { flex: 1 },
  choiceTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  choiceDetail: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  checkOn: { borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong },
  dim: { opacity: 0.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  track: { marginTop: 14, height: 6, borderRadius: 999, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 999, backgroundColor: colors.primary },
})

/** 회원 보관함에만 붙인다. enabled 가 참이 된 뒤(앱 잠금을 푼 뒤) 한 번 묻는다. */
export function GuestImportHost({ accountId, enabled, onImported, onEntry }) {
  const model = useGuestDiaryImport(accountId, { enabled, onImported })
  // 마이페이지 · 빈 내 다이어리의 옮기기 입구. 나중에로 미룬 뒤에도 여기서 다시 시작한다.
  const count = enabled ? model.waiting.length : 0
  useEffect(() => {
    onEntry?.(count ? { count, open: model.open } : null)
    return () => onEntry?.(null)
  }, [count, enabled])
  return <GuestImportDialog model={model} />
}
