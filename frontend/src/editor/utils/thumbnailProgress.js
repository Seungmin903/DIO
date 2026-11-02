// 이전에 표시한 요소 중 같은 참조로 남아 있는 앞부분만 재사용한다.
export function reusableThumbnailPrefix(previous, next, displayed) {
  const limit = Math.min(previous.length, next.length, displayed)
  let i = 0
  while (i < limit && previous[i] === next[i]) i++
  return i
}
