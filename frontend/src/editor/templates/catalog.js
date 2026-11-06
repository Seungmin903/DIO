import { catalog, annualBook, portraitAnnualBook, reusableMenu } from './data.js'
import { UNDATED_TEMPLATES } from './undated.js'
import { STUDY_PLANNER_MENU_ITEM, STUDY_PLANNER_TEMPLATES } from './studyPlanner.js'
import { DAY_PLANNER_MENU_ITEM, DAY_PLANNER_TEMPLATES } from './dayPlanner.js'
import { datedTemplate } from './dated.js'
import { PLANNER_TEMPLATE_SELECTION_ENABLED } from './serverCatalog.js'
import { remoteTemplateAsset } from './remoteTemplates.js'

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
// 예전 하루 계획(reusableMenu 첫 항목)은 메뉴에서 빼고 데일리 플래너(구글 일간식)로 대체한다. 옛 속지 파일은 이미 만든 다이어리를 위해 아래 assets 에 남긴다.
// V27 전(플래너 선택 꺼짐)에는 DB에 플래너가 없으므로 예전 하루 계획을 그대로 고르게 둔다. 이렇게 만든 페이지는 V27이 데일리 플래너로 옮긴다.
const menuItems = PLANNER_TEMPLATE_SELECTION_ENABLED
  ? [STUDY_PLANNER_MENU_ITEM, DAY_PLANNER_MENU_ITEM, ...reusableMenu.slice(1)]
  : reusableMenu
export const reusableTemplates = (orientation = 'landscape') => menuItems.map(item => ({ ...item, name: displayName(item), assetId: item.assets.find(asset => asset.orientation === normalizeOrientation(orientation)).assetId }))
export const REUSABLE_TEMPLATES = reusableTemplates()
const assets = new Map(catalog.assets.map(asset => [asset.id, { ...asset, name: displayName(asset) }]))
for (const asset of [...UNDATED_TEMPLATES, ...STUDY_PLANNER_TEMPLATES, ...DAY_PLANNER_TEMPLATES]) assets.set(asset.id, asset)

export class TemplateError extends Error {
  constructor(message = '내지를 불러오지 못했어요. 다시 시도해 주세요.', cause) {
    super(message); this.name = 'TemplateError'; this.code = 'TEMPLATE_UNAVAILABLE'; this.cause = cause
  }
}

export function getTemplate(id, version = TEMPLATE_VERSION) {
  // 날짜 속지(dated-…)는 파일 없이 ID 에서 항목을 만든다. 원격 속지(remote-…)는 목록(catalog.json)에서 찾는다
  const asset = assets.get(id) ?? datedTemplate(id) ?? remoteTemplateAsset(id)
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
