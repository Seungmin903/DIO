import { useState, useSyncExternalStore } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { mediaRegistry, mediaService } from '../utils/mediaStore'
import { collectMediaIds } from '../utils/mediaReferences.js'
import { mediaFailureMessage } from '../utils/mediaRecovery.js'

/** 요소와 원본을 지우지 않고 복원/가져오기 실패를 안내한다. */
export default function MediaNotice({ references, importFailure, onDismissImport }) {
  useSyncExternalStore(mediaRegistry.subscribe, mediaRegistry.getRevision, mediaRegistry.getRevision)
  const [busy, setBusy] = useState(false)
  const ids = new Set(collectMediaIds(references))
  const failures = mediaRegistry.failures().filter(({ id }) => ids.has(id))
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
  notice: { position: 'absolute', top: 88, left: 16, right: 16, backgroundColor: '#FFF1C2', borderColor: '#D9B98F', borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 80 },
  text: { flex: 1, color: '#0B1957', fontSize: 13 },
  button: { backgroundColor: '#FFFFFF', padding: 10, borderRadius: 8 },
})
