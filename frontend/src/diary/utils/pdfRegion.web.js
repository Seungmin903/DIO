import { loadPdfJs } from './pdfPages.web.js'
import { readPdfSource } from './pdfSourceStore.web.js'

// 보관한 원본 PDF 에서 쪽의 한 영역만 원하는 픽셀 크기로 다시 그린다(PdfDetail). 열어 둔 문서는 최근 둘만 들고 있는다.
const OPEN_LIMIT = 2
const open = new Map()

function documentOf(sourceId) {
  const cached = open.get(sourceId)
  if (cached) { open.delete(sourceId); open.set(sourceId, cached); return cached }
  const job = (async () => {
    const blob = await readPdfSource(sourceId)
    if (!blob) throw new Error('PDF_SOURCE_MISSING')
    return (await loadPdfJs()).getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
  })()
  open.set(sourceId, job)
  job.catch(() => { if (open.get(sourceId) === job) open.delete(sourceId) })
  while (open.size > OPEN_LIMIT) {
    const [oldest] = open.keys()
    const old = open.get(oldest)
    open.delete(oldest)
    old.then(pdf => pdf.destroy?.()).catch(() => {})
  }
  return job
}

const toBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('영역을 그림으로 바꾸지 못했어요.')), 'image/jpeg', 0.95))

/**
 * rect = 쪽 전체 대비 0~1 비율 { x, y, width, height }. 반환: { uri } (쓰고 나면 releasePdfRegion).
 */
export async function renderPdfRegion({ sourceId, pageIndex, rect, outWidth, outHeight }) {
  const pdf = await documentOf(sourceId)
  const page = await pdf.getPage(pageIndex + 1)
  try {
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: outWidth / (rect.width * base.width) })
    const canvas = document.createElement('canvas')
    canvas.width = outWidth; canvas.height = outHeight
    const context = canvas.getContext('2d')
    context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, outWidth, outHeight)
    await page.render({ canvasContext: context, viewport, transform: [1, 0, 0, 1, -rect.x * viewport.width, -rect.y * viewport.height] }).promise
    const blob = await toBlob(canvas)
    canvas.width = canvas.height = 0
    return { uri: URL.createObjectURL(blob) }
  } finally { page.cleanup() }
}

export function releasePdfRegion(uri) { try { URL.revokeObjectURL(uri) } catch { /* 이미 해제됨 */ } }
