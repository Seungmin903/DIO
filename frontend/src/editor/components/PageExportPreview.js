import { useEffect, useRef, useState } from 'react'
import { Image, Linking, Platform, StyleSheet, Text } from 'react-native'
import { colors } from '../../shared/theme'
import { usePageImageRenderer } from '../hooks/usePageImageRenderer'
import { savePngFile } from '../utils/savePngFile'
import { pngQualityWarning } from '../utils/pageImageQuality.js'
import { createSaveGate, pngSaveError } from '../utils/pngFileSave.js'
import ExportScreen, { ExportButton, InfoRow, Note, StageFill } from './ExportScreen'

/** 선택/격자/패널이 존재하지 않는 별도 렌더링 영역만 캡처한다. */
export default function PageExportPreview({ snapshot, onClose, onReselect }) {
  const [attempt, setAttempt] = useState(0)
  return <ExportAttempt key={attempt} snapshot={snapshot} onClose={onClose} onReselect={onReselect} onRetry={() => setAttempt((value) => value + 1)} />
}

function ExportAttempt({ snapshot, onClose, onRetry, onReselect }) {
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

  const busy = saveState.status === 'saving'
  const saveDone = ['saving', 'saved'].includes(saveState.status)
  const saveTitle = Platform.OS === 'web' ? 'PNG 파일 저장' : '사진첩에 저장'
  const saveLabel = saveState.status === 'saving' ? '저장 중…' : saveState.status === 'saved' ? '저장 완료' : saveState.status === 'error' || saveState.status === 'cancelled' ? '다시 저장' : saveState.status === 'download-started' ? '다시 다운로드' : saveTitle
  const quality = result && pngQualityWarning(result.diagnostics)
  return (
    <ExportScreen
      title={snapshot.region ? '선택 영역 PNG 내보내기' : 'PNG 내보내기'}
      onClose={close}
      closeLabel="PNG 내보내기 닫기"
      closeDisabled={busy}
      preview={error ? <Note tone="alert">{error}</Note>
        : result ? <StageFill><Image accessibilityLabel="완성 페이지 PNG" source={{ uri: result.uri }} style={styles.image} resizeMode="contain" /></StageFill>
          : <StageFill>{surface}<Text style={styles.making}>페이지를 이미지로 만들고 있어요…</Text></StageFill>}
    >
      {error ? <>
        <Note>파일은 저장되지 않았어요. 편집 내용은 그대로 유지돼요.</Note>
        {snapshot.errorMessage ? <Note>닫고 해당 요소를 확인한 뒤 다시 내보내 주세요.</Note> : <ExportButton primary title="PNG 다시 만들기" label="다시 만들기" onPress={onRetry} />}
      </> : <>
        {result && <InfoRow label="크기" value={`${result.width} × ${result.height}px · PNG`} />}
        <InfoRow label="파일 이름" value={snapshot.fileName} selectable />
        {snapshot.region && <InfoRow label="영역" value={`${snapshot.region.width.toFixed(0)} × ${snapshot.region.height.toFixed(0)} · ${snapshot.preset}`} />}
        {!!quality && <Note tone="alert">{quality}</Note>}
        <ExportButton primary title={saveTitle} label={saveLabel} disabled={!result || saveDone} onPress={save} />
        {!!saveState.message && <Note tone={saveState.status === 'error' ? 'alert' : undefined}>{saveState.message}</Note>}
        {saveState.needsSettings && <ExportButton title="사진첩 권한 설정 열기" label="설정 열기" onPress={() => Linking.openSettings().catch(() => setSaveState((previous) => ({ ...previous, message: '설정을 열지 못했어요. 기기 설정에서 DIO의 사진 추가 권한을 허용해 주세요.' })))} />}
        {snapshot.region && <ExportButton title="영역 다시 선택" disabled={busy} onPress={() => { if (!saving.current) onReselect?.() }} />}
      </>}
    </ExportScreen>
  )
}

const styles = StyleSheet.create({
  image: { flex: 1, width: '100%' },
  making: { position: 'absolute', alignSelf: 'center', top: '45%', fontSize: 13, fontWeight: '700', color: colors.textMuted },
})
