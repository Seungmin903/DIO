import { discardGeneratedMedia } from '../../editor/services/mediaStore'
import { removePdfSource } from './pdfSourceStore'
import { forgetPdfImport } from './pdfImportRegistry'

/** 저장하지 않은 PDF 불러오기를 되돌린다: 쪽 그림(미디어 보관함)과 보관한 원본 PDF 를 함께 지운다. */
export async function discardPdfImport(pdf) {
  if (!pdf) return
  await Promise.allSettled([discardGeneratedMedia(pdf.pages ?? []), removePdfSource(pdf.sourceId), forgetPdfImport(pdf.sourceId)])
}
