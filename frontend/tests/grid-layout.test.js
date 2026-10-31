import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_CELL_MAX, GRID_GAP_X, gridColumns, gridMetrics } from '../src/diary/utils/gridLayout.js';

test('한 줄 권수는 안쪽 폭 620 · 850 · 1040에서 바뀐다', () => {
  const columns = [[560, 2], [619, 2], [620, 3], [696, 3], [849, 3], [850, 4], [1039, 4], [1040, 5], [1250, 5]];
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

test('가로 · 세로로 든 11인치 태블릿은 칸 크기 차이가 10% 안이고 간격은 같다', () => {
  const portrait = gridMetrics(696), landscape = gridMetrics(1056);
  assert.deepEqual([portrait.columns, landscape.columns], [3, 5]);
  assert.equal(portrait.gapX, landscape.gapX);
  assert.ok((portrait.cell - landscape.cell) / portrait.cell < 0.1, `${portrait.cell} · ${landscape.cell}`);
});

test('갤럭시 탭류(800 · 1280 dp)는 두 방향 칸이 거의 같다', () => {
  const portrait = gridMetrics(800 - 78 - 60), landscape = gridMetrics(1280 - 78 - 60);
  assert.deepEqual([portrait.columns, landscape.columns], [3, 5]);
  assert.ok(Math.abs(portrait.cell - landscape.cell) <= 6, `${portrait.cell} · ${landscape.cell}`);
});
