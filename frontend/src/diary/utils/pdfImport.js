import { createId } from '../../editor/utils/common.js'
import { normalizeOrientation, templateCanvasSize } from '../../editor/templates/catalog.js'
import { normalizePaperAppearance } from '../../editor/templates/appearance.js'

// PDF 불러오기: 쪽마다 그림으로 바꿔 미디어 보관함에 저장한 뒤(pdfPages.*), 표지와 속지로 나눠 쓴다.
// 여기는 렌더러와 상관없는 순수 계산만 둔다.
export const PDF_PAGE_LIMIT = 60
// 한 쪽을 그림으로 바꿀 때 긴 변 픽셀 수. 미디어 표시본 한도(3072)에 맞춰 태블릿에서 확대해도 글씨가 흐리지 않게 한다.
export const PDF_RENDER_EDGE = 3000

export class PdfImportError extends Error {
  constructor(code, message, cause) { super(message); this.name = 'PdfImportError'; this.code = code; this.cause = cause }
}

/** 첫 쪽 비율(가로 / 세로)로 방향을 정한다. */
export const pdfOrientation = aspect => normalizeOrientation(aspect >= 1 ? 'landscape' : 'portrait')

/**
 * 불러온 쪽을 표지와 속지로 나눈다. firstAsCover 이면 첫 쪽은 표지, 나머지가 속지.
 * 한 쪽짜리 PDF 를 표지로 쓰면 속지는 비는 것으로 본다.
 */
export function splitPdfPages(pages, firstAsCover) {
  if (!pages?.length) return { cover: null, papers: [] }
  return firstAsCover ? { cover: pages[0], papers: pages.slice(1) } : { cover: null, papers: pages }
}

const photoOf = page => ({ src: page.src, mediaFileId: page.mediaFileId, aspect: page.aspect })

/** 표지의 바탕을 PDF 쪽 사진으로. 고무줄 · 제목 · 스티커는 그대로 둔다. */
export function coverWithPdfPage(cover, page) {
  return { ...cover, enabled: true, kind: 'photo', photo: photoOf(page) }
}

/** 표지 바탕을 되돌린다 (backup = coverWithPdfPage 를 쓰기 전의 { kind, enabled, photo }). */
export function restoreCoverBase(cover, backup) {
  return { ...cover, enabled: backup.enabled, kind: backup.kind === 'photo' && !backup.photo ? 'plain' : backup.kind, photo: backup.photo }
}

/**
 * PDF 쪽 하나 → 편집 문서 페이지. 쪽 전체를 잠근 그림 하나로 깔고(비율은 그대로, 남는 곳은 흰 종이),
 * 그 위에 편집기에서 그대로 쓰기·붙이기를 한다.
 */
export function pdfDocPage(page, orientation, paperAppearance) {
  const canvas = templateCanvasSize(orientation)
  const aspect = page.aspect > 0 ? page.aspect : canvas.width / canvas.height
  const width = Math.min(canvas.width, canvas.height * aspect)
  const height = width / aspect
  return {
    id: createId(), paperAppearance: normalizePaperAppearance({ ...paperAppearance, backgroundColor: '#FFFFFF' }),
    canvasWidth: canvas.width, canvasHeight: canvas.height,
    objects: [{
      id: createId(), type: 'sticker', x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, w: width, h: height, rotation: 0,
      locked: true, src: page.src, mediaFileId: page.mediaFileId, name: page.name ?? 'PDF',
    }],
  }
}

/** 만든 문서의 페이지를 PDF 속지로 바꾼다. 쪽이 없으면 문서를 그대로 둔다. */
export function withPdfPages(doc, pages, orientation, paperAppearance) {
  if (!pages?.length) return doc
  return { ...doc, pages: pages.map(page => pdfDocPage(page, orientation, paperAppearance)) }
}

export const pdfPapersSummary = count => `PDF ${count}장`
