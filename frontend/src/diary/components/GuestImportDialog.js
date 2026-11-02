import { Platform, StyleSheet, Text, View } from 'react-native'
import EditorModal from '../../editor/components/controls/EditorModal'
import { PANEL_RADIUS } from '../../editor/components/ToolPanel'
import DioButton from '../../shared/DioButton'
import { colors, shadow } from '../../shared/theme'
import { skippedSummary } from '../services/guestDiaryImport.js'
import { useGuestDiaryImport } from '../hooks/useGuestDiaryImport'

// 로그인 직후 게스트 다이어리 가져오기: 묻기 → 진행 → 결과(빠진 항목 · 실패 다시 시도). 모양은 ConfirmDialog 카드와 같다.
// 진행 중에는 닫지 않는다(앱을 꺼도 다음 로그인 때 이어서 보낸다).
export default function GuestImportDialog({ model }) {
  const { phase, candidates, progress, imported, failed } = model
  if (!phase) return null
  const skipped = skippedSummary(imported.flatMap(row => row.skipped.map(item => ({ kind: item.kind, count: item.count }))))
  const percent = progress ? Math.floor(((progress.index + progress.done / Math.max(1, progress.total)) / Math.max(1, progress.count)) * 100) : 0
  return (
    <EditorModal transparent animationType="none" onRequestClose={phase === 'running' ? () => {} : phase === 'ask' ? model.later : model.close}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {phase === 'ask' && <>
            <Text style={styles.title}>이 기기의 다이어리를 가져올까요?</Text>
            <Text style={styles.message}>{`다이어리 ${candidates.length}권 · 기기에도 그대로 남아요`}</Text>
            <View style={styles.actions}>
              <DioButton variant="ghost" label="가져오지 않기" onPress={model.decline} />
              <DioButton variant="tonal" label="나중에" onPress={model.later} />
              <DioButton variant="filled" label="가져오기" onPress={model.start} />
            </View>
          </>}
          {phase === 'running' && progress && <>
            <Text style={styles.title}>{`가져오는 중 ${percent}%`}</Text>
            <Text style={styles.message} numberOfLines={1}>{`${progress.title} (${progress.index + 1}/${progress.count})`}</Text>
            <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
              <View style={[styles.bar, { width: `${percent}%` }]} />
            </View>
          </>}
          {phase === 'done' && <>
            <Text style={styles.title}>{failed.length ? `${failed.length}권을 가져오지 못했어요` : `${imported.length}권을 가져왔어요.`}</Text>
            {failed.length > 0 && imported.length > 0 && <Text style={styles.message}>{`${imported.length}권은 가져왔어요.`}</Text>}
            {failed.length > 0 && <Text style={[styles.message, styles.error]}>{failed[0].error?.message || '연결을 확인한 뒤 다시 시도해 주세요.'}</Text>}
            {skipped.length > 0 && <View style={styles.skipped}>
              <Text style={styles.label}>옮기지 못한 항목</Text>
              {skipped.map(row => <Text key={row.kind} style={styles.message}>{`· ${row.label}${row.count > 1 ? ` ${row.count}개` : ''}`}</Text>)}
            </View>}
            <View style={styles.actions}>
              <DioButton variant={failed.length ? 'ghost' : 'filled'} label="닫기" onPress={model.close} />
              {failed.length > 0 && <DioButton variant="filled" label="다시 시도" onPress={model.retry} />}
            </View>
          </>}
        </View>
      </View>
    </EditorModal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.scrim },
  card: { width: 360, maxWidth: '100%', padding: 20, borderRadius: PANEL_RADIUS, backgroundColor: colors.surface, ...shadow.float },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  message: { marginTop: 8, fontSize: 13, lineHeight: 19, color: colors.textMuted, ...(Platform.OS === 'web' && { wordBreak: 'keep-all' }) },
  error: { color: colors.dangerStrong },
  label: { marginTop: 12, fontSize: 13, fontWeight: '700', color: colors.text },
  skipped: { marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  track: { marginTop: 14, height: 6, borderRadius: 999, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 999, backgroundColor: colors.primary },
})

/** 회원 보관함에만 붙인다. enabled 가 참이 된 뒤(앱 잠금을 푼 뒤) 한 번 묻는다. */
export function GuestImportHost({ accountId, enabled, onImported }) {
  const model = useGuestDiaryImport(accountId, { enabled, onImported })
  return <GuestImportDialog model={model} />
}
