// 발색 기록 속지의 자리(페이지 좌표). **속지 SVG 를 만드는 쪽과 같은 식**이어야 한다 —
// 어긋나면 자동으로 채우는 네모 · HEX 가 엉뚱한 곳에 찍힌다.
// 그래서 숫자를 여기 한 곳에 두고 scripts/generate-ink-record-paper.mjs 가 이 파일을 읽어 쓴다.
// (검사 tests/ink-record.test.js 가 둘이 같은지 지킨다.)

import { INK_RECORD_BOTTLES } from './inkRecordBottles.js'
import { coverBounds, drawsOnPage } from '../utils/coverBounds.js'

export const INK_RECORD_SHAPES = ['round', 'square']
export const inkRecordId = (shape, orientation) => `2026-reusable-ink-record-${shape}-${orientation}`
export const isInkRecordId = id => typeof id === 'string' && /^2026-reusable-ink-record-(round|square)-(portrait|landscape)$/.test(id)

// 병 · 색 네모 · 라벨이 쓰는 진한 틀 색. 속지를 만드는 스크립트(generate-ink-record-paper.mjs)와
// 앱(덮개 inkRecordPaper.js · 획 위 병 윤곽 InkRecordFrontLayer.js)이 **같은 값을 여기서** 가져간다.
// 두 벌이면 한쪽만 바뀌어 획 위 윤곽이 속지에 인쇄된 선과 어긋난다(코드리뷰 2026-11-11).
// 속지 팔레트(appearance.js)에 있는 색이어야 속지 색 설정이 먹는다 — tests/ink-record.test.js 가 지킨다.
export const INK_RECORD_FRAME = '#aeb3b8'

export const MARGIN = 56
// 세로는 2x3, 가로는 3x2 — 어느 쪽이든 한 장에 여섯 칸이다.
export const SIZES = {
  portrait: { W: 768, H: 1024, cols: 2, rows: 3 },
  landscape: { W: 1024, H: 768, cols: 3, rows: 2 },
}
export const GRID = { top: MARGIN + 40, gx: 14, gy: 14, labelW: 36, valueW: 62 }
// 병이 칸에서 차지하는 비율 · 이름 줄까지의 여백 · 값 줄 간격 — 생성기와 같은 값
export const BOTTLE = { heightOfCell: 0.46, heightOfWidth: 0.56, top: 10, nameGap: 42 }
export const ROW_GAP = 24, FIRST_ROW = 30, CHIP = 11, CHIP_GAP = 5, HASH_W = 8

export const cellBox = (orientation, col, row) => {
  const { W, H, cols, rows } = SIZES[orientation]
  const cw = (W - MARGIN * 2 - GRID.gx * (cols - 1)) / cols
  const ch = (H - GRID.top - MARGIN - GRID.gy * (rows - 1)) / rows
  return { x: MARGIN + (cw + GRID.gx) * col, y: GRID.top + (ch + GRID.gy) * row, w: cw, h: ch }
}

/**
 * 칸 하나의 자리들.
 * bottlePolys 는 **칠하는 자리** — 병 윤곽 다각형들(페이지 좌표)이다. 하나에라도 들면 병 안이다
 * (사용자 2026-11-11: "네모 영역 말고 병 윤곽 따서 그 안이면 칠했다고 판정하자").
 * bottle 은 그 윤곽을 감싸는 네모 — 먼저 걸러내는 데만 쓴다.
 */
export function cellRegions(orientation, col, row, shape = INK_RECORD_SHAPES[0]) {
  const box = cellBox(orientation, col, row)
  const cx = box.x + box.w / 2
  const bh = Math.min(box.h * BOTTLE.heightOfCell, box.w * BOTTLE.heightOfWidth)
  const ly = box.y + BOTTLE.top + bh + BOTTLE.nameGap
  const gw = GRID.labelW + CHIP + CHIP_GAP + HASH_W + GRID.valueW
  const gx0 = cx - gw / 2
  // 병 윤곽. 다각형은 병 높이를 1 로 본 좌표라 높이를 곱하고 병이 앉는 자리로 옮기면 된다
  // — 속지를 만드는 쪽(generate-ink-record-paper.mjs 의 bottle())이 병을 앉히는 식과 같다.
  const art = INK_RECORD_BOTTLES[shape] ?? INK_RECORD_BOTTLES[INK_RECORD_SHAPES[0]]
  const bottle = { x: cx - (art.width * bh) / 2, y: box.y + BOTTLE.top, w: art.width * bh, h: bh }
  const bottlePolys = art.polygons.map(poly => {
    const out = new Array(poly.length)
    for (let i = 0; i < poly.length; i += 2) { out[i] = bottle.x + poly[i] * bh; out[i + 1] = bottle.y + poly[i + 1] * bh }
    return out
  })
  const name = { x: gx0, y: ly - 18, w: gw, h: 22 }
  const slots = [0, 1, 2].map(i => {
    const hy = ly + FIRST_ROW + i * ROW_GAP
    return {
      chip: { x: gx0 + GRID.labelW, y: hy - 9, w: CHIP, h: CHIP },
      // 값 자리: # 뒤부터 줄 끝까지. 여기에 사용자가 쓰면 자동 값을 찍지 않는다
      hex: { x: gx0 + GRID.labelW + CHIP + CHIP_GAP + HASH_W, y: hy - 12, w: GRID.valueW, h: 18 },
      baseline: hy,
    }
  })
  return { box, cx, bottleHeight: bh, bottle, bottlePolys, name, groupX: gx0, groupW: gw,
    chips: slots.map(s => s.chip), hex: slots.map(s => s.hex), baselines: slots.map(s => s.baseline) }
}

