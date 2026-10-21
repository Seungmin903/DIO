import { createId } from '../utils/common.js'
import { TEMPLATE_VERSION, getTemplate } from '../templates/catalog.js'
import { configuredPageIds, normalizeTemplateConfig } from '../templates/creation.js'

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
  const templateConfig = normalizeTemplateConfig(diary?.templateConfig)
  const ids = configuredPageIds(templateConfig)
  return {
    id: diary?.id ?? createId(),
    title: diary?.title ?? '2026 다이어리',
    coverColor: diary?.color ?? '#F2A7A0',
    coverPattern: diary?.pattern ?? null,
    year: 2026,
    orientation: 'landscape',
    weeklyStyle: templateConfig.weeklyStyle,
    templateConfig,
    templateVersion: TEMPLATE_VERSION,
    pages: ids.length ? ids.map(createTemplatePage) : [createBlankPage()],
  }
}

// 기존 호출자와 저장 문서용 흰 종이. 새 UI는 공용 속지를 명시해서 추가한다.
export function createBlankPage() { return { id: createId(), objects: [] } }

/** 기존 호출자와 호환하면서 저장된 페이지를 축소하거나 재구성하지 않는다. */
export function migrateUntouchedAnnualDoc(doc) { return doc }
