// 페이지 썸네일을 나눠 그릴 때 이미 보인 요소(id)는 계속 보여 주고 새 요소만 순서대로 보탠다.
// 예전에는 앞에서부터 같은 참조인 부분만 재사용해서, 지우개로 중간 획 하나만 지워도 그 뒤 획이 전부 사라졌다가 3개씩 다시 그려졌다(2026-11-03 실기: 지울 때마다 썸네일이 비었다 채워짐).

// objects 중 이미 보인(shown) 요소만, 원래 순서대로
export const visibleThumbnailObjects = (objects, shown) => objects.filter(object => shown.has(object.id))

// 아직 안 보인 요소 중 앞에서 count 개를 보태고, 사라진 요소의 id 는 버린 새 집합
export function revealThumbnailObjects(objects, shown, count) {
  const next = new Set()
  let added = 0
  for (const object of objects) {
    if (shown.has(object.id)) next.add(object.id)
    else if (added < count) { next.add(object.id); added++ }
  }
  return next
}

export const hasUnseenThumbnailObjects = (objects, shown) => objects.some(object => !shown.has(object.id))
