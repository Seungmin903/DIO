import * as Picker from 'expo-document-picker'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { File } from 'expo-file-system'
import { importMedia, discardGeneratedMedia } from '../../editor/services/mediaStore'
import { MediaError } from '../../editor/utils/mediaPolicy.js'
import { PDF_PAGE_LIMIT, PDF_RENDER_EDGE, PdfImportError } from './pdfImport.js'
import { createId } from '../../editor/utils/common.js'
import { removePdfSource, savePdfSource } from './pdfSourceStore.native.js'
import { registerPdfImport } from './pdfImportRegistry'
import { renderPdfPageBitmap } from './pdfPageRaster.native.js'

// 쪽 그리기는 modules/dio-pdf-render (Android PdfRenderer · iOS PDFKit). 개발 빌드가 아니면(Expo Go) 연결되어 있지 않다.
let native = null
try { native = requireOptionalNativeModule('DioPdfRender') } catch { /* Expo Go 도 켜지게 둔다. */ }

const failure = error => {
  const message = String(error?.message ?? '')
  if (message.includes('PASSWORD_PROTECTED')) return new PdfImportError('PASSWORD', '암호가 걸린 PDF는 불러올 수 없어요.', error)
  if (message.includes('INVALID_FILE') || message.includes('FILE_NOT_FOUND')) return new PdfImportError('INVALID', 'PDF 파일을 열지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.', error)
  if (message.includes('OUT_OF_MEMORY')) return new PdfImportError('MEMORY', '기기 메모리가 부족해 PDF를 불러오지 못했어요. 다른 앱을 닫고 다시 시도해 주세요.', error)
  return new PdfImportError('RENDER', 'PDF 페이지를 그림으로 바꾸지 못했어요. 다시 시도해 주세요.', error)
}

// 3000px 비트맵(약 36MB)을 못 잡는 기기에서는 긴 변을 절반으로 줄여 한 번 더 그린다. 그래도 모자라면 메모리 부족으로 알린다.
async function renderWithRetry(uri, index) {
  try { return await renderPdfPageBitmap(uri, index, PDF_RENDER_EDGE) } catch (error) {
    if (!String(error?.message ?? '').includes('OUT_OF_MEMORY')) throw error
    return renderPdfPageBitmap(uri, index, Math.round(PDF_RENDER_EDGE / 2))
  }
}

/**
 * PDF 한 개를 골라 쪽마다 그림으로 바꿔 미디어 보관함에 저장한다. 취소하면 null.
 * 반환: { name, pages: [{ src, mediaFileId, aspect, name }] } (aspect = 가로 / 세로)
 */
export async function pickPdfPages({ onProgress } = {}) {
  if (!native) throw new PdfImportError('UNAVAILABLE', '이 앱 빌드에서는 PDF를 불러올 수 없어요. 개발 빌드를 다시 만들어 주세요.')
  const picked = await Picker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false })
  if (picked.canceled || !picked.assets?.[0]) return null
  const file = picked.assets[0]
  const baseName = (file.name ?? 'PDF').replace(/\.pdf$/i, '')
  const saved = []
  // 확대하면 원본에서 보이는 영역을 다시 그리므로 원본 PDF 를 보관한다(PdfDetail). 실패하면 아래에서 함께 지운다.
  const sourceId = createId()
  try {
    let count
    try { count = await native.pageCount(file.uri) } catch (error) { throw failure(error) }
    const total = Math.min(count, PDF_PAGE_LIMIT)
    try { await savePdfSource(sourceId, file.uri) } catch (error) { throw new PdfImportError('RENDER', 'PDF 파일을 앱에 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.', error) }
    const pages = []
    for (let index = 0; index < total; index += 1) {
      onProgress?.(index, total)
      let rendered
      try { rendered = await renderWithRetry(file.uri, index) } catch (error) { throw failure(error) }
      try {
        const [media] = await importMedia([{ uri: rendered.uri, fileName: `${baseName}-${index + 1}.png`, width: rendered.width, height: rendered.height, opaque: true }], { usage: 'photo' })
        saved.push(media)
        pages.push({ src: media.src, mediaFileId: media.mediaFileId, aspect: rendered.width / rendered.height, name: `${baseName} ${index + 1}쪽`,
          pdfSource: { sourceId, pageIndex: index, edge: Math.max(rendered.width, rendered.height), ...(rendered.fitted ? { renderVersion: 2 } : {}) } })
      } finally {
        try { new File(rendered.uri).delete() } catch { /* 캐시 정리에 맡긴다. */ }
      }
    }
    onProgress?.(total, total)
    // 어디에도 담기지 않고 남은 쪽 그림 · 원본을 나중에 찾을 수 있게 기록한다.
    await registerPdfImport({ sourceId, mediaFileIds: saved.map(media => media.mediaFileId) })
    return { name: baseName, pages, totalPages: count, sourceId }
  } catch (error) {
    await discardGeneratedMedia(saved)
    await removePdfSource(sourceId)
    if (error instanceof PdfImportError || error instanceof MediaError) throw error
    throw failure(error)
  }
}
