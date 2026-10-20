import { PDF_LIMITS } from './pdfSnapshot.js'

export const MAX_EXPORT_PAGES = PDF_LIMITS.pages
export const pageListKey = (pages) => JSON.stringify(pages.map((page) => page.id))

/** UI에서 받은 페이지 번호는 1부터 시작하며 결과는 문서 순서를 따른다. */
export function exportPageIds(pages, { mode, currentId, selectedIds = [], from, to }) {
  let ids
  if (mode === 'current') ids = pages.some((p) => p.id === currentId) ? [currentId] : []
  else if (mode === 'pages') {
    const selected = new Set(selectedIds)
    if (selected.size !== selectedIds.length || selectedIds.some((id) => !pages.some((p) => p.id === id))) throw new Error('페이지 목록이 바뀌었어요. 다시 선택해 주세요.')
    ids = pages.filter((p) => selected.has(p.id)).map((p) => p.id)
  } else if (mode === 'range') {
    if (![from, to].every((n) => /^\d+$/.test(String(n)))) throw new Error('시작과 끝에 페이지 정수를 입력해 주세요.')
    const start = Number(from), end = Number(to)
    if (start < 1 || end < start || end > pages.length) throw new Error('시작·끝 페이지와 문서 범위를 확인해 주세요.')
    ids = pages.slice(start - 1, end).map((p) => p.id)
  } else throw new Error('내보내기 방식을 선택해 주세요.')
  if (!ids.length) throw new Error('한 페이지 이상 선택해 주세요.')
  if (ids.length > MAX_EXPORT_PAGES) throw new Error('한 번에 최대 20페이지까지 선택할 수 있어요.')
  return ids
}
