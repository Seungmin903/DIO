// 연필 그림(PencilSkiaStroke)을 화면 갱신마다 시간 예산 안에서만 그리게 한다 — 페이지를 열 때 획이 수십 개 한꺼번에 나타나도 한 갱신이 길게 멈추지 않게,
// 예산을 넘는 획은 SVG 그림으로 먼저 보였다가 다음 틱에 Skia 그림으로 바뀐다.
const BUDGET_MS = 24
let frameStart = 0, spent = 0
export const withinBudget = () => {
  const now = performance.now()
  if (now - frameStart > 40) { frameStart = now; spent = 0 }
  return spent < BUDGET_MS
}
export const spend = ms => { spent += ms }
// 불투명도 · 배율만 바뀐 그림은 이전 그림을 보여 두고 값이 멈춘 뒤 한 번만 굽는다(슬라이더를 끄는 동안 값마다 굽지 않게)
export const REBAKE_DELAY_MS = 150
// 화면 배율은 1/8 단계로 맞춰 확대 중 매번 새로 그리지 않게 한다
export const quantizeScale = value => Math.max(0.25, Math.round(value * 8) / 8)
