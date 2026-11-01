// 한눈에 보기(홈 · 검색 · 휴지통) 태블릿 격자 계산. 화면 부품과 떼어 두어 테스트한다.
// 기기를 가로로 들든 세로로 들든 칸 사이 간격은 같고, 폭에 따라 달라지는 것은 한 줄 권수와 그 권수에 맞춘 칸 크기다.

// 앱 디자인 점검 원 페이저 02(2026-11-01): 5열 고정 대신 표지 폭 154~172(세로 표지 = 칸의 약 0.74배 → 정사각 칸 208~232)의 유동 격자, 칸 사이 32.
// 권수는 칸이 최소 크기 아래로 내려가지 않는 만큼만 놓고, 격자는 제목 왼쪽 선에 맞춰 왼쪽부터 채운다.
// 최대 칸은 264(코덱스 2026-11-01): 232 에서 멈추면 태블릿 가로(4열)에서 오른쪽이 100px 쯤 비어 보였다. 칸을 키워 양끝을 맞추고 간격은 32 그대로 둔다.
// 세로 창의 최소 칸은 180(docs/한눈에 보기 가로 세로, 코덱스 2026-11-01): 208 이면 갤럭시 탭 세로(800)가 큰 표지 2권 + 오른쪽 102 빈칸이 됐다.
// 굿노트처럼 세로에서도 3열을 지키고, 가로는 지금 권수 그대로 둔다. 180 은 3열까지만 쓰고 4열부터는 가로와 같은 208 이 들어갈 때만 놓는다
// (코덱스 검수: 1024 세로가 4열 197 이 되면 834 세로 3열 210 보다 넓은 화면에서 표지가 더 작아져 리듬이 깨진다).
// 한 줄을 다 못 채운 마지막 줄만 왼쪽부터 놓여 오른쪽이 빈다.
export const GRID_CELL_MIN = 208; // 표지 칸(정사각) 최소 크기 — 가로 창
export const GRID_CELL_MIN_PORTRAIT = 180; // 세로 창(높이 > 폭)에서 3열까지 쓰는 최소 칸
const PORTRAIT_COLUMNS = 3; // GRID_CELL_MIN_PORTRAIT 로 늘릴 수 있는 최대 권수
export const GRID_CELL_MAX = 264; // 표지 칸(정사각) 최대 크기
export const GRID_GAP_X = 32; // 칸 사이 가로 간격
export const GRID_GAP_Y = 32; // 줄 사이 세로 간격
export const LIBRARY_SIDE_PADDING = 30; // 본문 좌우 여백. 스타일(libraryScreen · libraryGridScroll)과 격자 폭 계산이 같은 값을 쓴다

/** 한 줄 권수: 안쪽 폭(메뉴와 좌우 여백을 뺀 격자 사용 폭, px) 안에 최소 칸이 들어가는 만큼(최소 2). portrait: 창이 세로인지 */
export function gridColumns(width, portrait = false) {
  const fit = min => Math.floor((width + GRID_GAP_X) / (min + GRID_GAP_X));
  return Math.max(2, fit(GRID_CELL_MIN), portrait ? Math.min(PORTRAIT_COLUMNS, fit(GRID_CELL_MIN_PORTRAIT)) : 0);
}

/** 격자 폭 → { columns, cell, gapX, width }. 칸은 최대 크기까지 두고, 좁으면 그 폭에 꼭 맞게 줄인다. */
export function gridMetrics(width, portrait = false) {
  const columns = gridColumns(width, portrait);
  const cell = Math.min(GRID_CELL_MAX, Math.max(0, Math.floor((width - (columns - 1) * GRID_GAP_X) / columns)));
  return { columns, cell, gapX: GRID_GAP_X, width: columns * cell + (columns - 1) * GRID_GAP_X };
}

// 회전해서 한 줄 권수가 바뀌어도 보던 다이어리를 잃지 않게, 스크롤 좌표 대신 '화면 맨 위에 걸린 줄의 첫 다이어리'와 그 줄 안에서 내려간 비율을 지킨다(코덱스 2026-11-01).
// geometry: { top: 스크롤 내용 안에서 격자 묶음의 y, padTop: 격자 안쪽 위 여백, height: 격자 묶음 높이, columns, count, rowGap }
function rowPitch({ padTop = 0, height, columns, count, rowGap }) {
  const rows = Math.ceil(count / columns);
  return rows > 0 ? (height - padTop + rowGap) / rows : 0;
}

/** 스크롤 y → { index, fraction }: 맨 위에 걸린 줄의 첫 다이어리 번호와 그 줄 안에서 내려간 비율(0~1). 격자 위쪽이면 null */
export function gridScrollAnchor(y, geometry) {
  const pitch = rowPitch(geometry);
  const offset = y - geometry.top - (geometry.padTop ?? 0);
  if (!(pitch > 0) || offset <= 0) return null;
  const row = Math.min(Math.floor(offset / pitch), Math.ceil(geometry.count / geometry.columns) - 1);
  return { index: row * geometry.columns, fraction: Math.min(1, (offset - row * pitch) / pitch) };
}

/** gridScrollAnchor 로 기억한 자리 → 새 격자에서의 스크롤 y */
export function gridScrollY(anchor, geometry) {
  const pitch = rowPitch(geometry);
  return geometry.top + (geometry.padTop ?? 0) + (Math.floor(anchor.index / geometry.columns) + anchor.fraction) * pitch;
}
