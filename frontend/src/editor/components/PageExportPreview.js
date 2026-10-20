import { useEffect, useRef, useState } from 'react'
import { Image, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import { usePageImageRenderer } from '../hooks/usePageImageRenderer'
import { savePngFile } from '../utils/savePngFile'
import { createSaveGate, pngSaveError } from '../utils/pngFileSave.js'

/** 선택/격자/패널이 존재하지 않는 별도 렌더링 영역만 캡처한다. */
export default function PageExportPreview({ snapshot, onClose }) {
  const [attempt, setAttempt] = useState(0)
  return <ExportAttempt key={attempt} snapshot={snapshot} onClose={onClose} onRetry={() => setAttempt((value) => value + 1)} />
}

function ExportAttempt({ snapshot, onClose, onRetry }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(snapshot.errorMessage || null)
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' })
  const saving = useRef(false)
  const saveGate = useRef(createSaveGate())
  const { renderPageImage, surface } = usePageImageRenderer()
  const alive = useRef(true), resultRef = useRef(null)

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    if (!snapshot.errorMessage) renderPageImage(snapshot, { signal: controller.signal }).then((output) => {
      if (controller.signal.aborted) { output.dispose(); return }
      resultRef.current = output
      setResult(output)
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message || 'PNG를 만들지 못했어요.')
    })
    return () => {
      alive.current = false
      controller.abort()
      resultRef.current?.dispose()
    }
  }, [snapshot, renderPageImage])

  const close = () => { if (!saving.current) onClose() }
  const save = () => saveGate.current(async () => {
    if (!result || error || saveState.status === 'saved') return
    saving.current = true
    setSaveState({ status: 'saving', message: Platform.OS === 'web' ? '저장 위치를 선택하고 PNG를 저장하고 있어요…' : '사진첩에 PNG를 저장하고 있어요…' })
    try {
      const outcome = await savePngFile(result, snapshot.fileName)
      if (!alive.current) return
      const message = outcome.status === 'saved' ? outcome.destination === 'photos' ? '사진첩에 저장했어요. 사진 앱에서 확인해 주세요.' : `${outcome.fileName} 저장을 완료했어요.`
        : outcome.status === 'cancelled' ? '저장을 취소했어요. 다시 저장할 수 있어요.'
          : '다운로드를 시작했어요. 브라우저 다운로드 목록에서 저장 결과를 확인해 주세요.'
      setSaveState({ ...outcome, message })
    } catch (failure) {
      if (alive.current) setSaveState({ status: 'error', message: pngSaveError(failure), needsSettings: failure.code === 'PHOTO_PERMISSION_BLOCKED' })
    } finally { saving.current = false }
  })

  return (
    <Modal visible animationType="fade" onRequestClose={close}>
      <View style={styles.root}>
        <View style={styles.heading}>
          <Text style={styles.title}>PNG 내보내기</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="PNG 내보내기 닫기" onPress={close} disabled={saveState.status === 'saving'} accessibilityState={{ disabled: saveState.status === 'saving' }} style={styles.button}><Text>닫기</Text></Pressable>
        </View>
        {error ? <View>
          <Text accessibilityRole="alert" style={styles.message}>{error}</Text>
          <Text style={styles.message}>파일은 저장되지 않았어요. 편집 내용은 그대로 유지돼요.</Text>
          {snapshot.errorMessage ? <Text style={styles.message}>닫고 해당 요소를 확인한 뒤 다시 내보내 주세요.</Text> : <Pressable accessibilityRole="button" accessibilityLabel="PNG 다시 만들기" onPress={onRetry} style={styles.button}><Text>다시 만들기</Text></Pressable>}
        </View> : result ? (
          <View style={styles.preview}>
            <Text style={styles.message}>{result.width} × {result.height} · PNG</Text>
            <Text style={styles.filename} numberOfLines={2}>{snapshot.fileName}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={Platform.OS === 'web' ? 'PNG 파일 저장' : '사진첩에 저장'} accessibilityState={{ disabled: ['saving', 'saved'].includes(saveState.status), busy: saveState.status === 'saving' }} disabled={['saving', 'saved'].includes(saveState.status)} onPress={save} style={[styles.button, styles.saveButton, ['saving', 'saved'].includes(saveState.status) && styles.disabled]}>
              <Text style={styles.saveLabel}>{saveState.status === 'saving' ? '저장 중…' : saveState.status === 'saved' ? '저장 완료' : saveState.status === 'error' || saveState.status === 'cancelled' ? '다시 저장' : saveState.status === 'download-started' ? '다시 다운로드' : Platform.OS === 'web' ? 'PNG 파일 저장' : '사진첩에 저장'}</Text>
            </Pressable>
            {!!saveState.message && <Text accessibilityRole={saveState.status === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={styles.message}>{saveState.message}</Text>}
            {saveState.needsSettings && <Pressable accessibilityRole="button" accessibilityLabel="사진첩 권한 설정 열기" onPress={() => Linking.openSettings().catch(() => setSaveState((previous) => ({ ...previous, message: '설정을 열지 못했어요. 기기 설정에서 DIO의 사진 추가 권한을 허용해 주세요.' })))} style={styles.button}><Text>설정 열기</Text></Pressable>}
            <Image accessibilityLabel="완성 페이지 PNG" source={{ uri: result.uri }} style={styles.image} resizeMode="contain" />
          </View>
        ) : (
          <>
            <Text style={styles.message}>페이지를 이미지로 만들고 있어요…</Text>
            {surface}
          </>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSoft, padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  button: { padding: 12, backgroundColor: colors.surface, borderRadius: 12 },
  message: { padding: 12, color: colors.text },
  preview: { flex: 1 },
  filename: { paddingHorizontal: 12, color: colors.textMuted, fontSize: 12 },
  saveButton: { alignSelf: 'flex-start', margin: 12, backgroundColor: colors.primary },
  saveLabel: { color: colors.surface, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  image: { flex: 1, width: '100%' },
})
