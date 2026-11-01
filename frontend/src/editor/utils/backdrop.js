// 바탕 요소: PDF 쪽처럼 속지 자리에 깔리는 그림. 요소 목록에 들어 있지만 선택 · 이동 · 지우기 대상이 아니고 레이어 패널에도 나오지 않는다.
// (속지 SVG 바탕과 달리 요소라서 내보내기 · 썸네일 · 저장이 그대로 쓴다.)
export const isBackdrop = object => object?.backdrop === true

/** 바탕 요소는 항상 맨 아래. 다른 요소를 맨 뒤로 보내거나 레이어를 끌어 놓아도 바탕 아래로 내려가지 않는다. */
export function keepBackdropBottom(objects) {
  if (!objects.some(isBackdrop)) return objects
  const backdrops = objects.filter(isBackdrop)
  const rest = objects.filter(object => !isBackdrop(object))
  const ordered = [...backdrops, ...rest]
  return ordered.every((object, index) => object === objects[index]) ? objects : ordered
}
