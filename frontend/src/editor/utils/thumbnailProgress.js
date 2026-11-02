// 이전에 표시한 요소 중 같은 참조로 남아 있는 앞부분만 재사용한다.
export function reusableThumbnailPrefix(previous, next, displayed) {
  // 같은 위치의 요소를 수정한 경우 이미 표시한 나머지는 그대로 유지한다.
  if (previous.length === next.length && previous.every((object, i) => object.id != null && object.id === next[i].id)) {
    return Math.min(displayed, next.length)
  }
  const limit = Math.min(previous.length, next.length, displayed)
  let i = 0
  while (i < limit && previous[i] === next[i]) i++
  return i
}
