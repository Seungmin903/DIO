import * as PDFLib from 'pdf-lib/dist/pdf-lib.js'
import { A4_LANDSCAPE, A4_PORTRAIT, PDF_LIMITS, pdfError } from './pdfSnapshot.js'
import { opaquePdfPng } from './pdfRaster.js'

// 배포 UMD 진입점은 Metro의 tslib 1.x import 조건 충돌을 피한다.
const { PDFDocument, rgb } = PDFLib

/** 렌더러·플랫폼 IO는 주입한다. UI/저장 대화상자 없이 PDF 한 파일을 생성한다. */
export async function generatePdf(snapshot, { renderPageImage, readImage, createResult, signal, onProgress = () => {}, timeoutMs = PDF_LIMITS.timeoutMs } = {}) {
  if (typeof renderPageImage !== 'function' || typeof readImage !== 'function' || typeof createResult !== 'function') throw pdfError('EXPORT_PDF_INPUT_INVALID', 'PDF 생성 연결을 확인해 주세요.')
  // 외부에서 보관 중인 스냅샷도 생성 도중 변경되지 않게 고정한다.
  if (!snapshot || typeof snapshot !== 'object') throw pdfError('EXPORT_PDF_INPUT_INVALID', 'PDF 정보를 확인해 주세요.')
  const input = JSON.parse(JSON.stringify(snapshot))
  if (!input?.pages?.length || input.pages.length > PDF_LIMITS.pages) throw pdfError('EXPORT_PDF_LIMIT_EXCEEDED', 'PDF는 1~20페이지를 선택해 주세요.')
  if (!Number.isFinite(Date.parse(input.createdAt)) || !input.fileName?.endsWith('.pdf')) throw pdfError('EXPORT_PDF_INPUT_INVALID', 'PDF 정보를 확인해 주세요.')
  let pixels = 0
  for (const page of input.pages) {
    if (![page.width, page.height].every((n) => Number.isFinite(n) && n > 0) || ![page.pixelWidth, page.pixelHeight].every((n) => Number.isInteger(n) && n > 0 && n <= 4096) || page.pixelWidth * page.pixelHeight > 8000000 || !Number.isInteger(page.documentPageNumber) || page.documentPageNumber < 1) throw pdfError('EXPORT_PDF_INPUT_INVALID', 'PDF 페이지 규격을 확인해 주세요.')
    pixels += page.pixelWidth * page.pixelHeight
  }
  if (pixels > PDF_LIMITS.pixels) throw pdfError('EXPORT_PDF_LIMIT_EXCEEDED', '합계 출력 픽셀이 8,000만을 초과해요.')
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw pdfError('EXPORT_PDF_INPUT_INVALID', 'PDF 시간 제한을 확인해 주세요.')
  const startedAt = Date.now()
  const controller = new AbortController()
  const cancel = () => controller.abort(pdfError('EXPORT_CANCELLED', 'PDF 생성을 취소했어요.'))
  const check = () => {
    if (!controller.signal.aborted && Date.now() - startedAt >= timeoutMs) controller.abort(pdfError('EXPORT_PDF_TIMEOUT', 'PDF 생성 시간이 초과됐어요.'))
    if (controller.signal.aborted) throw controller.signal.reason
  }
  const stopped = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }))
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  const timer = setTimeout(() => controller.abort(pdfError('EXPORT_PDF_TIMEOUT', 'PDF 생성 시간이 초과됐어요.')), timeoutMs)
  const work = (async () => {
    let doc, documentPageNumber, phase = 'preparing'
    try {
      check()
      doc = await PDFDocument.create()
      doc.setTitle(input.title || '다이어리'); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([])
      doc.setCreator('DIO'); doc.setProducer('DIO')
      doc.setCreationDate(new Date(input.createdAt)); doc.setModificationDate(new Date(input.createdAt))
      let totalBytes = 0
      for (let index = 0; index < input.pages.length; index++) {
        const page = input.pages[index]
        documentPageNumber = page.documentPageNumber
        let imageResult
        try {
          // 면마다 이벤트 루프에 양보해 진행률 표시와 취소 입력이 반영되게 한다.
          await new Promise((resolve) => setTimeout(resolve, 0))
          check(); phase = 'rendering'
          onProgress({ phase, completedPages: index, totalPages: input.pages.length, documentPageNumber })
          imageResult = await renderPageImage(page, { signal: controller.signal }); check()
          phase = 'assembling'
          const bytes = await readImage(imageResult); check()
          const png = opaquePdfPng(bytes, page); check()
          totalBytes += png.byteLength
          if (totalBytes > PDF_LIMITS.bytes) throw pdfError('EXPORT_PDF_LIMIT_EXCEEDED', 'PDF 이미지 합계 용량이 50MiB를 초과해요.')
          const image = await doc.embedPng(png); check()
          // PNG 디코딩 데이터를 누적 보관하지 않고 면마다 압축 스트림으로 변환한다.
          await image.embed(); check()
          const [pw, ph] = page.height > page.width ? A4_PORTRAIT : A4_LANDSCAPE
          const pdfPage = doc.addPage([pw, ph])
          const bg = /^#[0-9a-f]{6}$/i.test(page.background) ? [1,3,5].map((i) => parseInt(page.background.slice(i, i + 2), 16) / 255) : [1,1,1]
          pdfPage.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: rgb(...bg) })
          const scale = Math.min(pw / page.width, ph / page.height)
          const width = page.width * scale, height = page.height * scale
          pdfPage.drawImage(image, { x: (pw - width) / 2, y: (ph - height) / 2, width, height })
          onProgress({ phase, completedPages: index + 1, totalPages: input.pages.length, documentPageNumber })
        } finally { imageResult?.dispose() }
      }
      documentPageNumber = undefined
      check(); phase = 'serializing'
      onProgress({ phase: 'assembling', completedPages: input.pages.length, totalPages: input.pages.length })
      const bytes = await doc.save(); check()
      if (bytes.byteLength > PDF_LIMITS.bytes) throw pdfError('EXPORT_PDF_LIMIT_EXCEEDED', '최종 PDF가 50MiB를 초과해요.')
      phase = 'result'
      const output = await createResult(bytes, { pageCount: input.pages.length, fileName: input.fileName });
      if (controller.signal.aborted) { output.dispose(); check() }
      let disposed = false
      const orientations = new Set(input.pages.map(page => page.height > page.width ? 'portrait' : 'landscape'))
      const paperOrientation = orientations.size > 1 ? 'mixed' : [...orientations][0]
      return { ...output, paperOrientation, byteLength: bytes.byteLength, pageCount: input.pages.length, fileName: input.fileName, mimeType: 'application/pdf', dispose() { if (!disposed) { disposed = true; output.dispose() } } }
    } catch (cause) {
      const error = cause?.code ? cause : pdfError('EXPORT_PDF_ASSEMBLY_FAILED', 'PDF를 만들지 못했어요.', { cause })
      throw Object.assign(error, { phase, documentPageNumber })
    } finally { doc = null }
  })()
  try { return await Promise.race([work, stopped]) }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
}
