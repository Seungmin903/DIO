import { createId } from '../utils/common.js'
import { ANNUAL_PAGE_IDS, TEMPLATE_VERSION, getTemplate } from '../templates/catalog.js'

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
    pages: ANNUAL_PAGE_IDS.map(createTemplatePage),
  }
}

// 기존 호출자와 저장 문서용 흰 종이. 새 UI는 공용 속지를 명시해서 추가한다.
export function createBlankPage() { return { id: createId(), objects: [] } }
