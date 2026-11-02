import { normalizePaperAppearance } from './appearance.js'

/**
 * 이미 있는 다이어리에 속지를 새로 넣을 때의 속지 설정.
 * 그 다이어리가 글꼴을 한 번도 고르지 않았으면(옛 마루부리 그대로) 꾸미기 공방의 기본 속지 글꼴을 따른다.
 * 다이어리에서 글꼴을 직접 골랐으면 그 선택이 우선이고, 색 · 선 색은 늘 다이어리 설정을 따른다.
 * 바꿀 것이 없으면 null(리듀서가 문서 설정을 그대로 쓴다).
 */
export function newPageAppearance(docAppearance, defaultStyle) {
  const doc = normalizePaperAppearance(docAppearance)
  const font = normalizePaperAppearance(defaultStyle).font
  return !doc.font && font ? { ...doc, font } : null
}
