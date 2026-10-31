// 한눈에 보기(홈 · 검색 · 휴지통) 태블릿 격자 계산. 화면 부품과 떼어 두어 테스트한다.
// 기기를 가로로 들든 세로로 들든 표지 칸 크기와 칸 사이 간격은 같은 숫자를 쓰고, 폭에 따라 달라지는 것은 한 줄 권수뿐이다.
// 남는 폭은 오른쪽에 쌓지 않고 격자 전체를 가운데에 둬 좌우 여백이 늘 같다. (코덱스 결정 2026-10-31)

export const GRID_CELL_MAX = 212; // 표지 칸(정사각) 최대 크기
export const GRID_GAP_X = 20; // 칸 사이 가로 간격
export const GRID_GAP_Y = 32; // 줄 사이 세로 간격
export const LIBRARY_SIDE_PADDING = 30; // 본문 좌우 여백. 스타일(libraryScreen · libraryGridScroll)과 격자 폭 계산이 같은 값을 쓴다

/** 한 줄 권수: 안쪽 폭(메뉴와 좌우 여백을 뺀 격자 사용 폭, px) 기준 */
export function gridColumns(width) {
  if (width < 620) return 2;
  if (width < 850) return 3;
  if (width < 1040) return 4;
  return 5;
}

/** 격자 폭 → { columns, cell, gapX, width }. 칸은 최대 크기까지 두고, 좁으면 그 폭에 꼭 맞게 줄인다. */
export function gridMetrics(width) {
  const columns = gridColumns(width);
  const cell = Math.min(GRID_CELL_MAX, Math.max(0, Math.floor((width - (columns - 1) * GRID_GAP_X) / columns)));
  return { columns, cell, gapX: GRID_GAP_X, width: columns * cell + (columns - 1) * GRID_GAP_X };
}
