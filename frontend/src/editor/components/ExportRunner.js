import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '../../shared/theme'
import PageImageSurface from './PageImageSurface'
import { usePageImageRenderer } from '../hooks/usePageImageRenderer'
import { savePngFile } from '../utils/savePngFile'
import { savePdfFile } from '../utils/savePdfFile'
import { saveGifFile } from '../utils/gifFileIO'
import { generatePdf } from '../utils/pdfExport'
import { createPageGif } from '../utils/createPageGif'
import { pngSaveError } from '../utils/pngFileSave.js'
import { pdfSaveError, pdfSaveMessage } from '../utils/pdfFileSave.js'

const savedMessage = (outcome, what) => outcome.destination === 'photos' ? `${what}를 사진첩에 저장했어요.`
  : outcome.status === 'download-started' ? `${what} 다운로드를 시작했어요.` : `${what}를 저장했어요.`

/**
 * 내보내기를 화면 없이 만든다. 찍을 페이지는 편집 화면 뒤(같은 바탕색으로 가린 곳)에 그려 캡처하고,
 * 다 만들면 바로 저장(웹은 다운로드, 기기는 사진첩·저장 창)한다. 진행은 onProgress, 끝나면 onFinish({ message } | { error }).
 * job: { kind: 'png' | 'gif', snapshot } 또는 { kind: 'pdf', snapshots }. job 이 바뀌거나 사라지면 진행 중인 작업을 멈춘다.
 */
export default function ExportRunner({ job, onProgress, onFinish }) {
  const { renderPageImage, surface } = usePageImageRenderer()
  const [frameJob, setFrameJob] = useState(null)
  const nextId = useRef(0), alive = useRef(true)
  const callbacks = useRef({ onProgress, onFinish })
  callbacks.current = { onProgress, onFinish }

  // GIF 장면 하나를 그려 찍는다 (준비가 끝난 snapshot 을 그대로 쓴다)
  const renderFrame = useCallback((frame, { signal }) => new Promise((resolve, reject) => {
    const id = ++nextId.current
    const done = (fn) => (value) => { if (alive.current) setFrameJob((current) => current?.id === id ? null : current); fn(value) }
    setFrameJob({ id, snapshot: frame, signal, resolve: done(resolve), reject: done(reject), onCaptureStart() {} })
  }), [])

  useEffect(() => {
    alive.current = true
    if (!job) return undefined
    const controller = new AbortController(), { signal } = controller
    const progress = (ratio) => { if (!signal.aborted) callbacks.current.onProgress?.(Math.max(0, Math.min(1, ratio))) }
    const owned = []
    const run = async () => {
      if (job.kind === 'png') {
        progress(0)
        const output = await renderPageImage(job.snapshot, { signal })
        owned.push(output)
        try { return savedMessage(await savePngFile(output, job.snapshot.fileName, { picker: false }), 'PNG') }
        catch (error) { throw new Error(pngSaveError(error)) }
      }
      if (job.kind === 'gif') {
        const weights = { decode: [0, 0.05], capture: [0.05, 0.8], encode: [0.85, 0.15] }
        const output = await createPageGif(job.snapshot, { renderFrame, signal, onProgress: ({ phase, done, total }) => progress(weights[phase][0] + weights[phase][1] * (total ? done / total : 0)) })
        owned.push(output)
        try { return savedMessage(await saveGifFile(output, job.snapshot.fileName, { picker: false }), 'GIF') }
        catch (error) { throw new Error(pngSaveError(error)) }
      }
      // PDF: 페이지가 많으면 여러 파일을 차례로 만든 뒤 차례로 저장한다
      const total = job.snapshots.reduce((sum, s) => sum + s.pages.length, 0)
      let before = 0
      const outputs = []
      for (const snapshot of job.snapshots) {
        const output = await generatePdf(snapshot, { signal, renderPageImage, onProgress: ({ completedPages }) => progress((before + completedPages) / total) })
        owned.push(output); outputs.push(output)
        before += snapshot.pages.length
      }
      let outcome
      for (const output of outputs) {
        try { outcome = await savePdfFile(output, { picker: false }) } catch (error) { throw new Error(pdfSaveError(error)) }
        if (outcome.status === 'cancelled') return pdfSaveMessage(outcome)
      }
      return outputs.length > 1 ? `PDF ${outputs.length}개 · ${pdfSaveMessage(outcome)}` : pdfSaveMessage(outcome)
    }
    run().then((message) => { if (!signal.aborted) callbacks.current.onFinish({ message }) })
      .catch((error) => { if (!signal.aborted) callbacks.current.onFinish({ error: error?.message || '내보내지 못했어요. 다시 시도해 주세요.' }) })
      .finally(() => owned.forEach((output) => { try { output.dispose() } catch {} }))
    return () => { alive.current = false; controller.abort() }
  }, [job, renderPageImage, renderFrame])

  if (!job) return null
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {surface}
    {frameJob && <PageImageSurface key={frameJob.id} job={frameJob} />}
    {/* 찍는 페이지가 비쳐 보이지 않게 편집 화면 바탕색으로 덮는다 (캡처는 페이지 영역만 찍어서 영향이 없다) */}
    <View style={[StyleSheet.absoluteFill, styles.cover]} />
  </View>
}

const styles = StyleSheet.create({
  cover: { backgroundColor: colors.surfaceSoft },
})
