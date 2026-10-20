import { generatePdf as generate } from './pdfGenerator.js'
import { PDF_LIMITS, pdfError } from './pdfSnapshot.js'

export const readPdfImage = async (result) => {
  const blob = result.blob ?? await fetch(result.uri).then((r) => { if (!r.ok) throw pdfError('EXPORT_PDF_RASTER_INVALID', 'PNG를 읽지 못했어요.'); return r.blob() })
  if (blob.size > PDF_LIMITS.bytes) throw pdfError('EXPORT_PDF_LIMIT_EXCEEDED', '출력 PNG가 너무 커요.')
  return new Uint8Array(await blob.arrayBuffer())
}
export const createPdfResult = async (bytes) => {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const uri = URL.createObjectURL(blob)
  return { uri, blob, dispose() { URL.revokeObjectURL(uri) } }
}
export const generatePdf = (snapshot, options) => generate(snapshot, { ...options, readImage: readPdfImage, createResult: createPdfResult })
