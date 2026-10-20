import { createPdfExportSnapshot, pdfSelectAllPolicy } from './pdfSnapshot.js'
import { exportPageIds } from './exportSelection.js'

/** 생성 시작 시 선택을 고정한다. 재시도에는 반환한 스냅샷을 그대로 사용한다. */
export function createMenuPdfSnapshot(doc, selection, { width, height, now = new Date() }) {
  const pageIds = exportPageIds(doc.pages, selection)
  return createPdfExportSnapshot(doc, {
    scope: selection.mode, currentPageId: selection.currentId, selectedPageIds: pageIds,
    range: selection.mode === 'range' ? { start: Number(selection.from), end: Number(selection.to) } : undefined,
    width, height, now,
  })
}
export const menuPdfPolicy = (doc, dimensions) => pdfSelectAllPolicy(doc, dimensions)
export function pdfMenuFailure(error) {
  if (error?.code === 'EXPORT_CANCELLED') return { status: 'cancelled' }
  const page = error?.documentPageNumber
  const prefix = Number.isInteger(page) ? `문서 ${page}페이지: ` : ''
  return { status: 'error', message: prefix + (error?.message || 'PDF를 만들지 못했어요.') }
}
