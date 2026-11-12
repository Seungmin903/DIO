import { File, Paths } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import { generatePdf as generate } from './pdfGenerator.js'
import { PDF_LIMITS, pdfError } from './pdfSnapshot.js'

export const readPdfImage = async (result) => {
  const file = new File(result.uri)
  if (!file.exists || file.size > PDF_LIMITS.bytes) throw pdfError('EXPORT_PDF_RASTER_INVALID', '출력 PNG를 읽지 못했어요.')
  return file.bytes()
}
export const createPdfResult = async (bytes) => {
  const file = new File(Paths.cache, `dio-pdf-${randomUUID()}.pdf`)
  const dispose = () => { if (file.exists) file.delete() }
  try { file.create(); await file.write(bytes); return { uri: file.uri, dispose } }
  catch (error) { dispose(); throw error }
}
export const generatePdf = (snapshot, options) => generate(snapshot, { ...options, readImage: readPdfImage, createResult: createPdfResult })
