// 발색 기록 속지: 잉크병을 칠하면 색 값(잉크 · 글리터 · 테)이 저절로 찬다.
// 사용자 결정(2026-11-11): 마지막 획 · 펜 종류 안 가림(유리펜 아니면 잉크만) · 모양 보정 없음 ·
// 지우면 같이 사라짐 · 손으로 고치면 그 자리는 그대로 · 판정은 **네모가 아니라 병 윤곽**.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { INK_RECORD_SHAPES, inkRecordId, isInkRecordId, inkRecordLayout, cellRegions, SIZES } from '../src/editor/templates/inkRecordLayout.js'
import { INK_RECORD_BOTTLES } from '../src/editor/templates/inkRecordBottles.js'
import { inkRecordFills, inkRecordValue, strokeInkColors } from '../src/editor/templates/inkRecord.js'
import { inkRecordOverlaySvg, mergeInkRecordOverlay, inkRecordApi } from '../src/editor/templates/inkRecordPaper.js'
import { plannerFor } from '../src/editor/templates/planners.js'
import { glitterColorOf, sheenAutoColor } from '../src/editor/utils/glassInk.js'
import { swapPaperFont } from '../src/editor/templates/paperFont.js'

const PORTRAIT = inkRecordId('round', 'portrait')
const layoutOf = id => inkRecordLayout(id)
/** 페이지 좌표 점들을 가진 획 하나(요소 상자는 1:1 로 둔다 — 좌표 변환을 거치지 않게) */
const stroke = (points, extra = {}) => ({
  type: 'stroke', penKind: 'pen', color: '#917019', points,
  x: 0, y: 0, w: 1, h: 1, baseWidth: 1, baseHeight: 1, ...extra,
})
/** 병 한가운데(몸통) 한 점 — 어느 윤곽에도 확실히 드는 자리 */
const inBottle = cell => ({ x: cell.bottle.x + cell.bottle.w / 2, y: cell.bottle.y + cell.bottle.h * 0.7 })
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
const toHex = v => '#' + v.map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0').toUpperCase()).join('')

test('속지 ID · 자리는 세로 2x3 · 가로 3x2 로 여섯 칸이다', () => {
  for (const shape of INK_RECORD_SHAPES) for (const orientation of ['portrait', 'landscape']) {
    const id = inkRecordId(shape, orientation)
    assert.ok(isInkRecordId(id), id)
    const layout = layoutOf(id)
    assert.equal(layout.orientation, orientation)
    assert.equal(layout.shape, shape)
    assert.equal(layout.cells.length, 6)
    const { W, H } = SIZES[orientation]
    for (const cell of layout.cells) {
      assert.ok(cell.bottle.x >= 0 && cell.bottle.x + cell.bottle.w <= W, id)
      assert.ok(cell.bottle.y >= 0 && cell.bottle.y + cell.bottle.h <= H, id)
      assert.equal(cell.hex.length, 3)
      assert.equal(cell.chips.length, 3)
    }
  }
  assert.equal(isInkRecordId('2026-reusable-note-dots-portrait'), false)
  assert.equal(layoutOf('2026-reusable-note-dots-portrait'), null)
})

test('속지를 만드는 쪽과 앱이 같은 자리 계산을 쓴다', async () => {
  // 생성기는 cellRegions 를 그대로 불러 쓴다 — 자리를 두 벌로 두면 값이 엉뚱한 데 찍힌다
  const source = await readFile(new URL('../scripts/generate-ink-record-paper.mjs', import.meta.url), 'utf8')
  assert.match(source, /from '\.\.\/src\/editor\/templates\/inkRecordLayout\.js'/)
  assert.match(source, /cellRegions\(orientation, col, row, shape\)/)
  // 병을 앉히는 식도 같다: 가로 가운데 · 병 높이에 맞춘 폭
  const cell = cellRegions('portrait', 0, 0, 'round')
  assert.ok(Math.abs((cell.bottle.x + cell.bottle.w / 2) - cell.cx) < 1e-9)
  assert.ok(Math.abs(cell.bottle.w / cell.bottle.h - INK_RECORD_BOTTLES.round.width) < 1e-9)
})

