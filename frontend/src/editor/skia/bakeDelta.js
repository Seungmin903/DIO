// 앱 획 층(CompletedStrokeLayer.native)이 구운 그림을 통째로 다시 만들지 않으려고 바뀐 자리만 가려내는 순수 함수들.

// next 가 previous 에서 획 몇 개만 빠진 같은 순서의 목록이면 빠진 획들을, 아니면 null (추가 · 교체 · 순서 바뀜이 있으면 다시 굽는다)
export function removedBetween(previous, next) {
  const removed = []
  let kept = 0
  for (const object of previous) {
    if (kept < next.length && next[kept] === object) kept++
    else removed.push(object)
  }
  return kept === next.length && removed.length ? removed : null
}

// 획이 칠한 범위: 회전해도 벗어나지 않게 상자 대각선 반지름의 원에 연필 알갱이가 번지는 여유를 더한다(페이지 좌표)
const BLEED = 8
export function reachOf(object) {
  const w = object.w ?? 0, h = object.h ?? 0
  return { x: (object.x ?? 0) + w / 2, y: (object.y ?? 0) + h / 2, r: Math.hypot(w, h) / 2 + BLEED }
}
export const reachTouches = (a, b) => Math.abs(a.x - b.x) <= a.r + b.r && Math.abs(a.y - b.y) <= a.r + b.r

// 두 목록이 같은 요소(같은 참조)로 이뤄졌는지
export const sameObjects = (a, b) => a.length === b.length && a.every((object, i) => object === b[i])
