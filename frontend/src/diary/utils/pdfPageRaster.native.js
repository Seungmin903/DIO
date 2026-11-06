import { Platform } from 'react-native'
import { Directory, File, Paths } from 'expo-file-system'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { PDFDocument } from 'pdf-lib/dist/pdf-lib.js'
import { pdfSourceUri } from './pdfSourceStore.native.js'
import { normalizePdfSource } from './pdfSource.js'

const native = requireOptionalNativeModule('DioPdfRender')
const canScale = Platform.OS !== 'ios' || native?.supportsScaledRendering?.() === true
const inFlight = new Map()
let queue = Promise.resolve()
let recentDocument

async function pdfPointEdge(uri, index) {
  if (recentDocument?.uri !== uri) {
    const document = new File(uri).bytes().then(bytes => PDFDocument.load(bytes, { updateMetadata: false }))
    recentDocument = { uri, document }
  }
  const page = (await recentDocument.document).getPage(index)
  const { width, height } = page.getCropBox()
  return Math.max(width, height)
}

export function canRenderPdfDetail() {
  return canScale && typeof native?.renderRegion === 'function'
}

/** Old iOS binaries can render into a smaller bitmap without centering the art inside it. */
export async function renderPdfPageBitmap(uri, index, longEdge) {
  if (canScale) return { ...await native.renderPage(uri, index, longEdge), fitted: true }
  const pointEdge = await pdfPointEdge(uri, index).catch(() => null)
  if (!Number.isFinite(pointEdge) || pointEdge < 64) return native.renderPage(uri, index, longEdge)
  const safeEdge = Math.max(64, Math.floor(pointEdge) - 1)
  return { ...await native.renderPage(uri, index, Math.min(longEdge, safeEdge)), fitted: true }
}

export function localPdfRasterKey(source) {
  if (Platform.OS !== 'ios' || !native || source?.renderVersion === 2) return null
  const pdf = normalizePdfSource(source)
  return pdf && pdfSourceUri(pdf.sourceId) ? pdf.sourceId + '-' + pdf.pageIndex : null
}

/** Rebuild an old preview from its original without replacing the saved media. */
export function resolveLocalPdfRaster(source) {
  const key = localPdfRasterKey(source)
  if (!key) return Promise.resolve(null)
  if (inFlight.has(key)) return inFlight.get(key)
  const run = queue.then(async () => {
    const pdf = normalizePdfSource(source)
    const uri = pdfSourceUri(pdf.sourceId)
    if (!uri) return null
    const directory = new Directory(Paths.cache, canScale ? 'dio-pdf-raster-v2' : 'dio-pdf-raster-legacy-v2')
    const target = new File(directory, key + '.png')
    if (target.exists && target.size > 0) return target.uri
    directory.create({ intermediates: true, idempotent: true })
    const rendered = await renderPdfPageBitmap(uri, pdf.pageIndex, 3000)
    const image = new File(rendered.uri)
    try {
      if (!rendered.fitted) return null
      if (target.exists) target.delete()
      await image.copy(target)
      return target.uri
    } finally {
      if (image.exists) image.delete()
    }
  })
  const job = run.catch(() => null).finally(() => inFlight.delete(key))
  inFlight.set(key, job)
  queue = job
  return job
}
