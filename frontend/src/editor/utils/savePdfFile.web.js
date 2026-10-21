import { saveWebFile } from './saveWebFile.js'

export const savePdfFile = result => saveWebFile(result, result.fileName, { mimeType: 'application/pdf', extension: '.pdf', description: 'PDF 문서' })
export const cleanupPdfShareCache = async () => ({ removed: 0 })
