import { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { colors } from '../../shared/theme'
import { usePageImageRenderer } from '../hooks/usePageImageRenderer'
import { savePdfFile } from '../utils/savePdfFile'
import { createSaveGate } from '../utils/pngFileSave.js'
import { pdfSaveMessage, pdfSaveError } from '../utils/pdfFileSave.js'
import { generatePdf } from '../utils/pdfExport'
import ExportScreen, { ExportButton, InfoRow, Note, StageFill } from './ExportScreen'

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
            if (alive && (image.diagnostics?.upscaled || image.diagnostics?.rasterWarnings?.length)) setQualityPages(old => [...new Set([...old, page.documentPageNumber])])
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
  const ratio = progress.ratio ?? 0
  return <ExportScreen title="PDF 만드는 중" onClose={cancel} closeLabel="PDF 만들기 닫기" closeDisabled={cancelled} preview={<StageFill>{surface}</StageFill>}>
    <Note>{progress.completedPages} / {progress.totalPages}페이지 {progress.phase === 'assembling' ? '조립 중…' : '만드는 중…'}</Note>
    <View style={styles.track}><View style={[styles.bar, { width: `${Math.round(ratio * 100)}%` }]} /></View>
    {!!qualityPages.length && <Note>확대 출력으로 사진이나 글씨가 흐릴 수 있어요. 미리보기를 확인한 뒤 저장해 주세요.</Note>}
    <Note>선택한 페이지를 순서대로 만들고 있어요. 편집 내용은 변경되지 않아요.</Note>
    <ExportButton title="PDF 생성 취소" label={cancelled ? '취소 중…' : '만들기 취소'} disabled={cancelled} onPress={cancel} />
  </ExportScreen>
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
  const paper = result.paperOrientation === 'portrait' ? 'A4 세로' : result.paperOrientation === 'mixed' ? 'A4 가로·세로 혼합' : 'A4 가로'
  return <ExportScreen title="PDF 내보내기" onClose={close} closeLabel="PDF 결과 닫기" closeDisabled={saveState.status === 'saving'}
    preview={Platform.OS === 'web'
      ? <StageFill><iframe title="생성된 PDF 미리보기" src={result.uri} style={{ flex: 1, width: '100%', minHeight: 200, border: 0, borderRadius: 12, background: '#FFFFFF' }} /></StageFill>
      : <Note>이미지로 만든 PDF예요. 오른쪽 저장·공유 버튼에서 파일 앱이나 다른 앱을 골라 주세요.</Note>}>
    <InfoRow label="파일 이름" value={result.fileName} selectable />
    <InfoRow label="정보" value={`${result.pageCount}페이지 · ${paper} · ${(result.byteLength / 1024).toFixed(1)}KB`} />
    {result.captureDiagnostics?.some(item => item.upscaled || item.rasterWarnings?.length) && <Note tone="alert">확대 출력으로 사진이나 글씨가 흐릴 수 있어요. 미리보기를 확인한 뒤 저장해 주세요.</Note>}
    <ExportButton primary title={Platform.OS === 'web' ? 'PDF 파일 저장' : 'PDF 파일 저장·공유'} disabled={['saving', 'saved'].includes(saveState.status)} onPress={save} />
    {!!saveState.message && <Note tone={saveState.status === 'error' ? 'alert' : undefined}>{saveState.message}</Note>}
    {['error', 'cancelled'].includes(saveState.status) && <Note>PDF를 다시 만들지 않고 같은 파일로 다시 저장할 수 있어요.</Note>}
    <ExportButton title="페이지 다시 선택" onPress={selectAgain} disabled={saveState.status === 'saving'} />
  </ExportScreen>
}
const styles = StyleSheet.create({
  // 진행 막대
  track: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#EEF2F9' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
})
