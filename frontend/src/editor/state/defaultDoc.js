import { normalizePaperAppearance } from '../templates/appearance.js'
import { createId } from '../utils/common.js'
import { ANNUAL_PAGE_IDS, TEMPLATE_VERSION, getTemplate } from '../templates/catalog.js'
import { normalizeTemplateConfig } from '../templates/creation.js'

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
  return createTemplatePage(
    firstPageAssetId(diary?.firstPage, diary?.firstPageDate),
    normalizePaperAppearance(diary?.paperAppearance),
  )
}

export function createTemplatePage(backgroundAssetId, paperAppearance) {
  const template = getTemplate(backgroundAssetId)
  return { id: createId(), ...(paperAppearance ? { paperAppearance: normalizePaperAppearance(paperAppearance) } : {}), backgroundAssetId: template.id, templateVersion: template.templateVersion, canvasWidth: 1024, canvasHeight: 768, objects: [] }
}

export function createDefaultDoc(diary) {
  const templateConfig = normalizeTemplateConfig(diary?.templateConfig)
  const paperAppearance = normalizePaperAppearance(diary?.paperAppearance)
  return {
    id: diary?.id ?? createId(),
    title: diary?.title ?? '2026 다이어리',
    coverColor: diary?.color ?? '#F2A7A0',
    coverPattern: diary?.pattern ?? null,
    year: 2026,
    orientation: 'landscape',
    weeklyStyle: templateConfig.weeklyStyle,
    templateConfig,
    paperAppearance,
    templateVersion: TEMPLATE_VERSION,
    // 연간 속지 전체를 한 번에 만들면 첫 진입과 페이지 목록이 무거워진다.
    // 선택한 첫 속지 한 장만 만들고 필요한 페이지는 편집기에서 추가한다.
    pages: [createFirstPage({ ...diary, paperAppearance })],
  }
}

// 기존 호출자와 저장 문서용 흰 종이. 새 UI는 공용 속지를 명시해서 추가한다.
export function createBlankPage() { return { id: createId(), objects: [] } }

/**
 * 이전 버전이 자동 생성한 연간 78쪽이 전부 비어 있을 때만 한 장으로 줄인다.
 * 한 페이지라도 편집했다면 사용자의 기록을 지우지 않고 그대로 보존한다.
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
