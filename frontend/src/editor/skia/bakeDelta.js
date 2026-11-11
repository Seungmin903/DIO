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

// ── 굽는 창 ─────────────────────────────────────────────────────────────
// 굽기 값은 거의 전부가 GPU→CPU 읽어오기라 **픽셀 수에 정비례**한다(실측 2026-11-10: 2400만 px 767ms
// = 32ns/px). 페이지 전체를 확대 배율로 구우면 확대 3배에서 2400만 px 인데 화면에 보이는 건 400만 px
// 뿐이라 6배를 버린다. 그래서 **보이는 범위만** 굽는다.
// 여유(WIN_PAD)를 두고 격자(WIN_GRID)에 맞춰 잘라, 조금 밀 때마다 창이 바뀌지 않게 한다.
export const WIN_PAD = 0.3, WIN_GRID = 160
const snapDown = v => Math.floor(v / WIN_GRID) * WIN_GRID
const snapUp = v => Math.ceil(v / WIN_GRID) * WIN_GRID
export function bakeWindow(visible, width, height) {
  if (!visible) return { x: 0, y: 0, w: width, h: height }   // 썸네일 · 내보내기는 보이는 범위가 없다
  const padX = visible.width * WIN_PAD, padY = visible.height * WIN_PAD
  const x = Math.max(0, snapDown(visible.x - padX)), y = Math.max(0, snapDown(visible.y - padY))
  const x1 = Math.min(width, snapUp(visible.x + visible.width + padX))
  const y1 = Math.min(height, snapUp(visible.y + visible.height + padY))
  return { x, y, w: Math.max(1, x1 - x), h: Math.max(1, y1 - y) }
}
export const sameWin = (a, b) => Boolean(a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)
// 획이 칠한 범위(reachOf)가 창 **안에 온전히** 들어오면 굽고, 창 **테두리에 걸치면** 벡터로 그린다.
// 걸친 획을 굽기까지 하면 같은 획이 두 번 그려져 겹친 자리가 진해진다 - 둘 중 하나만 한다.
// 창에 아예 안 닿는 획은 화면 밖이라 그리지 않는다(창은 보이는 범위보다 넓다).
export const insideWin = (a, w) => a.x - a.r >= w.x && a.y - a.r >= w.y && a.x + a.r <= w.x + w.w && a.y + a.r <= w.y + w.h
export const touchesWin = (a, w) => a.x + a.r > w.x && a.y + a.r > w.y && a.x - a.r < w.x + w.w && a.y - a.r < w.y + w.h
export const bakedIn = (objects, win) => objects.filter(object => insideWin(reachOf(object), win))
export const atEdge = (objects, win) => objects.filter(object => { const a = reachOf(object); return touchesWin(a, win) && !insideWin(a, win) })
// 지난 창(old)에 안 구워졌으면서 지금 창(now)에는 보이는 획 - 창이 바뀐 직후 빈자리를 벡터로 메운다
export const notBaked = (objects, old, now) => objects.filter(object => { const a = reachOf(object); return !insideWin(a, old) && touchesWin(a, now) })
// 창이 페이지를 다 덮으면(화면에 맞춤 등) 창 밖이 없다 - 창 밖 바탕을 굽지 않는다
export const coversPage = (win, width, height) => win.x <= 0 && win.y <= 0 && win.w >= width && win.h >= height

// 쓰던 창을 그대로 더 쓸 수 있나. 확대하면 보이는 범위가 **좁아져** 이미 구운 창 안에 들어온다 —
// 그때 창을 새로 잡으면 화면의 모든 획을 다시 래스터화한다(실측 2026-11-10 실기: 195획 417ms,
// 그중 GPU 읽어오기는 19ms 뿐 - 나머지는 전부 다시 그리는 값이다). 들어오면 그냥 쓴다.
// 다만 너무 헐렁한 창을 계속 들고 있으면 쓸데없이 넓은 데를 높은 배율로 굽게 되어 픽셀 상한에 걸리고
// 오히려 흐려진다 - 필요한 넓이의 세 배를 넘으면 다시 잡는다.
export const KEEP_WINDOW_SLACK = 3
export function keepWindow(old, want) {
  if (!old) return false
  const inside = want.x >= old.x && want.y >= old.y
    && want.x + want.w <= old.x + old.w && want.y + want.h <= old.y + old.h
  return inside && old.w * old.h <= KEEP_WINDOW_SLACK * want.w * want.h
}
// 굽는 배율은 화면 배율 **이상으로** 한 옥타브 네 칸에 맞춰 올린다. 그대로 쓰면 확대를 조금만 움직여도
// 배율이 달라져 전부 다시 굽는다. 올림이라 구운 그림이 늘 화면보다 촘촘해, 줄여 그려지므로 흐려지지 않는다.
// 한 칸이 약 19%라 픽셀은 최대 1.4배 더 든다.
export const SCALE_STEPS = 4
export const stepUpScale = scale => Math.pow(2, Math.ceil(Math.log2(Math.max(0.05, scale)) * SCALE_STEPS) / SCALE_STEPS)

// 쓰던 배율을 그대로 더 쓸 수 있나. 축소하면 필요한 배율이 **내려가는데**, 쓰던 그림은 그보다 촘촘하니
// 줄여 그리면 그만이다 - 그런데도 배율이 달라졌다고 다시 구우면 화면의 모든 획을 다시 래스터화한다.
// 다만 지나치게 촘촘한 그림을 계속 들고 있으면 메모리가 아깝다(한 장이 수십 MB다) - 여유를 넘으면 다시 잡는다.
export const SCALE_SLACK = 1.5
export const keepScale = (have, want) => Boolean(have) && have >= want && have <= want * SCALE_SLACK
