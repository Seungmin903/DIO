import { useMemo, useState, useSyncExternalStore } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { mediaRegistry, mediaService } from '../services/mediaStore'
import { collectMediaIds } from '../utils/mediaReferences.js'
import { mediaFailureMessage } from '../utils/mediaRecovery.js'
import { colors } from '../../shared/theme'

/** 요소와 원본을 지우지 않고 복원/가져오기 실패를 안내한다. */
export default function MediaNotice({ references, importFailure, onDismissImport }) {
  const errors = useSyncExternalStore(mediaRegistry.subscribe, mediaRegistry.getErrorSnapshot, mediaRegistry.getErrorSnapshot)
  const [busy, setBusy] = useState(false)
  const ids = useMemo(() => new Set(collectMediaIds(references)), [references])
  const failures = useMemo(() => errors.filter(({ id }) => ids.has(id)), [errors, ids])
  const failureMessages = [...new Set(failures.map(({ error }) => mediaFailureMessage(error)))].join(' ')
  if (!importFailure && !failures.length) return null
  const retry = async () => {
    if (busy) return
    if (importFailure) { onDismissImport(); importFailure.retry(); return }
    setBusy(true)
    try { await Promise.allSettled(failures.map(({ id }) => mediaService.resolveDisplay(id))) }
    finally { setBusy(false) }
  }
  return (
    <View style={styles.notice} accessibilityRole="alert">
      <Text style={styles.text}>{importFailure?.message ?? `${failures.length}개 이미지: ${failureMessages}`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={importFailure ? '이미지 다시 선택' : '이미지 다시 조회'} disabled={busy} onPress={retry} style={styles.button}>
        <Text>{busy ? '조회 중…' : importFailure ? '다시 선택' : '다시 조회'}</Text>
      </Pressable>
      {importFailure && <Pressable accessibilityRole="button" accessibilityLabel="가져오기 오류 닫기" onPress={onDismissImport} style={styles.button}><Text>닫기</Text></Pressable>}
    </View>
  )
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.surfaceSoft, borderColor: colors.primary, borderWidth: 1, borderRadius: 12, marginHorizontal: 16, marginTop: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, color: colors.text, fontSize: 13 },
  button: { backgroundColor: colors.surface, padding: 10, borderRadius: 8 },
})
