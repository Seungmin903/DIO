import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GRID_COLUMNS, swatchGridLayout } from '../src/diary/utils/swatchGridLayout.js'
import { paperCellRange, paperGridMetrics, PAPER_GRID_GAP } from '../src/diary/utils/paperGridLayout.js'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const rowsOf = (count, columns) => Array.from({ length: Math.ceil(count / columns) }, (_, i) => Math.min(columns, count - i * columns))

test('796: 속지 색 패널의 색 견본은 펜 · 글자 팔레트와 같은 1/8 칸 · 원 28 이라 7색이 한 줄에 놓인다', () => {
  const src = read('src/editor/components/PaperColorSettings.js')
  assert.match(src, /import \{ paletteSwatchStyles \} from '\.\/controls\/EditablePalette'/)
  // 배경색 · 레이아웃 색 · 쉬는 시간 색 세 줄 모두 공용 칸을 쓰고, 예전 32 원 · 사이 16 줄바꿈 줄은 없다
  assert.equal(src.match(/<View style=\{paletteSwatchStyles\.row\}>/g)?.length, 2) // presets.map 한 곳 + 쉬는 시간 한 곳
  assert.equal(src.match(/style=\{paletteSwatchStyles\.cell\}/g)?.length, 2)
  assert.doesNotMatch(src, /columnGap: 16, rowGap: 16/)
  assert.doesNotMatch(src, /width: 32, height: 32/)
  const palette = read('src/editor/components/controls/EditablePalette.js')
  assert.match(palette, /cell:\{width:'12\.5%',height:48/)
  assert.match(palette, /dot:\{width:28,height:28,borderRadius:14/)
})

test('796: 표지 색 견본 격자는 폭이 좁아도 7칸 한 줄을 지키고 칸만 줄인다', () => {
  const span = ({ cell, gap }) => cell * GRID_COLUMNS + gap * (GRID_COLUMNS - 1)
  // 재기 전: 기본 칸 36 · 사이 4
  assert.deepEqual(swatchGridLayout(0), { cell: 36, gap: 4 })
  for (const width of [214, 240, 266, 276, 300, 388]) {
    const layout = swatchGridLayout(width)
    assert.ok(span(layout) <= width, `${width}: 7칸이 한 줄에 든다`)
    assert.ok(layout.cell >= 30 && layout.cell <= 36)
  }
  // 넓으면 칸은 36 그대로, 사이가 늘어 끝을 맞춘다
  const wide = swatchGridLayout(388)
  assert.equal(wide.cell, 36)
  assert.ok(span(wide) > 386)
  // 좁은 폰(214)은 칸을 줄인다
  assert.ok(swatchGridLayout(214).cell < 36)
  const controls = read('src/diary/components/FormControls.js')
  assert.match(controls, /const \{ cell, gap \} = swatchGridLayout\(width\)/)
  assert.doesNotMatch(controls, /useFillGrid/)
})

test('796 후속: 속지 타일은 3열 고정이 아니라 폭에 들어가는 만큼 놓고 줄마다 수를 고르게 나눈다', () => {
  const thumb = 54
  const { min, max } = paperCellRange(thumb)
  const cases = [
    // [폭, 속지 수, 기대 줄 구성]
    [791, 7, [7]], [791, 4, [4]], // 태블릿 세로 시트: 플래너 7종 · 노트 4종이 한 줄
    [388, 7, [4, 3]], [388, 4, [4]], // 태블릿 가로 옵션 패널
    [380, 7, [4, 3]], [328, 7, [4, 3]], // 폰
    [324, 7, [4, 3]], // 편집기 페이지 추가 말풍선(348 - 안쪽 여백 24)
    [320, 7, [4, 3]], // 폰 360 페이지 추가(360 - 16 - 24)
    [791, 2, [2]],
  ]
  for (const [width, count, expected] of cases) {
    const grid = paperGridMetrics(width, count, thumb)
    assert.deepEqual(rowsOf(count, grid.columns), expected, `${width} / ${count}`)
    assert.ok(grid.cell >= min && grid.cell <= max, `${width}: 칸 ${grid.cell}`)
    assert.ok(grid.width <= width, `${width}: 줄 폭 안`)
    assert.equal(grid.empty, 0)
  }
  // 분류를 바꿔도 같은 높이: 가장 많은 분류(7) 줄 수만큼 빈 칸을 채운다
  const short = paperGridMetrics(380, 4, thumb, { fillTo: 7 })
  assert.equal(short.rows, 2)
  assert.equal(short.empty, short.columns) // 한 줄 통째로
  assert.equal(paperGridMetrics(380, 7, thumb, { fillTo: 7 }).empty, 0) // 마지막 줄 남는 자리는 채우지 않는다
  // 칸 크기는 분류(속지 수)와 상관없이 같다
  assert.equal(paperGridMetrics(380, 2, thumb).cell, paperGridMetrics(380, 7, thumb).cell)
  assert.equal(PAPER_GRID_GAP, 4)
  assert.ok(min >= 76, '가장 긴 이름이 잘리지 않는 폭')
  // 가로 속지(미리보기 72)도 폰에서 4칸
  assert.deepEqual(rowsOf(7, paperGridMetrics(380, 7, 72).columns), [4, 3])
  const options = read('src/diary/components/PaperOptions.js')
  assert.doesNotMatch(options, /width: '33\.333%'/)
  assert.match(options, /paperGridMetrics\(measured \|\| estimateWidth \|\| panelWidth \|\| screen\.width - 32, papers\.length, thumb, \{ fillTo \}\)/)
  const picker = read('src/editor/components/PageAddPicker.js')
  assert.match(picker, /fillTo=\{tallest\} estimateWidth=\{gridWidth\}/)
  assert.doesNotMatch(picker, /minSlots/)
})
