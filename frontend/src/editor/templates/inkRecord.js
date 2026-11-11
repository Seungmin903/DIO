// 발색 기록 속지. 잉크병을 그 잉크로 칠하면 색 값(잉크 · 글리터 · 테)이 **저절로** 채워진다.
//
// 왜 되는가: 유리펜 획은 이미 색 셋을 들고 있다 — color(잉크) · inkGlitterColor · inkSheenColor.
// 고르지 않았으면('맞춤') 잉크색에서 계산한다. 편집기 색 칸(EditablePalette 의 glassResolved)이
// 쓰는 계산과 **같은 함수**를 쓰므로, 종이에 찍히는 값과 팔레트에 보이는 값이 어긋나지 않는다.
// 색을 뽑아내거나 글씨를 알아볼 필요가 없다.
//
// 사용자 결정(2026-11-11):
//  · 한 병을 여러 색으로 칠하면 **마지막 획**의 색을 쓴다.
//  · 유리펜이 아닌 펜으로 칠하면 **그대로 둔다** — 글리터 · 테가 없는 펜이라 값을 지어내지 않는다.
//  · 병 안에 칠한 것은 **모양 보정을 하지 않는다**. 삐져나오든 덜 칠했든 사용자가 한 그대로 둔다.
//  · 획을 지우면 값도 같이 사라진다(저장하지 않고 **그때그때 획에서 읽기** 때문에 저절로 그렇다).
//  · 손으로 고칠 수 있다 — 값 줄 위에 직접 쓰면 그 자리는 자동 값을 찍지 않는다.
import { glitterColorOf, sheenAutoColor } from '../utils/glassInk.js'
import { inkRecordLayout, isInkRecordId } from './inkRecordLayout.js'

const hex2 = value => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0').toUpperCase()
const toHex = rgb => '#' + rgb.map(hex2).join('')
const toRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
const isHex = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)

/**
 * 획 하나 → { ink, glitter, sheen }.
 * 유리펜은 색 셋을 다 들고 있다 — 고르지 않은 글리터 · 테는 잉크색에서 계산한다.
 * 다른 펜은 **잉크만** 채운다(사용자 2026-11-11). 그 펜들에는 글리터 · 테가 없으니 값을 지어내지 않는다.
 */
export function strokeInkColors(object) {
  if (!isHex(object?.color)) return null
  const ink = object.color.toUpperCase()
  if (object.penKind !== 'glass') return { ink, glitter: null, sheen: null }
  const rgb = toRgb(ink)
  return {
    ink,
    glitter: isHex(object.inkGlitterColor) ? object.inkGlitterColor.toUpperCase() : toHex(glitterColorOf(rgb, {})),
    sheen: isHex(object.inkSheenColor) ? object.inkSheenColor.toUpperCase() : toHex(sheenAutoColor(rgb)),
  }
}

const pointsOf = object => Array.isArray(object?.points) ? object.points : []
/** 획을 페이지 좌표로 옮긴 점들. 요소 상자(x · y · w · h)와 원래 크기(baseWidth · baseHeight)로 옮긴다. */
function pagePoints(object) {
  const bw = object.baseWidth || 1, bh = object.baseHeight || 1
  const x = object.x ?? 0, y = object.y ?? 0, w = object.w ?? bw, h = object.h ?? bh
  return pointsOf(object).map(point => ({ x: x + (point.x / bw) * w, y: y + (point.y / bh) * h }))
}
const inBox = (point, box) => point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h
/** 획이 이 네모 안에 **들어와 있나**(한 점이라도). */
const touches = (points, box) => points.some(point => inBox(point, box))

/** 점이 다각형 안인가 — 오른쪽으로 반직선을 쏴 변을 몇 번 지나는지 센다(홀수면 안). */
function inPolygon(point, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1]
    if ((yi > point.y) !== (yj > point.y) && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 선분 ab 와 cd 가 서로 지나가나 */
function segmentsCross(a, b, c, d) {
  const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
  const d1 = side(a, b, c), d2 = side(a, b, d), d3 = side(c, d, a), d4 = side(c, d, b)
  if (d1 !== d2 && d3 !== d4) return true
  // 한 점이 다른 선분 위에 정확히 올라앉은 경우
  const on = (p, q, r) => side(p, q, r) === 0
    && r.x >= Math.min(p.x, q.x) && r.x <= Math.max(p.x, q.x)
    && r.y >= Math.min(p.y, q.y) && r.y <= Math.max(p.y, q.y)
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)
}

