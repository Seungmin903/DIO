// 발색 기록 속지: 잉크병을 칠하면 색 값(잉크 · 글리터 · 테)이 저절로 찬다.
// 사용자 결정(2026-11-11): 마지막 획 · 펜 종류 안 가림(유리펜 아니면 잉크만) · 모양 보정 없음 ·
// 지우면 같이 사라짐 · 손으로 고치면 그 자리는 그대로 · 판정은 **네모가 아니라 병 윤곽**.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
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

test('획 위에 올리는 병 윤곽은 속지에 찍힌 병과 같은 자리 · 같은 굵기다', async () => {
  // 사용자 2026-11-11: "속지 병 안에 획 그으면 병 윤곽이 내가 그은 획보다 위이게 해줘".
  // 위에 한 겹 더 올리는 그림(InkRecordFrontLayer)이 속지에 찍힌 병과 **한 치도** 어긋나면
  // 선이 두 겹으로 보인다. 그림은 높이 1000 으로 떠 있고 칸마다 줄여 쓴다.
  const { artAt, square, circle, BASE } = await import('../scripts/inkRecord/bottleShape.mjs')
  const builds = { round: P => circle(P, (P.s * 98) / BASE.s), square }
  for (const shape of INK_RECORD_SHAPES) {
    const art = INK_RECORD_BOTTLES[shape]
    assert.ok(art.draw.parts.length && art.draw.thin.length, `${shape} 그림 조각`)
    for (const orientation of ['portrait', 'landscape']) {
      for (const cell of inkRecordLayout(inkRecordId(shape, orientation)).cells) {
        const k = cell.bottleHeight / art.draw.height
        // 줄여 앉히면 윤곽을 감싸는 네모가 칠하는 자리(cell.bottle)와 딱 맞는다
        assert.ok(Math.abs(art.width * art.draw.height * k - cell.bottle.w) < 1e-6, `${shape} 폭`)
        assert.ok(Math.abs(art.draw.height * k - cell.bottle.h) < 1e-9, `${shape} 높이`)
        // 굵기도 속지가 그 칸 높이로 그릴 때와 같다(그래야 겹쳐도 한 선으로 보인다)
        const paper = artAt(builds[shape], cell.bottleHeight)
        assert.ok(Math.abs(art.draw.sw * k - paper.sw) < 0.02, `${shape} 굵기 ${art.draw.sw * k} vs ${paper.sw}`)
        assert.ok(Math.abs(art.draw.thinSw * k - paper.thinSw) < 0.02, `${shape} 얇은 굵기`)
      }
    }
  }
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
  // 글자 윤곽 묶음 + 글꼴 교체에 쓰는 치수(data-adv)
  assert.match(svg, /<g fill="#292929" aria-label="[0-9A-F]{6}" data-adv="[\d.]+">/)
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

test('페이지 추가 · 새 다이어리에서 고를 수 있다 — 카탈로그에만 있고 목록에 없으면 못 고른다', async () => {
  const { papersIn, countAssetId, paperById } = await import('../src/diary/utils/paperChoice.js')
  const papers = papersIn('diary').filter(paper => paper.type === 'inkRecord')
  assert.deepEqual(papers.map(paper => paper.bottle), INK_RECORD_SHAPES)
  for (const paper of papers) for (const orientation of ['portrait', 'landscape']) {
    const assetId = countAssetId(paper.id, orientation)
    assert.equal(assetId, inkRecordId(paper.bottle, orientation), paper.id + ' ' + orientation)
    assert.ok(isInkRecordId(assetId))
  }
  // 병 모양이 다른 두 벌이 서로 다른 속지로 간다(갈래를 안 가리면 둘 다 첫 벌이 된다)
  assert.notEqual(countAssetId('ink-record-round', 'portrait'), countAssetId('ink-record-square', 'portrait'))
  assert.equal(paperById('ink-record-square').bottle, 'square')
  // 다른 속지의 갈래 고르기는 그대로다
  assert.equal(countAssetId('plain', 'portrait'), '2026-reusable-note-plain-portrait')
  assert.equal(countAssetId('dots', 'landscape'), '2026-reusable-note-dots-landscape')
})

test('빠르게 그어 점이 성겨도, 병을 가로지르면 칠한 것으로 본다', () => {
  // 코드리뷰 2026-11-11: 점만 보면 병 위를 건너뛴 획이 칠하지 않은 것으로 판정된다.
  const cell = layoutOf(PORTRAIT).cells[0]
  const midY = cell.bottle.y + cell.bottle.h * 0.7
  // 병 왼쪽 밖 → 오른쪽 밖. 가운데 점이 하나도 없다.
  const across = [{ x: cell.bottle.x - 60, y: midY }, { x: cell.bottle.x + cell.bottle.w + 60, y: midY }]
  for (const point of across) assert.equal(inkRecordFills(PORTRAIT, [stroke([point])])[0], null, '끝점만으로는 병 밖이다')
  const fill = inkRecordFills(PORTRAIT, [stroke(across, { penKind: 'glass', color: '#3a6ea5' })])[0]
  assert.ok(fill, '병을 가로지르면 칠한 것이다')
  assert.equal(fill.ink, '#3A6EA5')
  // 병을 스치지 않고 위로 지나가면 그대로 칠하지 않은 것이다
  const above = [{ x: cell.bottle.x - 60, y: cell.bottle.y - 30 }, { x: cell.bottle.x + cell.bottle.w + 60, y: cell.bottle.y - 30 }]
  assert.equal(inkRecordFills(PORTRAIT, [stroke(above)])[0], null, '병 위를 지나가는 획은 아니다')
})

test('플래그 0 빌드(서버 행 전)는 고르지 못하게만 막고, 이미 만든 페이지는 열린다', () => {
  // 코드리뷰 2026-11-11: 고르기 목록에서 가린 속지를 ID 찾기에도 쓰면 undefined.assetId 로 터진다.
  const source = `
    import assert from 'node:assert/strict'
    import { papersIn, countAssetId, paperById } from ${JSON.stringify(new URL('../src/diary/utils/paperChoice.js', import.meta.url).href)}
    import { reusableTemplates, getTemplate } from ${JSON.stringify(new URL('../src/editor/templates/catalog.js', import.meta.url).href)}
    import { INK_RECORD_TEMPLATE_SELECTION_ENABLED, PLANNER_TEMPLATE_SELECTION_ENABLED } from ${JSON.stringify(new URL('../src/editor/templates/serverCatalog.js', import.meta.url).href)}
    assert.equal(INK_RECORD_TEMPLATE_SELECTION_ENABLED, false)
    assert.equal(PLANNER_TEMPLATE_SELECTION_ENABLED, false)
    // 고르지 못한다
    assert.deepEqual(papersIn('diary').filter(paper => paper.type === 'inkRecord'), [])
    assert.equal(reusableTemplates('portrait').some(item => item.type === 'inkRecord'), false)
    // 플래너도 마찬가지다. 예전 하루 계획(type 'daily')과 데일리 플래너(type 'day')는 종류가
    // 달라서 섞이지 않는다 — 전체 목록에서 찾아도 엉뚱한 ID 가 나오지 않는다(코드리뷰 2026-11-11).
    assert.equal(countAssetId('day', 'landscape'), 'day-planner-landscape')
    assert.equal(countAssetId('study', 'portrait'), 'study-planner-portrait')
    assert.equal(countAssetId('route', 'landscape'), 'route-planner-landscape')
    assert.equal(paperById('daily').id, 'day') // 예전 설정의 'daily' 는 데일리 플래너로 읽는다
    // 그래도 ID 는 나오고 속지도 찾아진다 — 플래그 1 빌드에서 만든 페이지가 열려야 한다
    for (const [id, bottle] of [['ink-record-round', 'round'], ['ink-record-square', 'square']]) {
      assert.equal(paperById(id).bottle, bottle)
      for (const orientation of ['portrait', 'landscape']) {
        const assetId = countAssetId(id, orientation)
        assert.equal(assetId, '2026-reusable-ink-record-' + bottle + '-' + orientation)
        assert.equal(getTemplate(assetId, '1.0.0').orientation, orientation)
      }
    }
  `
  const run = spawnSync(process.execPath, ['--input-type=module', '--eval', source],
    { env: { ...process.env, EXPO_PUBLIC_INK_RECORD_TEMPLATES_ENABLED: '0', EXPO_PUBLIC_PLANNER_TEMPLATES_ENABLED: '0', EXPO_PUBLIC_ROUTE_TEMPLATES_ENABLED: '0' }, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
})

test('바탕이 파일인 속지(fileBase)는 baseSvg 로 바탕을 만들지 않는다', async () => {
  // 코드리뷰 2026-11-11: loadTemplate 이 planner 가 있으면 baseSvg() 로 바탕을 만드는데,
  // 발색 기록은 null 이라 parse(null) 로 터지고 속지가 아예 안 열렸다.
  const api = plannerFor(PORTRAIT)
  assert.equal(api.fileBase, true)
  assert.equal(api.baseSvg(), null, 'fileBase 속지는 바탕을 만들지 않는다')
  // 바탕을 만드는 두 경로가 모두 fileBase 를 걸러야 한다
  for (const file of ['../src/editor/templates/loadTemplate.js', '../src/editor/utils/pageExport.js']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    assert.match(source, /planner\s*&&\s*!planner\.fileBase/, `${file} 가 fileBase 를 걸러야 한다`)
  }
})

test('돌리거나 뒤집은 칠도 병 안으로 센다', () => {
  // 코드리뷰 2026-11-11: pagePoints 가 rotation · flipX · flipY 를 빠뜨리면 돌린 칠이 병 밖이 된다.
  const cell = layoutOf(PORTRAIT).cells[0]
  const centre = { x: cell.bottle.x + cell.bottle.w / 2, y: cell.bottle.y + cell.bottle.h * 0.7 }
  // 요소 상자를 병 가운데에 두고, 그 안 왼쪽 끝에 점을 찍는다
  const box = { x: centre.x - 40, y: centre.y - 40, w: 80, h: 80, baseWidth: 80, baseHeight: 80 }
  const at = (extra) => inkRecordFills(PORTRAIT, [{ type: 'stroke', penKind: 'glass', color: '#3a6ea5',
    points: [{ x: 4, y: 40 }], ...box, ...extra }])[0]
  assert.ok(at({}), '안 돌렸으면 병 안이다')
  for (const extra of [{ rotation: 90 }, { rotation: 180 }, { flipX: true }, { flipY: true }, { rotation: 45, flipX: true }]) {
    assert.ok(at(extra), `${JSON.stringify(extra)} 여도 병 안이다`)
  }
  // 상자를 병에서 멀리 두면 돌려도 병 밖이다
  assert.equal(inkRecordFills(PORTRAIT, [{ type: 'stroke', penKind: 'glass', color: '#3a6ea5',
    points: [{ x: 4, y: 40 }], ...box, x: 10, y: 10, rotation: 45 }])[0], null)
})

test('고른 글리터 색도 팔레트 칸과 같은 반사 색조를 거친다', () => {
  // 코드리뷰 2026-11-11: 고른 값을 그대로 쓰면 팔레트 칸(glassResolved) · 실제 획과 어긋난다.
  const cell = layoutOf(PORTRAIT).cells[0]
  const paint = (extra) => inkRecordFills(PORTRAIT, [stroke([inBottle(cell)], { penKind: 'glass', color: '#3a6ea5', ...extra })])[0]
  const rgb = [1, 3, 5].map(i => parseInt('#3a6ea5'.slice(i, i + 2), 16) / 255)
  for (const chosen of ['#808080', '#2b1a0f', '#ffd700']) {
    assert.equal(paint({ inkGlitterColor: chosen }).glitter, toHex(glitterColorOf(rgb, { glitterColor: chosen })), chosen)
  }
  // 색조를 거치므로 고른 값과 달라지는 경우가 실제로 있다
  assert.notEqual(paint({ inkGlitterColor: '#808080' }).glitter, '#808080')
  // 고르지 않으면 잉크색에서 계산한다
  assert.equal(paint({}).glitter, toHex(glitterColorOf(rgb, {})))
})
