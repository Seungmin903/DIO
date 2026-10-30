import { discardGeneratedMedia, importMedia } from '../../editor/services/mediaStore'
import { MediaError } from '../../editor/utils/mediaPolicy.js'
import { PDF_PAGE_LIMIT, PDF_RENDER_EDGE, PdfImportError } from './pdfImport.js'

// pdf.js 는 heic 디코더처럼 Metro 번들이 아닌 같은 출처의 별도 모듈(public/vendor/pdfjs)로 불러온다.
let pending
function loadPdfJs() {
  if (pending) return pending
  pending = new Promise((resolve, reject) => {
    const configured = globalThis.DIO_PDFJS_URL ?? 'vendor/pdfjs/4.10.38/register.mjs'
    const url = new URL(configured, document.baseURI)
    if (url.origin !== location.origin) { reject(new Error('PDF 모듈은 이 사이트의 주소에서만 불러올 수 있어요.')); return }
    const script = document.createElement('script')
    script.type = 'module'; script.src = url.href
    script.onload = () => {
      if (typeof globalThis.DIOPdf?.getDocument !== 'function') { reject(new Error('PDF 모듈을 사용할 수 없어요.')); return }
      resolve(globalThis.DIOPdf)
    }
    script.onerror = () => { script.remove(); reject(new Error('PDF 모듈을 불러오지 못했어요.')) }
    document.head.appendChild(script)
  }).catch(error => { pending = undefined; throw error })
  return pending
}

/** 클릭에서 바로 열어야 하므로 모듈 로드보다 먼저 파일 선택창을 띄운다. */
function selectPdf() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/pdf,.pdf'
    input.style.display = 'none'
    let settled = false, timer
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('focus', onFocus); input.remove() }
    const finish = file => { if (settled) return; settled = true; cleanup(); resolve(file) }
    const onFocus = () => { timer = setTimeout(() => { if (!input.files?.length) finish(null) }, 500) }
    input.onchange = () => finish(input.files?.[0] ?? null)
    input.oncancel = () => finish(null)
    window.addEventListener('focus', onFocus)
    document.body.appendChild(input)
    try { input.click() } catch (error) { settled = true; cleanup(); reject(error) }
  })
}

const toBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('페이지를 그림으로 바꾸지 못했어요.')), 'image/png'))

/**
 * PDF 한 개를 골라 쪽마다 그림으로 바꿔 미디어 보관함에 저장한다. 취소하면 null.
 * 반환: { name, pages: [{ src, mediaFileId, aspect, name }] } (aspect = 가로 / 세로)
 */
export async function pickPdfPages({ onProgress } = {}) {
  const file = await selectPdf()
  if (!file) return null
  let pdf
  try {
    const pdfjs = await loadPdfJs()
    pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  } catch (error) {
    if (error?.name === 'PasswordException') throw new PdfImportError('PASSWORD', '암호가 걸린 PDF는 불러올 수 없어요.')
    throw new PdfImportError('INVALID', 'PDF 파일을 열지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.', error)
  }
  const saved = []
  try {
    const total = Math.min(pdf.numPages, PDF_PAGE_LIMIT)
    const pages = []
    const baseName = file.name.replace(/\.pdf$/i, '')
    for (let number = 1; number <= total; number += 1) {
      onProgress?.(number - 1, total)
      const page = await pdf.getPage(number)
      try {
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: PDF_RENDER_EDGE / Math.max(base.width, base.height) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(viewport.width)); canvas.height = Math.max(1, Math.round(viewport.height))
        const context = canvas.getContext('2d')
        context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: context, viewport }).promise
        const blob = await toBlob(canvas)
        const [media] = await importMedia([{ file: new File([blob], `${baseName}-${number}.png`, { type: 'image/png' }), fileName: `${baseName}-${number}.png`, fileSize: blob.size }], { usage: 'photo' })
        saved.push(media)
        pages.push({ src: media.src, mediaFileId: media.mediaFileId, aspect: canvas.width / canvas.height, name: `${baseName} ${number}쪽` })
      } finally { page.cleanup() }
    }
    onProgress?.(total, total)
    return { name: baseName, pages, totalPages: pdf.numPages }
  } catch (error) {
    await discardGeneratedMedia(saved)
    if (error instanceof PdfImportError || error instanceof MediaError) throw error
    throw new PdfImportError('RENDER', 'PDF 페이지를 그림으로 바꾸지 못했어요. 다시 시도해 주세요.', error)
  } finally { pdf.destroy?.() }
}
