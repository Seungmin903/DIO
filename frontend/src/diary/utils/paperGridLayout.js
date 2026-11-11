// 속지 고르기 타일 격자(새 다이어리 · 페이지 추가). 한눈에 보기(gridLayout)와 같은 방식이다:
// 칸 최소 크기가 들어가는 만큼 한 줄에 놓고, 남는 폭은 칸을 최대 크기까지 늘려 나눈다. 칸 사이는 늘 같다.
// 예전 3열 고정(1/3 폭)은 태블릿에서 칸이 지나치게 넓었다(지라 796 후속).
//
// **열 수는 한 줄에 드는 만큼**이고 분류가 달라도 같다(사용자 2026-11-11). 그래야 분류를 넘겨도
// 칸이 같은 자리에서 시작해 격자가 흔들리지 않는다. 한때 줄마다 수를 고르게 나눠 봤는데
// (5종을 4 + 1 대신 3 + 2), 분류마다 격자 폭이 달라져 오른쪽이 들쭉날쭉했다.

export const PAPER_GRID_GAP = 4

// 칸 최소 폭 76: 가장 긴 기본 이름('데일리 플래너' · '스터디 플래너', 11.5/700)이 테두리 1.5 안에 잘리지 않는 폭(태블릿 실기기 2026-11-09, 73 에서 잘림)
const NAME_MIN = 76

/** 칸 크기 범위: 미리보기 폭 + 이름 자리. thumb: 미리보기 폭(세로 54 · 가로 72) */
export function paperCellRange(thumb) {
  return { min: Math.max(NAME_MIN, thumb + 12), max: Math.max(NAME_MIN, thumb + 12) + 24 }
}

/**
 * 격자 폭 · 속지 수 → { columns, cell, rows, empty, width }
 * 칸 크기도 열 수도 한 줄에 들어가는 최대 수(fit)로 정해, 분류가 달라도 같다.
 * fillTo: 분류를 바꿔도 높이가 같게 맞출 속지 수(가장 많은 분류). 그만큼의 줄 수가 되도록 빈 칸(empty)을 채운다.
 */
export function paperGridMetrics(width, count, thumb, { gap = PAPER_GRID_GAP, fillTo = 0 } = {}) {
  const { min, max } = paperCellRange(thumb)
  const fit = Math.max(1, Math.floor((width + gap) / (min + gap)))
  // 잰 폭은 반올림된 값이라 0.5 덜고 내려 마지막 칸이 다음 줄로 넘어가지 않게 한다
  const cell = Math.max(0, Math.min(max, Math.floor(((width - 0.5 - gap * (fit - 1)) / fit) * 100) / 100))
  const rowsFor = n => Math.ceil(n / fit)
  const rows = Math.max(1, rowsFor(count))
  const columns = fit
  const allRows = Math.max(rows, rowsFor(fillTo))
  // 빈 칸은 모자란 줄만 통째로 채운다(마지막 줄의 남는 자리는 비워 둔다)
  return { columns, cell, rows: allRows, empty: (allRows - rows) * columns, width: columns * cell + (columns - 1) * gap }
}
