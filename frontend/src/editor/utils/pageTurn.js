// 읽기 모드 책장 넘기기의 순수 판정. 화면 코드와 분리해 단위 테스트한다.
export const TURN_DRAG_SPAN = 0.9 // 페이지 폭의 이만큼 끌면 끝까지 넘어간다
export const TURN_FINISH_RATIO = 0.3 // 놓을 때 이만큼 넘어갔으면 마저 넘긴다
export const TURN_FLICK_SPEED = 0.4 // dp/ms. 이보다 빠르게 끌었으면 덜 넘어갔어도 마저 넘긴다
export const TURN_STRAIGHT_BAND = 0.25 // 가운데 이 범위 안은 곧은 접힘선
export const TURN_CORNER_SPAN = 0.35 // 화면 가운데에서 이만큼 떨어지면 모서리를 잡은 것으로 본다

/** 손가락을 처음 댄 높이(0 위 ~ 1 아래)를 접힘선 기울기 lift(-1 위 모서리 · 0 가운데 · 1 아래 모서리)로. 가운데 근처는 곧게 접는다. */
export function turnLift(y) {
  if (!Number.isFinite(y)) return 0
  const lift = Math.max(-1, Math.min(1, (y - 0.5) / TURN_CORNER_SPAN))
  return Math.abs(lift) < TURN_STRAIGHT_BAND ? 0 : lift
}

/** 손가락 이동량 dx 가 만든 넘김 진행도 0~1. dir 1 은 왼쪽으로, -1 은 오른쪽으로 끌어야 진행된다. 반대로 끌면 0 이다. */
export function turnProgress({ dir, dx, width }) {
  if (!(width > 0)) return 0
  return Math.max(0, Math.min(1, (dir > 0 ? -dx : dx) / (width * TURN_DRAG_SPAN)))
}

/** 손을 놓았을 때 끝까지 넘길지. 취소(cancel)는 항상 되돌린다. */
export function turnShouldComplete({ progress, dir, dx, duration, cancelled = false }) {
  if (cancelled) return false
  const flick = Math.abs(dx) / Math.max(1, duration) > TURN_FLICK_SPEED && (dir > 0 ? dx < 0 : dx > 0)
  return progress > TURN_FINISH_RATIO || flick
}

/** 넘길 쪽 페이지가 없을 때 알릴 문구. 있으면 null. */
export function readingEdgeMessage(index, count) {
  if (index < 0) return '첫 페이지입니다'
  if (index >= count) return '마지막 페이지입니다'
  return null
}