test('병 윤곽은 지금 그리는 병 모양에서 뽑은 것과 같다', async () => {
  // 생성기를 다시 돌려도 파일이 그대로여야 한다 — 병 모양을 고치면 이 검사가 먼저 깨진다
  const file = new URL('../src/editor/templates/inkRecordBottles.js', import.meta.url)
  const out = join(await mkdtemp(join(tmpdir(), 'ink-record-')), 'bottles.js')
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/generate-ink-record-bottles.mjs', import.meta.url)), out], { stdio: 'pipe' })
  assert.equal(await readFile(out, 'utf8'), await readFile(file, 'utf8'))
})

test('판정 자리는 네모가 아니라 병 윤곽이다', () => {
  for (const shape of INK_RECORD_SHAPES) {
    const id = inkRecordId(shape, 'portrait')
    const cell = inkRecordLayout(id).cells[0]
    const paint = point => Boolean(inkRecordFills(id, [stroke([point])])[0])
    // 몸통 한가운데는 당연히 안
    assert.ok(paint(inBottle(cell)), shape + ' 몸통')
    // 감싸는 네모의 위쪽 두 귀퉁이는 병 밖이다(어깨 옆 빈자리) — 예전 네모 판정에서는 여기도 찼다
    const pad = 1
    for (const dx of [pad, cell.bottle.w - pad]) {
      assert.equal(paint({ x: cell.bottle.x + dx, y: cell.bottle.y + pad }), false, shape + ' 귀퉁이')
    }
    // 병 바로 옆(네모 밖)도 당연히 밖
    assert.equal(paint({ x: cell.bottle.x - 5, y: cell.bottle.y + cell.bottle.h / 2 }), false, shape + ' 옆')
  }
})

test('유리펜으로 칠하면 색 셋이 다 차고, 다른 펜은 잉크만 찬다', () => {
  const layout = layoutOf(PORTRAIT)
  const glass = stroke([inBottle(layout.cells[0])], { penKind: 'glass', color: '#3a6ea5' })
  const ball = stroke([inBottle(layout.cells[1])], { penKind: 'pen', color: '#917019' })
  const fills = inkRecordFills(PORTRAIT, [glass, ball])
  assert.deepEqual(fills[0], { ink: '#3A6EA5', glitter: toHex(glitterColorOf(rgb('#3a6ea5'), {})), sheen: toHex(sheenAutoColor(rgb('#3a6ea5'))), written: [false, false, false] })
  assert.deepEqual(fills[1], { ink: '#917019', glitter: null, sheen: null, written: [false, false, false] })
  assert.equal(fills[2], null)
  // 유리펜이 글리터 · 테를 직접 들고 있으면 그 값을 그대로 쓴다('맞춤'이 아닐 때)
  const chosen = stroke([inBottle(layout.cells[2])], { penKind: 'glass', color: '#3a6ea5', inkGlitterColor: '#ffd700', inkSheenColor: '#102030' })
  assert.deepEqual(inkRecordFills(PORTRAIT, [chosen])[2], { ink: '#3A6EA5', glitter: '#FFD700', sheen: '#102030', written: [false, false, false] })
  // 색이 없는 획은 아무것도 채우지 않는다
  assert.equal(strokeInkColors({ color: null }), null)
  assert.equal(strokeInkColors({ penKind: 'glass', color: 'red' }), null)
})

