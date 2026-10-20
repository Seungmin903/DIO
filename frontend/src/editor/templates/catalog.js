import { catalog, annualBook, reusableMenu } from './data.js'

export const TEMPLATE_VERSION = catalog.templateVersion
export const ANNUAL_PAGE_IDS = annualBook.pages
export const REUSABLE_TEMPLATES = reusableMenu.map(item => ({ ...item, assetId: item.assets[0].assetId }))
const assets = new Map(catalog.assets.map(asset => [asset.id, asset]))

export class TemplateError extends Error {
  constructor(message = '속지를 불러오지 못했어요. 다시 시도해 주세요.', cause) {
    super(message); this.name = 'TemplateError'; this.code = 'TEMPLATE_UNAVAILABLE'; this.cause = cause
  }
}

export function getTemplate(id, version = TEMPLATE_VERSION) {
  const asset = assets.get(id)
  if (!asset || asset.orientation !== 'landscape' || version !== asset.templateVersion) {
    throw new TemplateError('이 페이지의 속지 또는 버전을 찾을 수 없어요.')
  }
  return asset
}

export function templateReference(page) {
  if (page.backgroundAssetId == null) return null
  if (!page.templateVersion) throw new TemplateError('속지 버전 정보가 없어요.')
  const asset = getTemplate(page.backgroundAssetId, page.templateVersion)
  return { backgroundAssetId: asset.id, templateVersion: asset.templateVersion }
}
