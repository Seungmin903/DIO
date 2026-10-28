import { colorTemplateXml, normalizePaperAppearance } from '../templates/appearance.js'
import { pageSize } from './pageGeometry.js'
import { templateReference } from '../templates/catalog.js'
import { isStudyPlannerId, studyPlannerSvg } from '../templates/studyPlanner.js'
import { normalizeTextLink } from './textFormats.js'
import { EDITOR_SHAPES, SHAPE_BORDER_STYLES } from './editorShapes.js'
import { RETIRED_TEXT_FONTS, TEXT_FONTS } from './text.js'

/** 화면 줌·선택 상태·저장 지연과 독립적인 출력 입력. 현재 로컬 요소 배열은 뒤→앞 순서다. */
export class PageExportError extends Error {
  constructor(code, message, cause) { super(message); this.name = 'PageExportError'; this.code = code; this.cause = cause }
}

export function createExportSnapshot(page, { width = pageSize(page).width, height = pageSize(page).height, scale = 1 } = {}) {
  if (![width, height, scale].every((n) => Number.isFinite(n) && n > 0)) throw new PageExportError('EXPORT_SIZE_INVALID', '페이지 크기를 확인해 주세요.')
  const ratio = Math.min(scale, 4096 / width, 4096 / height, Math.sqrt(8000000 / (width * height)))
  const pixelWidth = Math.max(1, Math.floor(width * ratio)), pixelHeight = Math.max(1, Math.floor(height * ratio))
  if (!page || !Array.isArray(page.objects)) throw new PageExportError('EXPORT_PAGE_INVALID', '페이지를 읽지 못했어요.')
  const objects = page.objects.filter((o) => !o.hidden && o.opacity !== 0).map((object) => {
    if (!['photo', 'sticker', 'tape', 'stroke', 'text', 'shape'].includes(object.type)) throw new PageExportError('EXPORT_ELEMENT_UNSUPPORTED', '아직 내보낼 수 없는 요소가 있어요.')
    if (object.type === 'text' && (typeof object.text !== 'string' || !Number.isFinite(object.baseWidth) || object.baseWidth <= 0)) throw new PageExportError('EXPORT_GEOMETRY_INVALID', '텍스트 내용을 확인해 주세요.')
    if (['text','shape'].includes(object.type) && (
      (object.colorRanges != null && (!Array.isArray(object.colorRanges) || object.colorRanges.some((r, i, list) => !r || !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end > object.text.length || r.start >= r.end || !/^#[0-9a-f]{6}$/i.test(r.color) || (i > 0 && list[i - 1].end > r.start)))) ||
      (object.styleRanges != null && (!Array.isArray(object.styleRanges) || object.styleRanges.some((r, i, list) => !r || !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 0 || r.end > object.text.length || r.start >= r.end || (i > 0 && list[i - 1].end > r.start) || (r.fontSize == null && !r.href) || (r.fontSize != null && (!Number.isFinite(r.fontSize) || r.fontSize < 8 || r.fontSize > 96)) || (r.href != null && (typeof r.href !== 'string' || !normalizeTextLink(r.href)))))) ||
      (object.fontSize != null && (!Number.isFinite(object.fontSize) || object.fontSize < 8 || object.fontSize > 96)) ||
      // 글꼴 목록의 글꼴(앱에 넣은 한국어 글꼴 포함)과 예전 문서의 고정폭(mono)만 받는다
      (object.font != null && !RETIRED_TEXT_FONTS.includes(object.font) && !TEXT_FONTS.some((font) => font.id === object.font)) ||
      (object.textAlign != null && !['left', 'center', 'right', 'justify'].includes(object.textAlign))
    )) throw new PageExportError('EXPORT_GEOMETRY_INVALID', '텍스트 서식을 확인해 주세요.')
    if (object.type === 'shape' && (
      (object.verticalAlign != null && !['top','middle','bottom'].includes(object.verticalAlign)) ||
      !EDITOR_SHAPES.some(item => item.id === object.shape) || typeof object.text !== 'string' ||
      (object.fill !== 'none' && !/^#[0-9a-f]{6}$/i.test(object.fill)) ||
      !/^#[0-9a-f]{6}$/i.test(object.borderColor) || !/^#[0-9a-f]{6}$/i.test(object.color) ||
      !Number.isFinite(object.borderWidth) || object.borderWidth < 0 || object.borderWidth > 16 ||
      !SHAPE_BORDER_STYLES.some(item=>item.id===object.borderStyle) ||
      !Number.isFinite(object.fontSize) || object.fontSize < 8 || object.fontSize > 96 ||
      !['left','center','right','justify'].includes(object.align) ||
      !TEXT_FONTS.some(font => font.id === object.font)
    )) throw new PageExportError('EXPORT_GEOMETRY_INVALID', '도형 내용을 확인해 주세요.')
    if (object.type === 'stroke' && (
      !Array.isArray(object.points) || !object.points.length ||
      object.points.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y) || (p.pressure != null && (!Number.isFinite(p.pressure) || p.pressure <= 0 || p.pressure > 2.3))) ||
      ![object.baseWidth, object.baseHeight, object.strokeWidth].every((n) => Number.isFinite(n) && n > 0) ||
      (object.penKind === 'highlighter' && !['round', 'square'].includes(object.lineCap))
    )) throw new PageExportError('EXPORT_GEOMETRY_INVALID', '필기 좌표를 확인해 주세요.')
    if (![object.x, object.y, object.w, object.h, object.rotation ?? 0].every(Number.isFinite) || object.w <= 0 || object.h <= 0) throw new PageExportError('EXPORT_GEOMETRY_INVALID', '요소의 위치와 크기를 확인해 주세요.')
    return JSON.parse(JSON.stringify(object))
  })
  let template
  try { template = templateReference(page) }
  catch (error) { throw new PageExportError('EXPORT_TEMPLATE_FAILED', error.message, error) }
  // 종이색과 SVG 참조를 분리한다. 배경은 사용자 요소나 보조 UI가 아니다.
  return { pageId: page.id, width, height, pixelWidth, pixelHeight, background: normalizePaperAppearance(page.paperAppearance).backgroundColor, paperAppearance: normalizePaperAppearance(page.paperAppearance), template, objects, ...(page.planner ? { planner: JSON.parse(JSON.stringify(page.planner)) } : {}) }
}

/** 출력 작업이 만든 임시 참조만 소유한다. 화면 표시 캐시/원본 파일은 건드리지 않는다. */
export async function prepareExportSnapshot(snapshot, resolveImage, resolveTemplate) {
  const resources = []
  const cache = new Map()
  const keyOf = (o) => o.mediaFileId ? `media:${o.mediaFileId}` : o.asset ? `asset:${o.asset}` : o.src
  const usages = new Map()
  snapshot.objects.forEach((o) => { const key = keyOf(o); if (key) usages.set(key, [...(usages.get(key) ?? []), o]) })
  try {
    let backgroundXml = null
    if (snapshot.template) {
      try {
        if (!resolveTemplate) throw new Error('Missing template resolver')
        const planner = isStudyPlannerId(snapshot.template.backgroundAssetId)
        backgroundXml = planner ? studyPlannerSvg(snapshot.template.backgroundAssetId.endsWith('portrait') ? 'portrait' : 'landscape', snapshot.planner) : await resolveTemplate(snapshot.template)
        if (!backgroundXml) throw new Error('Empty template')
        backgroundXml = colorTemplateXml(backgroundXml, snapshot.paperAppearance)
      } catch (error) { throw new PageExportError('EXPORT_TEMPLATE_FAILED', '속지를 준비하지 못했어요. 다시 시도해 주세요.', error) }
    }
    const objects = []
    for (const object of snapshot.objects) {
      const key = keyOf(object)
      if (!key) { objects.push(object); continue }
      let resource = cache.get(key)
      if (!resource) {
        try { resource = await resolveImage(object, usages.get(key)) }
        catch (error) {
          if (['EXPORT_GIF_DECODE_FAILED', 'EXPORT_GIF_TOO_LARGE'].includes(error?.code)) throw new PageExportError(error.code, `‘${object.name || object.asset || object.id}’ ${error.message}`, error)
          throw error
        }
        resources.push(resource)
        cache.set(key, resource)
      }
      objects.push({ ...object, src: resource.uri, mediaFileId: undefined, asset: undefined, poster: undefined })
    }
    let active = true
    return { ...snapshot, backgroundXml, objects, rasterWarnings: [...cache.entries()].filter(([, resource]) => resource.qualityWarning).map(([key, resource]) => ({ key, reason: resource.qualityWarning })), dispose() { if (!active) return; active = false; resources.forEach((r) => r.dispose?.()) } }
  } catch (error) {
    resources.forEach((r) => r.dispose?.())
    if (error instanceof PageExportError) throw error
    throw new PageExportError('EXPORT_MEDIA_FAILED', '이미지를 준비하지 못했어요. 원본을 확인한 뒤 다시 시도해 주세요.', error)
  }
}