test('한 병을 여러 색으로 칠하면 마지막에 그은 획의 색을 쓴다(펜 종류 안 가림)', () => {
  const cell = layoutOf(PORTRAIT).cells[0]
  const glass = stroke([inBottle(cell)], { penKind: 'glass', color: '#3a6ea5' })
  const ball = stroke([inBottle(cell)], { penKind: 'pen', color: '#c0392b' })
  assert.equal(inkRecordFills(PORTRAIT, [glass, ball])[0].ink, '#C0392B')
  assert.equal(inkRecordFills(PORTRAIT, [glass, ball])[0].glitter, null, '마지막이 볼펜이면 글리터는 비운다')
  assert.notEqual(inkRecordFills(PORTRAIT, [ball, glass])[0].glitter, null, '마지막이 유리펜이면 글리터도 찬다')
})

test('획을 지우면(목록에서 빠지면) 값도 같이 사라진다', () => {
  const cell = layoutOf(PORTRAIT).cells[0]
  const one = stroke([inBottle(cell)], { penKind: 'glass', color: '#3a6ea5' })
  assert.ok(inkRecordValue(PORTRAIT, [one]))
  assert.equal(inkRecordValue(PORTRAIT, []), null, '저장하지 않으므로 지우면 그대로 사라진다')
  assert.equal(inkRecordValue(PORTRAIT, [{ ...one, hidden: true }]), null, '숨긴 획도 안 센다')
})

test('값 줄에 손으로 쓰면 그 자리에는 자동 값을 찍지 않는다', () => {
  const cell = layoutOf(PORTRAIT).cells[0]
  const hex = cell.hex[1]
  const objects = [
    stroke([inBottle(cell)], { penKind: 'glass', color: '#3a6ea5' }),
    stroke([{ x: hex.x + 2, y: hex.y + 2 }]),
  ]
  const fill = inkRecordFills(PORTRAIT, objects)[0]
  assert.deepEqual(fill.written, [false, true, false])
  const svg = inkRecordOverlaySvg(PORTRAIT, inkRecordValue(PORTRAIT, objects))
  assert.ok(svg.includes(fill.ink), '잉크 값은 찍힌다')
  assert.equal(svg.includes(fill.glitter), false, '손으로 쓴 글리터 자리는 비워 둔다')
})

test('덮개는 속지 글꼴을 따라 바뀌고, 내보내기는 바탕 파일 안에 끼워 넣는다', async () => {
  const value = inkRecordValue(PORTRAIT, [stroke([inBottle(layoutOf(PORTRAIT).cells[0])], { penKind: 'glass', color: '#3a6ea5' })])
  const svg = inkRecordOverlaySvg(PORTRAIT, value)
  assert.match(svg, /<g fill="#292929" aria-label="[0-9A-F]{6}">/)
  assert.notEqual(swapPaperFont(svg, 'nanum-pen'), svg, '속지 글꼴을 바꾸면 HEX 글자도 바뀐다')
  // 빈 장이면 값이 없고, 덮개도 비어 있다
  assert.equal(inkRecordValue(PORTRAIT, []), null)
  assert.ok(inkRecordOverlaySvg(PORTRAIT, null).endsWith('></svg>'))
  // 내보내기: 바탕을 갈음하지 않고 그 안에 끼운다
  const api = plannerFor(PORTRAIT)
  assert.equal(api.kind, 'inkRecord')
  assert.equal(api.fileBase, true, '바탕은 속지 파일 그대로다')
  const base = await readFile(new URL(`../assets/templates/2026/SVG/${PORTRAIT}.svg`, import.meta.url), 'utf8')
  const merged = mergeInkRecordOverlay(base, svg)
  assert.ok(merged.startsWith(base.slice(0, 200)), '바탕이 그대로 남는다')
  assert.ok(merged.includes('#3A6EA5'), '덮개가 들어간다')
  assert.equal(merged.match(/<\/svg>/g).length, 1, '<svg> 가 겹쳐 들어가지 않는다')
  assert.equal(mergeInkRecordOverlay(base, ''), base)
  assert.equal(inkRecordApi('2026-reusable-note-dots-portrait'), null)
})
