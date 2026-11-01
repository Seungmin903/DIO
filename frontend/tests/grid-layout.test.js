import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_CELL_MAX, GRID_CELL_MIN, GRID_CELL_MIN_PORTRAIT, GRID_GAP_X, LIBRARY_SIDE_PADDING, gridColumns, gridMetrics, gridScrollAnchor, gridScrollY } from '../src/diary/utils/gridLayout.js';

const RAIL = 78; // 접힌 사이드 메뉴 폭 (SideRail 은 화면 모듈이라 여기서 못 불러온다)

test('한 줄 권수는 최소 칸(208)과 간격(32)이 들어가는 만큼이고 적어도 2권이다', () => {
  const columns = [[400, 2], [687, 2], [688, 3], [927, 3], [928, 4], [1142, 4], [1167, 4], [1168, 5]];
  for (const [width, expected] of columns) assert.equal(gridColumns(width), expected, String(width));
});

test('격자는 어떤 폭에서도 안쪽 폭을 넘지 않고 칸은 최대 크기를 넘지 않는다', () => {
  for (let width = 400; width <= 1500; width += 7) {
    const { columns, cell, width: used } = gridMetrics(width);
    assert.ok(cell <= GRID_CELL_MAX, `${width}: 칸 ${cell}`);
    assert.ok(used <= width, `${width}: 격자 ${used}`);
    assert.equal(used, columns * cell + (columns - 1) * GRID_GAP_X);
  }
});

test('칸은 어떤 태블릿 폭에서도 최소 크기 아래로 내려가지 않는다(표지 폭 154~172)', () => {
  for (let width = 448; width <= 1500; width += 7) { // 2권(208×2 + 32) 아래 폭은 폰(퍼센트 배치)이라 재지 않는다
    const { cell } = gridMetrics(width);
    assert.ok(cell >= GRID_CELL_MIN && cell <= GRID_CELL_MAX, `${width}: 칸 ${cell}`);
  }
});

test('갤럭시 탭류 가로(1280 dp)는 4권, 11인치 세로(834 dp)는 3권', () => {
  assert.equal(gridMetrics(1280 - RAIL - LIBRARY_SIDE_PADDING * 2).columns, 4);
  assert.equal(gridMetrics(834 - RAIL - LIBRARY_SIDE_PADDING * 2).columns, 3);
});

const inner = width => width - RAIL - LIBRARY_SIDE_PADDING * 2;

test('세로 창은 최소 칸 180 이라 갤럭시 탭 세로(800)도 3권이고, 가로 권수는 그대로다', () => {
  // [창 폭, 세로인가, 권수, 칸] — docs/한눈에 보기 가로 세로 의 표
  const cases = [[1280, false, 4, 261], [800, true, 3, 199], [1194, false, 4, 240], [834, true, 3, 210], [1366, false, 5, 220], [1024, true, 3, 264], [1133, false, 4, 224], [744, true, 3, 180]];
  for (const [width, portrait, columns, cell] of cases) {
    const metrics = gridMetrics(inner(width), portrait);
    assert.deepEqual([metrics.columns, metrics.cell], [columns, cell], `${width} ${portrait ? '세로' : '가로'}`);
  }
});

test('세로 창의 칸은 3열까지 180~264, 4열부터는 가로와 같이 208 이상이다', () => {
  for (let width = 392; width <= 1500; width += 7) { // 2권(180×2 + 32) 아래 폭은 폰이라 재지 않는다
    const { columns, cell } = gridMetrics(width, true);
    assert.ok(cell >= (columns > 3 ? GRID_CELL_MIN : GRID_CELL_MIN_PORTRAIT) && cell <= GRID_CELL_MAX, `${width}: ${columns}열 칸 ${cell}`);
    assert.ok(columns >= gridColumns(width), `${width}: 세로가 가로 규칙보다 권수가 적다`);
  }
});

test('회전해 권수가 바뀌어도 맨 위에 걸린 다이어리 줄을 같은 비율 높이에 다시 놓는다', () => {
  // 4열 칸 261 → 3열 칸 199. 한 줄 = 칸 + 정보 58 + 간격 32
  const landscape = { top: 0, padTop: 16, columns: 4, count: 12, rowGap: 32, height: 16 + 3 * (261 + 58) + 2 * 32 };
  const portrait = { top: 0, padTop: 16, columns: 3, count: 12, rowGap: 32, height: 16 + 4 * (199 + 58) + 3 * 32 };
  const anchor = gridScrollAnchor(16 + 351 + 175.5, landscape); // 둘째 줄(5~8번째)의 반쯤
  assert.equal(anchor.index, 4);
  assert.ok(Math.abs(anchor.fraction - 0.5) < 1e-9);
  // 5번째 다이어리는 3열에서 둘째 줄(4~6) → 그 줄의 반쯤
  assert.ok(Math.abs(gridScrollY(anchor, portrait) - (16 + 289 + 144.5)) < 1e-9);
  assert.equal(gridScrollAnchor(10, landscape), null, '격자 위쪽에 있으면 옮기지 않는다');
});
