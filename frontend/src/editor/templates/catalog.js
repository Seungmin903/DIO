import { catalog, annualBook, portraitAnnualBook, reusableMenu } from './data.js'
import { UNDATED_TEMPLATES } from './undated.js'
import { STUDY_PLANNER_MENU_ITEM, STUDY_PLANNER_TEMPLATES } from './studyPlanner.js'
import { datedTemplate } from './dated.js'

export const TEMPLATE_VERSION = catalog.templateVersion
export const ANNUAL_PAGE_IDS = annualBook.pages
export const normalizeOrientation = value => value === 'portrait' ? 'portrait' : 'landscape'
export const templateIdForOrientation = (id, orientation) => id.replace(/-(landscape|portrait)$/, '-' + normalizeOrientation(orientation))
export const annualPageIds = orientation => normalizeOrientation(orientation) === 'portrait' ? portraitAnnualBook.pages : annualBook.pages
export const templateCanvasSize = orientation => catalog.coordinateSystems[normalizeOrientation(orientation)]
function displayName(item) {
  if (item.type === 'daily') return '하루 계획'
  if (item.type === 'scrap') return '사진·스크랩'
  if (item.type === 'cover') return '첫 장 표지'
  if (item.type === 'divider') return `월별 구분 페이지 · ${item.month}월`
  if (item.type === 'monthly') return `월간 달력 · ${item.month}월`
  if (item.type === 'weekly') return `주간 계획 · ${item.name}`
  return item.name
}
// 스터디 플래너는 데일리 플래너 바로 뒤에 둔다.
const menuItems = [...reusableMenu.slice(0, 1), STUDY_PLANNER_MENU_ITEM, ...reusableMenu.slice(1)]
export const reusableTemplates = (orientation = 'landscape') => menuItems.map(item => ({ ...item, name: displayName(item), assetId: item.assets.find(asset => asset.orientation === normalizeOrientation(orientation)).assetId }))
export const REUSABLE_TEMPLATES = reusableTemplates()
const assets = new Map(catalog.assets.map(asset => [asset.id, { ...asset, name: displayName(asset) }]))
for (const asset of [...UNDATED_TEMPLATES, ...STUDY_PLANNER_TEMPLATES]) assets.set(asset.id, asset)

export class TemplateError extends Error {
  constructor(message = '내지를 불러오지 못했어요. 다시 시도해 주세요.', cause) {
    super(message); this.name = 'TemplateError'; this.code = 'TEMPLATE_UNAVAILABLE'; this.cause = cause
  }
}

export function getTemplate(id, version = TEMPLATE_VERSION) {
  // 날짜 속지(dated-…)는 파일 없이 ID 에서 항목을 만든다
  const asset = assets.get(id) ?? datedTemplate(id)
  if (!asset || !['landscape', 'portrait'].includes(asset.orientation) || version !== asset.templateVersion) {
    throw new TemplateError('이 페이지의 내지 또는 버전을 찾을 수 없어요.')
  }
  return asset
}

export function templateReference(page) {
  if (page.backgroundAssetId == null) return null
  if (!page.templateVersion) throw new TemplateError('내지 버전 정보가 없어요.')
  const asset = getTemplate(page.backgroundAssetId, page.templateVersion)
  return { backgroundAssetId: asset.id, templateVersion: asset.templateVersion }
}
