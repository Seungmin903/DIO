import { Directory, File, FileMode, Paths } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import { isAvailableAsync, shareAsync } from 'expo-sharing'
import { createPdfShareService, pdfSaveFailure } from './pdfFileSave.js'

const root = () => new Directory(Paths.cache, 'dio-pdf-share-v1')
const lease = dir => new File(dir, 'lease.json')
const expiry = (entry, expiresAt) => lease(entry.directory).write(JSON.stringify({ expiresAt }))
const service = createPdfShareService({
  isAvailable: isAvailableAsync,
  share: shareAsync,
  list: async () => {
    const directory = root()
    if (!directory.exists) return []
    const entries = []
    for (const item of directory.list()) {
      if (!(item instanceof Directory) || !item.name.startsWith('export-')) continue
      try { entries.push({ directory: item, uri: item.uri, expiresAt: JSON.parse(await lease(item).text()).expiresAt }) } catch {}
    }
    return entries
  },
  remove: entry => entry.directory.delete(),
  setExpiry: expiry,
  createCopy: async (result, expiresAt) => {
    if (!result?.fileName || /[<>:"/\\|?*\u0000-\u001f]/.test(result.fileName) || !result.fileName.endsWith('.pdf')) throw pdfSaveFailure('EXPORT_PDF_INPUT_INVALID', 'Invalid PDF file name')
    const source = new File(result.uri)
    if (!source.exists || !source.size || source.size > 50 * 1024 * 1024) throw pdfSaveFailure('EXPORT_PDF_SAVE_FAILED', 'PDF output unavailable')
    const reader = source.open(FileMode.ReadOnly)
    try { if (String.fromCharCode(...reader.readBytes(5)) !== '%PDF-') throw pdfSaveFailure('EXPORT_PDF_SAVE_FAILED', 'Invalid PDF output') }
    finally { reader.close() }
    const directory = new Directory(root(), `export-${randomUUID()}`)
    try {
      root().create({ intermediates: true, idempotent: true })
      directory.create()
      const marker = lease(directory); marker.create(); expiry({ directory }, expiresAt)
      const file = new File(directory, result.fileName)
      await source.copy(file)
      if (!file.exists || file.size !== source.size) throw pdfSaveFailure('EXPORT_PDF_SAVE_FAILED', 'Incomplete PDF copy')
      return { directory, uri: file.uri, cacheKey: directory.uri }
    } catch (error) { try { directory.delete() } catch {}; throw error }
  },
})

export const savePdfFile = result => service.save(result)
export const cleanupPdfShareCache = () => service.cleanup()
