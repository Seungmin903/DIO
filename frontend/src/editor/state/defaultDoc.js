import { createId } from '../utils/common.js'
import { ANNUAL_PAGE_IDS, TEMPLATE_VERSION, getTemplate } from '../templates/catalog.js'

const FIRST_PAGE_ASSETS = {
  blank: '2026-reusable-note-plain-landscape',
  lined: '2026-reusable-note-ruled-landscape',
  grid: '2026-reusable-note-grid-landscape',
  dot: '2026-reusable-note-dots-landscape',
}

function valid2026Date(value) {
  if (typeof value !== 'string' || !/^2026-\d{2}-\d{2}$/.test(value)) return '2026-01-01'
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === 2026 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : '2026-01-01'
}

export function firstPageAssetId(firstPage = 'blank', firstPageDate = '2026-01-01') {
  const selectedDate = valid2026Date(firstPageDate)
  if (firstPage === 'monthly') return `2026-monthly-${selectedDate.slice(5, 7)}-landscape`
  if (firstPage === 'weekly') {
    const [year, month, day] = selectedDate.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    const mondayOffset = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - mondayOffset)
    return `2026-weekly-blocks-${date.toISOString().slice(0, 10)}-landscape`
  }
  return FIRST_PAGE_ASSETS[firstPage] ?? FIRST_PAGE_ASSETS.blank
}

export function createFirstPage(diary) {
  return createTemplatePage(firstPageAssetId(diary?.firstPage, diary?.firstPageDate))
}

export function createTemplatePage(backgroundAssetId) {
  const template = getTemplate(backgroundAssetId)
  return { id: createId(), backgroundAssetId: template.id, templateVersion: template.templateVersion, canvasWidth: 1024, canvasHeight: 768, objects: [] }
}

export function createDefaultDoc(diary) {
  return {
    id: diary?.id ?? createId(),
    title: diary?.title ?? '2026 다이어리',
    coverColor: diary?.color ?? '#F2A7A0',
    year: 2026,
    orientation: 'landscape',
    weeklyStyle: 'blocks',
    templateVersion: TEMPLATE_VERSION,
    // 새 다이어리를 열 때 연간 속지 전체를 미리 넣으면 페이지 목록과 로딩이
    // 불필요하게 무거워진다. 필요한 속지는 사용자가 페이지 추가에서 한 장씩 넣는다.
    pages: [createFirstPage(diary)],
  }
}

// 기존 호출자와 저장 문서용 흰 종이. 새 UI는 공용 속지를 명시해서 추가한다.
export function createBlankPage() { return { id: createId(), objects: [] } }

/**
 * 예전 버전은 새 다이어리에 연간 78쪽을 자동 생성했다. 사용자가 아무것도
 * 쓰지 않은 그 문서만 한 장짜리 새 형식으로 바꾼다. 한 페이지라도 편집했다면
 * 기존 기록을 절대 지우지 않고 그대로 둔다.
 */
export function migrateUntouchedAnnualDoc(doc, diary) {
  const pages = doc?.pages
  const isUntouchedAnnualBook = Array.isArray(pages)
    && pages.length === ANNUAL_PAGE_IDS.length
    && pages.every((page, index) => (
      page?.backgroundAssetId === ANNUAL_PAGE_IDS[index]
      && Array.isArray(page.objects)
      && page.objects.length === 0
    ))

  return isUntouchedAnnualBook ? { ...doc, pages: [createFirstPage(diary)] } : doc
}