/** 속지 ID → 자리 전부. 발색 기록 속지가 아니면 null. */
export function inkRecordLayout(assetId) {
  if (!isInkRecordId(assetId)) return null
  const orientation = assetId.endsWith('portrait') ? 'portrait' : 'landscape'
  const { cols, rows } = SIZES[orientation]
  const shape = INK_RECORD_SHAPES.find(one => assetId.includes(`-${one}-`)) ?? INK_RECORD_SHAPES[0]
  const cells = []
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) cells.push(cellRegions(orientation, col, row, shape))
  return { orientation, shape, ...SIZES[orientation], cells }
}

/**
 * 병 윤곽(InkRecordFrontLayer)을 요소 목록의 **몇 번째 앞**에 끼울지. 속지가 아니면 -1.
 *
 * 윤곽은 속지의 것이라 칠한 잉크 **위**에 있어야 하고(사용자 2026-11-11), 그 위에 붙인
 * 메모 · 사진에는 **덮여야** 한다(사용자 2026-11-13). 평평한 차례 하나로 둘 다 지키려면
 * 기준이 필요하다 — **병을 가리는 것**만 윤곽을 끌어내린다. 페이지 구석에 붙인 스티커까지
 * 차례를 가르면, 그 뒤에 칠한 잉크가 전부 병 선을 덮는다(코드리뷰 2026-11-13).
 *
 * **그려지지 않는 것**(숨김 · 투명도 0 · 없앤 기본 스티커)은 차례도 가르지 않는다 —
 * 내보내기가 목록에서 빼는 기준과 같다(utils/coverBounds 의 drawsOnPage). 돌린 요소는 **돌린 뒤의** 감싸는 네모로 본다 —
 * 가로로 긴 메모를 90도 가까이 돌려 병에 걸치면 돌리기 전 네모로는 안 겹치기 때문이다
 * (코드리뷰 2026-11-13). 조금 넉넉하게 잡히지만, 덜 잡혀 선이 가려지는 쪽보다 낫다.
 *
 * 한계: 자리는 **한 장에 하나**다. 윤곽 그림(InkRecordFrontLayer)이 여섯 병을 한 번에 그리기
 * 때문이다. 그래서 한 병만 가려도 그 뒤에 그은 획이 **다른 병의** 윤곽 위로도 올라간다.
 * 병마다 따로 그리면 정확해지지만 층이 여섯 개가 되고 획 묶음도 여섯 번 끊긴다 — 가리는 것이
 * 아예 없을 때(흔한 경우)는 윤곽이 맨 위 층이라 모든 병이 모든 획 위이므로, 그 값을 치르지 않는다.
 */
export function inkRecordFrontIndex(assetId, objects) {
  const layout = inkRecordLayout(assetId)
  if (!layout) return -1
  const list = Array.isArray(objects) ? objects : []
  for (let i = 0; i < list.length; i++) {
    const object = list[i]
    if (!drawsOnPage(object) || object.type === 'stroke') continue
    // 돌린 요소는 돌린 뒤의 감싸는 네모로 본다(utils/common 의 rotatedBounds 와 같은 식)
    const box = coverBounds(object)
    if (layout.cells.some(cell => box.left < cell.bottle.x + cell.bottle.w && box.right > cell.bottle.x
      && box.top < cell.bottle.y + cell.bottle.h && box.bottom > cell.bottle.y)) return i
  }
  return list.length   // 병을 가리는 것이 없으면 맨 뒤 — 모든 획 위
}
