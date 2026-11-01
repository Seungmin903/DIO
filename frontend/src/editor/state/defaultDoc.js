import { normalizePaperAppearance } from '../templates/appearance.js'
import { createId } from '../utils/common.js'
import { TEMPLATE_VERSION, getTemplate, normalizeOrientation, templateCanvasSize, templateIdForOrientation } from '../templates/catalog.js'
import { configuredPageIds, normalizeTemplateConfig, replacedAssetId } from '../templates/creation.js'

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

export function firstPageAssetId(firstPage = 'blank', firstPageDate = '2026-01-01', orientation = 'landscape') {
  const selectedDate = valid2026Date(firstPageDate)
  if (firstPage === 'monthly') return `2026-monthly-${selectedDate.slice(5, 7)}-${normalizeOrientation(orientation)}`
  if (firstPage === 'weekly') {
    const [year, month, day] = selectedDate.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    const mondayOffset = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - mondayOffset)
    return `2026-weekly-blocks-${date.toISOString().slice(0, 10)}-${normalizeOrientation(orientation)}`
  }
  return templateIdForOrientation(FIRST_PAGE_ASSETS[firstPage] ?? FIRST_PAGE_ASSETS.blank, orientation)
}

export function createFirstPage(diary) {
  return createTemplatePage(firstPageAssetId(diary?.firstPage, diary?.firstPageDate, diary?.pageSize))
}

export function createTemplatePage(backgroundAssetId, paperAppearance) {
  const template = getTemplate(backgroundAssetId)
  const { width, height } = templateCanvasSize(template.orientation)
  return { id: createId(), ...(paperAppearance ? { paperAppearance: normalizePaperAppearance(paperAppearance) } : {}), backgroundAssetId: template.id, templateVersion: template.templateVersion, canvasWidth: width, canvasHeight: height, objects: [] }
}

export function createDefaultDoc(diary) {
  const templateConfig = normalizeTemplateConfig(diary?.templateConfig, diary?.pageSize ?? diary?.templateConfig?.orientation)
  const ids = configuredPageIds(templateConfig)
  const paperAppearance = normalizePaperAppearance(diary?.paperAppearance)
  return {
    id: diary?.id ?? createId(),
    ...(diary?.createdAt ? { createdAt: diary.createdAt } : {}),
    title: diary?.title ?? (templateConfig.dateMode === 'undated' ? '만년형 다이어리' : '2026 다이어리'),
    coverColor: diary?.color ?? '#F2A7A0',
    coverPattern: diary?.pattern ?? null,
    year: templateConfig.dateMode === 'undated' ? null : 2026,
    orientation: templateConfig.orientation,
    weeklyStyle: templateConfig.weeklyStyle,
    templateConfig,
    paperAppearance,
    templateVersion: TEMPLATE_VERSION,
    pages: ids.length ? ids.map(id => createTemplatePage(id, paperAppearance)) : [{ ...createBlankPage(templateConfig.orientation), paperAppearance }],
  }
}

// 기존 호출자와 저장 문서용 흰 종이. 새 UI는 공용 속지를 명시해서 추가한다.
export function createBlankPage(orientation) {
  return { id: createId(), ...(orientation === 'portrait' ? { canvasWidth: 768, canvasHeight: 1024 } : {}), objects: [] }
}

/**
 * 저장된 페이지를 축소하거나 재구성하지 않는다. 단 없어진 하루 계획 속지는 같은 방향의 데일리 플래너로 바꾼다
 * (올려 둔 글 · 그림 · 스티커는 그대로). 바꿀 페이지가 없으면 받은 문서를 그대로 돌려준다.
 */
export function migrateUntouchedAnnualDoc(doc) {
  const replacement = page => typeof page?.backgroundAssetId === 'string' ? replacedAssetId(page.backgroundAssetId) : page?.backgroundAssetId
  if (!Array.isArray(doc?.pages) || !doc.pages.some(page => replacement(page) !== page?.backgroundAssetId)) return doc
  return {
    ...doc,
    pages: doc.pages.map(page => {
      const next = replacement(page)
      if (next === page?.backgroundAssetId) return page
      const template = getTemplate(next)
      return { ...page, backgroundAssetId: template.id, templateVersion: template.templateVersion }
    }),
  }
}
