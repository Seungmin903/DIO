import { Directory, File, FileMode, Paths } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import { createPdfShareService, pdfSaveFailure } from './pdfFileSave.js'

const root = () => new Directory(Paths.cache, 'dio-pdf-share-v1')
const lease = dir => new File(dir, 'lease.json')
const expiry = (entry, expiresAt) => lease(entry.directory).write(JSON.stringify({ expiresAt }))
let sharingModule

// Expo Go 또는 이전 개발 빌드에 expo-sharing 네이티브 모듈이 없을 수 있다.
// 앱을 여는 단계(캐시 정리 포함)에서는 해당 모듈을 평가하지 않고, PDF 공유를 실제로 요청했을 때만 불러온다.
// 캐시 정리는 파일 시스템만 쓰므로 공유 모듈 없이 동작한다.
// 불러오기에 실패하면 다음 요청에서 다시 시도한다.
// import() 는 개발 앱에서 별도 묶음을 개발 서버에서 따로 받아와야 해서, 받아오지 못하면 모듈이 있어도 공유를 못 쓰는 것으로 보였다.
// 같은 묶음 안에 두되 호출할 때만 평가하도록 require 를 쓴다.
const sharing = async () => {
  if (sharingModule) return sharingModule
  // Node 테스트(ESM)에는 require 가 없어서 그때만 import() 를 쓴다
  try { sharingModule = typeof require === 'function' ? require('expo-sharing') : await import('expo-sharing'); return sharingModule }
  catch (error) { console.warn('expo-sharing 을 불러오지 못했어요', error); throw error }
}

const service = createPdfShareService({
  // 모듈이 없는 빌드는 "공유를 쓸 수 없음"(EXPORT_PDF_SHARE_UNAVAILABLE)으로 안내한다.
  isAvailable: async () => {
    try { return await (await sharing()).isAvailableAsync() } catch (error) { console.warn('PDF 공유 사용 불가', error); return false }
  },
  share: async (uri, options) => (await sharing()).shareAsync(uri, options),
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
    try { if (String.fromCharCode(...await reader.readBytes(5)) !== '%PDF-') throw pdfSaveFailure('EXPORT_PDF_SAVE_FAILED', 'Invalid PDF output') }
    finally { reader.close() }
    const directory = new Directory(root(), `export-${randomUUID()}`)
    try {
      root().create({ intermediates: true, idempotent: true })
      directory.create()
      const marker = lease(directory); marker.create(); await expiry({ directory }, expiresAt)
      const file = new File(directory, result.fileName)
      await source.copy(file)
      if (!file.exists || file.size !== source.size) throw pdfSaveFailure('EXPORT_PDF_SAVE_FAILED', 'Incomplete PDF copy')
      return { directory, uri: file.uri, cacheKey: directory.uri }
    } catch (error) { try { directory.delete() } catch {}; throw error }
  },
})

export const savePdfFile = result => service.save(result)
export const cleanupPdfShareCache = () => service.cleanup()
