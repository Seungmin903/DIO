import { useEffect, useRef, useState } from 'react'
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import { usePageImageRenderer } from '../hooks/usePageImageRenderer'
import { savePdfFile } from '../utils/savePdfFile'
import { createSaveGate } from '../utils/pngFileSave.js'
import { pdfSaveMessage, pdfSaveError } from '../utils/pdfFileSave.js'
import { generatePdf } from '../utils/pdfExport'
function Action({
  title,
  onPress,
  disabled
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{
    disabled: !!disabled
  }} disabled={disabled} onPress={onPress} style={styles.button}><Text style={styles.text}>{title}</Text></Pressable>
}

/** 매 시도마다 새 작업기를 마운트한다. 이전 시도의 늦은 결과는 현재 화면에 게시하지 않는다. */
export default function PdfGeneration({
  snapshot,
  onComplete,
  onFailure
}) {
  const {
    renderPageImage,
    surface
  } = usePageImageRenderer()
  const [progress, setProgress] = useState({
    completedPages: 0,
    totalPages: snapshot.pages.length
  })
  const [cancelled, setCancelled] = useState(false),
    [qualityPages, setQualityPages] = useState([])
  const diagnostics = useRef([])
  const controller = useRef(null),
    callbacks = useRef({
      onComplete,
      onFailure
    })
  callbacks.current = {
    onComplete,
    onFailure
  }
  useEffect(() => {
    const abort = new AbortController()
    controller.current = abort
    let alive = true
    diagnostics.current = []
    // StrictMode의 초기 effect 재실행이 취소된 첫 작업을 시작하지 않도록 한 tick 양보한다.
    Promise.resolve().then(async () => {
      if (!alive || abort.signal.aborted) return
      try {
        const output = await generatePdf(snapshot, {
          signal: abort.signal,
          renderPageImage: async (page, options) => {
            const image = await renderPageImage(page, options)
            if (image.diagnostics) diagnostics.current.push({
              documentPageNumber: page.documentPageNumber,
              ...image.diagnostics
            })
            if (alive && image.diagnostics?.upscaled) setQualityPages(old => [...new Set([...old, page.documentPageNumber])])
            return image
          },
          onProgress: next => {
            if (alive && !abort.signal.aborted) setProgress(next)
          }
        })
        if (!alive || abort.signal.aborted) {
          output.dispose()
          return
        }
        callbacks.current.onComplete({
          ...output,
          captureDiagnostics: [...diagnostics.current]
        })
      } catch (error) {
        if (alive) callbacks.current.onFailure(error)
      }
    })
    return () => {
      alive = false
      abort.abort()
    }
  }, [snapshot, renderPageImage])
  const cancel = () => {
    setCancelled(true)
    controller.current?.abort()
  }
  return <Modal visible animationType="fade" onRequestClose={cancel}>
    <View style={styles.root}>
      <View style={styles.row}><Text accessibilityRole="header" style={styles.title}>PDF 생성 중</Text><Action title={cancelled ? '취소 중…' : 'PDF 생성 취소'} disabled={cancelled} onPress={cancel} /></View>
      <Text accessibilityLiveRegion="polite" style={styles.message}>{progress.completedPages} / {progress.totalPages}페이지 {progress.phase === 'assembling' ? '조립 중…' : '생성 중…'}</Text>
      {!!qualityPages.length && <Text accessibilityLiveRegion="polite" style={styles.message}>확대 출력으로 사진이나 글씨가 흐릴 수 있어요. 미리보기를 확인한 뒤 저장해 주세요.</Text>}
      <View style={styles.surface}>{surface}</View>
      <Text style={styles.message}>선택한 페이지를 순서대로 만들고 있어요. 편집 내용은 변경되지 않아요.</Text>
    </View>
  </Modal>
}
export function PdfGeneratedPreview({
  result,
  onClose,
  onSelectAgain
}) {
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' })
  const saving = useRef(false), gate = useRef(createSaveGate()), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const close = () => { if (!saving.current) onClose() }
  const selectAgain = () => { if (!saving.current) onSelectAgain() }
  const save = () => gate.current(async () => {
    if (saveState.status === 'saved') return
    saving.current = true
    setSaveState({ status: 'saving', message: Platform.OS === 'web' ? 'PDF를 저장하고 있어요…' : 'PDF 공유 창을 열고 있어요…' })
    try {
      const outcome = await savePdfFile(result)
      if (alive.current) setSaveState({ ...outcome, message: pdfSaveMessage(outcome) })
    } catch (error) { if (alive.current) setSaveState({ status: 'error', message: pdfSaveError(error) }) }
    finally { saving.current = false }
  })
  return <Modal visible animationType="fade" onRequestClose={close}><View style={styles.root}>
    <View style={styles.row}><Text accessibilityRole="header" style={styles.title}>PDF 생성 완료</Text><Action title="PDF 결과 닫기" onPress={close} disabled={saveState.status === 'saving'} /></View>
    <Text selectable testID="pdf-result-name" style={styles.message}>{result.fileName}</Text>
    <Text style={styles.message}>{result.pageCount}페이지 · A4 가로 · {(result.byteLength / 1024).toFixed(1)}KB · PDF</Text>
    {result.captureDiagnostics?.some(item => item.upscaled) && <Text style={styles.message}>확대 출력으로 사진이나 글씨가 흐릴 수 있어요. 미리보기를 확인한 뒤 저장해 주세요.</Text>}
    <Action title={Platform.OS === 'web' ? 'PDF 파일 저장' : 'PDF 파일 저장·공유'} disabled={['saving', 'saved'].includes(saveState.status)} onPress={save} />
    {!!saveState.message && <Text accessibilityRole={saveState.status === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={styles.message}>{saveState.message}</Text>}
    {['error', 'cancelled'].includes(saveState.status) && <Text style={styles.message}>PDF를 다시 만들지 않고 같은 파일로 다시 저장할 수 있어요.</Text>}
    {Platform.OS === 'web' ? <iframe title="생성된 PDF 미리보기" src={result.uri} style={{
        flex: 1,
        width: '100%',
        minHeight: 200,
        border: 0
      }} /> : <ScrollView><Text style={styles.message}>이미지 기반 PDF입니다. 위의 PDF 파일 저장·공유 버튼에서 파일 앱이나 다른 앱을 선택해 주세요.</Text></ScrollView>}
    <Action title="페이지 다시 선택" onPress={selectAgain} disabled={saveState.status === 'saving'} />
  </View></Modal>
}
const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.surface
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text
  },
  message: {
    color: colors.textMuted,
    paddingVertical: 8,
    lineHeight: 21
  },
  text: {
    color: colors.text
  },
  button: {
    minHeight: 44,
    padding: 12,
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 12
  },
  surface: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSoft
  }
})
