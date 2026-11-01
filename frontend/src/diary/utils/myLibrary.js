import { normalizeCover } from './coverDesign.js'
import { normalizeOrientation } from '../../editor/templates/catalog.js'
import { createId } from '../../editor/utils/common.js'

// 나의 표지 · 나의 속지: 기기에 두고 새 다이어리를 만들 때 꺼내 쓰는 보관함.
// 저장과 읽기는 호출하는 쪽이 한다(editor/services/storage 의 loadJSON · saveJSON). 여기는 값을 맞추고 목록을 고치는 계산만 둔다.
export const MY_LIBRARY_LIMIT = 30

const text = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : fallback
const hasMedia = page => page && typeof page.src === 'string' && typeof page.mediaFileId === 'string' && page.mediaFileId

/** 저장된 값 → 쓸 수 있는 나의 표지 목록. 잘못된 항목은 버린다. */
export function normalizeMyCovers(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  return raw.flatMap(item => {
    if (!item || typeof item.id !== 'string' || seen.has(item.id) || !item.cover || typeof item.cover !== 'object') return []
    seen.add(item.id)
    const cover = normalizeCover({ cover: item.cover })
    return [{ id: item.id, name: text(item.name, '나의 표지'), createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
      orientation: item.orientation ? normalizeOrientation(item.orientation) : guessCoverOrientation(cover), cover }]
  })
}

// 방향을 저장하기 전에 넣은 표지: 나의 표지는 PDF 첫 쪽을 표지 바탕으로 쓴 것만 담기므로 그 사진 비율로 방향을 짐작한다
const guessCoverOrientation = cover => (cover.photo?.aspect >= 1 ? 'landscape' : 'portrait')

/** 저장된 값 → 쓸 수 있는 나의 속지 목록. 쪽이 하나도 없는 묶음은 버린다. */
export function normalizeMyPapers(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  return raw.flatMap(item => {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) return []
    const pages = (Array.isArray(item.pages) ? item.pages : []).filter(hasMedia)
      .map(page => ({ src: page.src, mediaFileId: page.mediaFileId, aspect: Number.isFinite(page.aspect) && page.aspect > 0 ? page.aspect : 0.75, name: text(page.name, 'PDF') }))
    if (!pages.length) return []
    seen.add(item.id)
    return [{ id: item.id, name: text(item.name, '나의 속지'), createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
      orientation: normalizeOrientation(item.orientation), pages }]
  })
}

// 새 항목은 맨 앞에 두고 한도를 넘는 오래된 항목은 뺀다.
const prepend = (list, entry) => [entry, ...list].slice(0, MY_LIBRARY_LIMIT)

export function addMyCover(list, { name, orientation, cover }, now = new Date()) {
  return prepend(list, { id: createId(), name: text(name, '나의 표지'), createdAt: now.toISOString(), orientation: normalizeOrientation(orientation), cover })
}

export function addMyPaper(list, { name, orientation, pages }, now = new Date()) {
  return prepend(list, { id: createId(), name: text(name, '나의 속지'), createdAt: now.toISOString(), orientation: normalizeOrientation(orientation), pages })
}

export const removeEntry = (list, id) => list.filter(item => item.id !== id)
