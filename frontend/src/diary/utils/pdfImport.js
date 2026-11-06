import { createId } from '../../editor/utils/common.js'
import { normalizeOrientation, templateCanvasSize } from '../../editor/templates/catalog.js'
import { normalizePaperAppearance } from '../../editor/templates/appearance.js'
import { normalizePdfSource } from './pdfSource.js'

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

export function pdfPageAspect(page, fallback = 0.75) {
  return Number.isFinite(page?.aspect) && page.aspect > 0 ? page.aspect : fallback
}

/**
 * 불러온 쪽을 표지와 속지로 나눈다. firstAsCover 이면 첫 쪽은 표지, 나머지가 속지.
 * 한 쪽짜리 PDF 를 표지로 쓰면 속지는 비는 것으로 본다.
 */
export function splitPdfPages(pages, firstAsCover, firstAlsoPaper = false) {
  if (!pages?.length) return { cover: null, papers: [] }
  if (!firstAsCover) return { cover: null, papers: pages }
  // firstAlsoPaper: 표지로 쓴 첫 쪽을 속지 1쪽으로도 넣는다.
  return { cover: pages[0], papers: firstAlsoPaper ? pages : pages.slice(1) }
}

const photoOf = page => ({ src: page.src, mediaFileId: page.mediaFileId, aspect: page.aspect })

const decorOf = cover => ({ band: cover.band, plate: cover.plate, title: cover.title, subtitle: cover.subtitle, stickers: cover.stickers })

/** 표지 꾸밈(고무줄 · 라벨 · 제목 · 소제목 · 스티커)을 모두 뺀다. */
function withoutCoverDecor(cover) {
  return {
    ...cover,
    band: { ...cover.band, on: false }, plate: 'none',
    title: { ...cover.title, useName: false, text: '' },
    subtitle: { ...cover.subtitle, on: false },
    stickers: [],
  }
}

/**
 * 표지의 바탕을 PDF 쪽 사진으로. PDF 쪽 그 자체가 표지이므로 기본은 표지 꾸밈을 모두 뺀다.
 * keepDecor 이면 고무줄 · 제목 · 스티커를 그대로 둔다.
 */
export function coverWithPdfPage(cover, page, { keepDecor = false } = {}) {
  const next = { ...cover, enabled: true, kind: 'photo', photo: photoOf(page) }
  return keepDecor ? next : withoutCoverDecor(next)
}

/** 나의 표지에 담을 표지: PDF 쪽 그림만 남기고 고무줄 · 라벨 · 제목 · 소제목 · 스티커는 모두 뺀다. */
export function coverForLibrary(cover) {
  return withoutCoverDecor(cover)
}

/** coverWithPdfPage 를 쓰기 전의 표지 바탕과 꾸밈. 끄면 이것으로 되돌린다. */
export function coverBackupOf(cover) {
  return { kind: cover.kind, enabled: cover.enabled, photo: cover.photo, decor: decorOf(cover) }
}

/**
 * 표지 바탕을 되돌린다 (backup = coverBackupOf 의 값).
 * 꾸밈은 PDF 표지로 바꾼 뒤 손대지 않았을 때만 되돌려 놓는다(그 사이에 사용자가 꾸민 것을 지우지 않는다).
 */
export function restoreCoverBase(cover, backup) {
  const restored = { ...cover, enabled: backup.enabled, kind: backup.kind === 'photo' && !backup.photo ? 'plain' : backup.kind, photo: backup.photo }
  const untouched = backup.decor && JSON.stringify(decorOf(cover)) === JSON.stringify(decorOf(withoutCoverDecor(cover)))
  return untouched ? { ...restored, ...backup.decor } : restored
}

// PDF 쪽 하나의 페이지 크기: 쪽 비율을 그대로 따르고 긴 변은 속지와 같은 1024. 너무 길쭉한 쪽은 3 : 1 까지만 따른다.
const PDF_PAGE_LONG_EDGE = 1024
const PDF_PAGE_MAX_ASPECT = 3
export function pdfPageCanvasSize(aspect, orientation) {
  if (!(aspect > 0)) return templateCanvasSize(orientation)
  const clamped = Math.min(PDF_PAGE_MAX_ASPECT, Math.max(1 / PDF_PAGE_MAX_ASPECT, aspect))
  return clamped >= 1
    ? { width: PDF_PAGE_LONG_EDGE, height: Math.round(PDF_PAGE_LONG_EDGE / clamped) }
    : { width: Math.round(PDF_PAGE_LONG_EDGE * clamped), height: PDF_PAGE_LONG_EDGE }
}

/**
 * PDF 쪽 하나 → 편집 문서 페이지. 페이지 크기는 쪽 비율을 따르고, 쪽 전체를 바탕 요소(backdrop) 하나로 깐다.
 * 바탕 요소는 선택 · 이동 · 지우기 대상이 아니라 속지처럼 동작하고, 그 위에 편집기에서 그대로 쓰기 · 붙이기를 한다.
 */
export function pdfDocPage(page, orientation, paperAppearance) {
  const canvas = pdfPageCanvasSize(page.aspect, orientation)
  const aspect = page.aspect > 0 ? page.aspect : canvas.width / canvas.height
  // 크기를 반올림해 생기는 1px 안쪽의 어긋남은 가장자리에 틈이 비치지 않게 페이지에 꽉 채운다.
  const exact = Math.abs(canvas.width / canvas.height - aspect) / aspect < 0.01
  const width = exact ? canvas.width : Math.min(canvas.width, canvas.height * aspect)
  const height = exact ? canvas.height : width / aspect
  // pdfSource: 원본 PDF 의 몇 번째 쪽인지. 확대하면 이 원본에서 보이는 영역을 다시 그린다(PdfDetail).
  const pdfSource = normalizePdfSource(page.pdfSource)
  return {
    id: createId(), paperAppearance: normalizePaperAppearance({ ...paperAppearance, backgroundColor: '#FFFFFF' }),
    canvasWidth: canvas.width, canvasHeight: canvas.height,
    objects: [{
      id: createId(), type: 'sticker', x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, w: width, h: height, rotation: 0,
      locked: true, backdrop: true, src: page.src, mediaFileId: page.mediaFileId, name: page.name ?? 'PDF', ...(pdfSource ? { pdfSource } : {}),
    }],
  }
}

/** 만든 문서의 페이지를 PDF 속지로 바꾼다. 쪽이 없으면 문서를 그대로 둔다. */
export function withPdfPages(doc, pages, orientation, paperAppearance) {
  if (!pages?.length) return doc
  return { ...doc, pages: pages.map(page => pdfDocPage(page, orientation, paperAppearance)) }
}

export const pdfPapersSummary = count => `PDF ${count}장`
