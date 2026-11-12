// 바탕 요소: PDF 쪽처럼 속지 자리에 깔리는 그림. 요소 목록에 들어 있지만 선택 · 이동 · 지우기 대상이 아니고 레이어 패널에도 나오지 않는다.
// (속지 SVG 바탕과 달리 요소라서 내보내기 · 썸네일 · 저장이 그대로 쓴다.)
export const isBackdrop = object => object?.backdrop === true

/** PDF 바탕을 논리 페이지 안에 원본 비율로 맞춘다. 저장된 요소와 화면 배율은 건드리지 않는다. */
export function fitBackdropToPage(object, pageWidth, pageHeight) {
  if (!isBackdrop(object) || ![object.w, object.h, pageWidth, pageHeight].every(size => Number.isFinite(size) && size > 0)) return object
  const scale = Math.min(pageWidth / object.w, pageHeight / object.h)
  const w = Math.min(pageWidth, object.w * scale), h = Math.min(pageHeight, object.h * scale)
  const x = (pageWidth - w) / 2, y = (pageHeight - h) / 2
  if (object.x === x && object.y === y && object.w === w && object.h === h && object.rotation === 0) return object
  return { ...object, x, y, w, h, rotation: 0 }
}

/** 바탕 요소는 항상 맨 아래. 다른 요소를 맨 뒤로 보내거나 레이어를 끌어 놓아도 바탕 아래로 내려가지 않는다. */
export function keepBackdropBottom(objects) {
  if (!objects.some(isBackdrop)) return objects
  const backdrops = objects.filter(isBackdrop)
  const rest = objects.filter(object => !isBackdrop(object))
  const ordered = [...backdrops, ...rest]
  return ordered.every((object, index) => object === objects[index]) ? objects : ordered
}
