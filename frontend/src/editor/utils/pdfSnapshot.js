import { createExportSnapshot, PageExportError } from './pageExport.js'
import { pngFileName } from './pngFileSave.js'

export const PDF_LIMITS = Object.freeze({ pages: 20, pixels: 80000000, bytes: 50 * 1024 * 1024, timeoutMs: 180000 })
export const A4_LANDSCAPE = [297 * 72 / 25.4, 210 * 72 / 25.4]
export const pdfError = (code, message, extra = {}) => Object.assign(new PageExportError(code, message), extra)
const invalid = () => pdfError('EXPORT_PDF_INPUT_INVALID', '페이지 선택과 크기를 확인해 주세요.')

/** 문서 순서와 실제 캔버스 규격으로 2배 스냅샷을 고정한다. */
export function createPdfExportSnapshot(doc, { scope, currentPageId, selectedPageIds, range, width, height, title = doc?.title, now = new Date() } = {}) {
  if (!doc || !Array.isArray(doc.pages) || !doc.pages.length || !['current', 'pages', 'range'].includes(scope) || ![width, height].every((v) => Number.isFinite(v) && v > 0) || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw invalid()
  const ids = doc.pages.map((p) => p?.id)
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw invalid()
  let wanted
  if (scope === 'current') {
    if (!ids.includes(currentPageId)) throw invalid()
    wanted = [currentPageId]
  } else if (scope === 'pages') {
    if (!Array.isArray(selectedPageIds) || !selectedPageIds.length || new Set(selectedPageIds).size !== selectedPageIds.length || selectedPageIds.some((id) => !ids.includes(id))) throw invalid()
    wanted = selectedPageIds
  } else {
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 1 || range.start > range.end || range.end > ids.length) throw invalid()
    wanted = ids.slice(range.start - 1, range.end)
  }
  if (wanted.length > PDF_LIMITS.pages) throw pdfError('EXPORT_PDF_LIMIT_EXCEEDED', 'PDF는 최대 20페이지까지 만들 수 있어요.')
  const selected = new Set(wanted)
  const pages = doc.pages.flatMap((page, index) => {
    if (!selected.has(page.id)) return []
    try { return [{ ...createExportSnapshot(page, { width, height, scale: 2 }), documentPageNumber: index + 1 }] }
    catch (error) { throw Object.assign(error, { documentPageNumber: index + 1, phase: 'preparing' }) }
  })
  if (pages.reduce((sum, p) => sum + p.pixelWidth * p.pixelHeight, 0) > PDF_LIMITS.pixels) throw pdfError('EXPORT_PDF_LIMIT_EXCEEDED', 'PDF의 합계 출력 픽셀이 상한을 초과해요.')
  const base = pngFileName(title, pages[0].documentPageNumber, now)
  const suffix = scope === 'current' ? `p${String(pages[0].documentPageNumber).padStart(2, '0')}`
    : scope === 'range' ? `p${String(range.start).padStart(2, '0')}-p${String(range.end).padStart(2, '0')}`
      : pages.length === doc.pages.length ? 'all' : `selected${String(pages.length).padStart(2, '0')}`
  const fileName = base.replace(/_p\d+_(\d{8}_\d{6}_\d{3})\.png$/, `_${suffix}_$1.pdf`)
  return { scope, title: String(title || '다이어리'), createdAt: now.toISOString(), fileName, pages }
}

/** 111번 UI에서 선택 수/상한과 함께 표시할 전체 선택 가용성. */
export function pdfSelectAllPolicy(doc, { width, height }) {
  let maxPages = PDF_LIMITS.pages
  try {
    if (!Array.isArray(doc?.pages) || !doc.pages.length || ![width, height].every((n) => Number.isFinite(n) && n > 0)) throw invalid()
    const page = createExportSnapshot({ objects: [] }, { width, height, scale: 2 })
    // 페이지 수 상한과 픽셀 예산 중 작은 값이 실제 최대 면 수다. (1280×800의 2배는 19면)
    maxPages = Math.min(PDF_LIMITS.pages, Math.floor(PDF_LIMITS.pixels / (page.pixelWidth * page.pixelHeight)))
    if (doc.pages.length > maxPages) throw pdfError('EXPORT_PDF_LIMIT_EXCEEDED', `전체 선택은 최대 ${maxPages}페이지까지 가능해요. 일부 페이지를 선택해 주세요.`)
    return { enabled: true, maxPages, totalPages: doc.pages.length }
  } catch (error) {
    return { enabled: false, maxPages, totalPages: doc?.pages?.length ?? 0, reason: error.message, code: error.code }
  }
}
