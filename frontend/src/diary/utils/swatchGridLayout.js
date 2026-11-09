// 표지 색 견본 격자(SwatchGrid) 칸 크기. 화면 부품과 떼어 두어 테스트한다.
// 견본 6 + 직접 고르기 1 = 한 줄 7칸. 칸 36 + 사이 4 이상(위아래 터치 48, 좌우 터치 여유는 사이 폭의 절반까지 — SwatchSlop).
// 넓을 때는 칸(36)을 그대로 두고 사이를 넓혀 7번째 칸 오른쪽 끝을 줄 끝에 맞춘다.
// 폭이 276(= 36 * 7 + 4 * 6)보다 좁으면(작은 폰) 칸 수를 줄여 5 + 2 처럼 줄이 갈라지지 않게, 7칸을 지키고 칸을 MIN_CELL 까지 줄인다(지라 796).
export const GRID_COLUMNS = 7
export const SWATCH_CELL = 36, SWATCH_GAP = 4, SWATCH_MIN_CELL = 30

/** 격자 폭 → { cell, gap }. 재기 전(width 0)에는 기본 칸 · 사이 */
export function swatchGridLayout(width) {
  if (!width) return { cell: SWATCH_CELL, gap: SWATCH_GAP }
  // 잰 폭은 반올림된 값이라 0.5 덜어 마지막 칸이 다음 줄로 넘어가지 않게 한다
  const room = width - 0.5
  const cell = Math.max(SWATCH_MIN_CELL, Math.min(SWATCH_CELL, Math.floor((room - SWATCH_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS)))
  const gap = Math.max(0, Math.floor(((room - cell * GRID_COLUMNS) / (GRID_COLUMNS - 1)) * 100) / 100)
  return { cell, gap }
}