/** 선분 ab 가 다각형의 변 하나라도 지나가나 */
function segmentCrossesPolygon(a, b, poly) {
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    if (segmentsCross(a, b, { x: poly[j], y: poly[j + 1] }, { x: poly[i], y: poly[i + 1] })) return true
  }
  return false
}

/** 선분 ab 를 감싸는 네모가 box 와 겹치나 — 다각형을 보기 전에 거르는 데 쓴다 */
const segmentNearBox = (a, b, box) => Math.max(a.x, b.x) >= box.x && Math.min(a.x, b.x) <= box.x + box.w
  && Math.max(a.y, b.y) >= box.y && Math.min(a.y, b.y) <= box.y + box.h

/**
 * 획이 **병 안**에 들어와 있나. 네모가 아니라 병 윤곽으로 본다(사용자 2026-11-11).
 * 윤곽은 조각 여럿이라 하나에만 들어도 병 안이다.
 * 모양 보정은 하지 않으므로, 삐져나온 칠이 있어도 조금만 병 안에 들어오면 그 잉크로 친다.
 *
 * 점만 보지 않고 **점 사이도** 본다. 빠르게 그으면 점이 성겨서, 병을 가로지르고도 병 안에 찍힌
 * 점이 하나도 없을 수 있다(코드리뷰 2026-11-11).
 */
function touchesBottle(points, cell) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    // 감싸는 네모로 먼저 거른다 — 대개 여기서 끝난다
    if (inBox(a, cell.bottle) && cell.bottlePolys.some(poly => inPolygon(a, poly))) return true
    const b = points[i + 1]
    if (!b || !segmentNearBox(a, b, cell.bottle)) continue
    if (cell.bottlePolys.some(poly => segmentCrossesPolygon(a, b, poly))) return true
  }
  return false
}

/**
 * 속지의 칸마다 자동으로 채울 값.
 * objects: page.objects (그리는 차례대로 — 뒤에 올수록 나중에 그린 것)
 * 돌려주는 값: 칸 수만큼의 배열. 칠하지 않은 칸은 null.
 *   { ink, glitter, sheen, written: [잉크 자리에 손으로 썼나, 글리터, 테] }
 */
export function inkRecordFills(assetId, objects) {
  const layout = inkRecordLayout(assetId)
  if (!layout) return null
  const strokes = (Array.isArray(objects) ? objects : []).filter(object => object?.type === 'stroke' && !object.hidden)
  const placed = strokes.map(object => ({ object, points: pagePoints(object) }))
  return layout.cells.map(cell => {
    // 병 안을 **마지막에 칠한** 획의 색을 쓴다(사용자 결정). 펜 종류는 가리지 않는다 —
    // 유리펜이면 색 셋이 다 차고, 다른 펜이면 잉크만 찬다.
    let colors = null
    for (let i = placed.length - 1; i >= 0 && !colors; i--) {
      const one = placed[i]
      if (touchesBottle(one.points, cell)) colors = strokeInkColors(one.object)
    }
    // 값 줄에 사용자가 직접 쓴 자리는 자동 값을 찍지 않는다(손으로 고치기)
    const written = cell.hex.map(box => placed.some(one => touches(one.points, box)))
    if (!colors) return written.some(Boolean) ? { ink: null, glitter: null, sheen: null, written } : null
    return { ...colors, written }
  })
}

/**
 * 속지가 화면·내보내기에 넘기는 값. 아무 칸도 안 찼으면 null —
 * 그래야 빈 장에 덮개를 만들지 않는다. 값이 같으면 덮개를 다시 만들지 않으므로,
 * 병 바깥에 그은 획은 덮개를 건드리지 않는다.
 */
export function inkRecordValue(assetId, objects) {
  const fills = inkRecordFills(assetId, objects)
  return fills && fills.some(Boolean) ? fills : null
}

export { isInkRecordId }
