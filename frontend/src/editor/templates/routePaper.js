// 여행 노선 속지. 하루 여행 경로를 구불구불한 노선 위에 출발 · 방문 · 도착 지점으로 표시하는 대화형 속지다(docs/여행 노선 속지/색인.md).
// 머리줄(기획 참고 그림 2026-11-09): 왼쪽에 "DAY n" 제목, 세로 구분선, 그 옆에 부제목 칸(그날을 한 줄로), 오른쪽 끝에 지역 · 날짜 칸. 칸을 누르면 그 자리의 글상자. 그 아래에 노선이 지난다.
// 아래 왼쪽 범례(2026-11-09, 지하철 노선도의 범례처럼): 노선 견본 선 · 출발 · 방문 · 도착 표식. 종이에 인쇄돼 출력에도 남고, 선택 도구로 누르면 노선 스타일 창 · 지점 추가가 된다(routeEditTap).
// 노선 설정은 속지 색 창이 아니라 이렇게 속지 위에서 한다. DAY 번호는 기록(options.day)이며 다이어리 만들기 · 페이지 추가가 1, 2, 3… 으로 매기고(assignRouteDays) 제목을 눌러 바꾼다. 제목은 기록에 따라 바뀌므로 덮개에 그린다.
// 속지 그림은 스터디 · 데일리 플래너와 같은 두 장이다: 바탕(routePaperBaseSvg)은 기록과 상관없어 캐시해 두고(지역 · 날짜 칸 · 구분선),
// DAY 제목과 노선 자체(색 · 굵기 · 진하기)는 덮개(routePaperOverlaySvg)에 그린다. 기록이 없어도 기본값으로 그리므로 덮개는 항상 있다.
// 바탕에 안내선을 두지 않는 이유: 반투명 노선 아래로 비쳐 보인다. 속지 고르기 대표 그림은 따로 만든 routePaperSketchSvg 에서 뽑는다.
// 기록(page.planner)은 { options: { day, color, width, opacity } } 뿐이다. 지점은 캔버스 요소(스티커 하위 종류 routeNode)라 여기 두지 않는다.
import { LABEL, LINE, LINE_SOFT, TEXT, label, line, n, rect, svgOpen, textWidth, write } from './plannerDraw.js'
import { createRoutePath, routeSegments } from './routePath.js'
import { ROUTE_NODE_KINDS } from '../widgets/routeNode.js'

export const ROUTE_PAPER_VERSION = '1.0.0'
export const routePaperId = (orientation = 'landscape') => `route-planner-${orientation === 'portrait' ? 'portrait' : 'landscape'}`
export const isRoutePaperId = id => typeof id === 'string' && /^route-planner-(landscape|portrait)$/.test(id)
export const ROUTE_PAPER_TEMPLATES = ['landscape', 'portrait'].map(orientation => ({
  id: routePaperId(orientation), orientation, type: 'route', name: '여행 노선', templateVersion: ROUTE_PAPER_VERSION,
}))
export const ROUTE_PAPER_MENU_ITEM = { type: 'route', name: '여행 노선', assets: ROUTE_PAPER_TEMPLATES.map(t => ({ orientation: t.orientation, assetId: t.id })) }

/** 노선 색 추천 5종(기획 palette.json). 자유 색도 고를 수 있다. */
export const ROUTE_PALETTE = [['세이지', '#91A886'], ['라벤더', '#A69ACB'], ['하늘', '#87B9D5'], ['코랄', '#D99A8B'], ['차콜', '#626970']]
export const ROUTE_WIDTH_RANGE = { min: 2, max: 16 }
export const ROUTE_OPACITY_RANGE = { min: 0.2, max: 1 }
export const ROUTE_DAY_RANGE = { min: 1, max: 99 }
export const DEFAULT_ROUTE_OPTIONS = Object.freeze({ day: 1, color: '#91A886', width: 6, opacity: 1 })

// 앱 좌표계 1024 × 768 · 768 × 1024 기준. 머리줄(DAY n 제목 · 지역 · 날짜)은 다른 플래너와 같은 높이(글자 기준선 70 · 밑줄 71 · 구분선 92).
// 노선 경로는 기획 route-layouts.json 그대로(절대 좌표 M · H · C). 머리줄 아래 여백은 사진 · 글을 두는 자리다.
// 오른쪽 끝에서부터: 날짜 값 칸(VALUE) · 「날짜」 · 구분선 · 지역 값 칸 · 「지역」. 부제목 칸은 제목 구분선 뒤부터 「지역」 앞까지.
const VALUE = 96, LABEL_GAP = 8, LABEL_W = 28, SEP_GAP = 14
const right = L => ({
  date: { x: L.right - VALUE - LABEL_GAP - LABEL_W, line: [L.right - VALUE, L.right] },
  sep: L.right - VALUE - LABEL_GAP - LABEL_W - SEP_GAP,
  region: { x: L.right - VALUE - LABEL_GAP - LABEL_W - SEP_GAP * 2 - VALUE - LABEL_GAP - LABEL_W, line: [L.right - VALUE - LABEL_GAP - LABEL_W - SEP_GAP * 2 - VALUE, L.right - VALUE - LABEL_GAP - LABEL_W - SEP_GAP * 2] },
})
const LAYOUTS = {
  landscape: { w: 1024, h: 768, right: 984, path: 'M 75 230 H 860 C 990 230 990 400 860 400 H 160 C 30 400 30 570 160 570 H 950' },
  portrait: { w: 768, h: 1024, right: 728, path: 'M 80 300 H 610 C 735 300 735 540 610 540 H 150 C 25 540 25 790 150 790 H 685' },
}
for (const L of Object.values(LAYOUTS)) Object.assign(L, right(L))
export const routePaperLayout = orientation => LAYOUTS[orientation === 'portrait' ? 'portrait' : 'landscape']
// 범례: 아래 여백 왼쪽 한 줄. 노선 견본 선(64) 뒤에 출발 · 방문 · 도착 표식(반지름 7)과 이름(12). 각 항목의 누름 상자(box)는 위아래 16 · 좌우 8 여유.
export const ROUTE_LEGEND_KINDS = ROUTE_NODE_KINDS // 지점 종류와 이름(출발 · 방문 · 도착)은 지점 요소와 같다
const LEGEND_R = 7, LEGEND_TEXT = 12, LEGEND_LINE = 64
const legends = new Map()
/** 방향별 범례 항목 [{ kind: 'line', x1, x2, y, box }, { kind: 'start' | 'stop' | 'end', cx, cy, labelX, name, box }] */
export function routeLegend(orientation) {
  const L = routePaperLayout(orientation)
  if (legends.has(L)) return legends.get(L)
  const y = L.h - 44
  const items = [{ kind: 'line', x1: 40, x2: 40 + LEGEND_LINE, y, box: { x: 32, y: y - 16, w: LEGEND_LINE + 16, h: 32 } }]
  let x = 40 + LEGEND_LINE + 32
  for (const [kind, name] of ROUTE_LEGEND_KINDS) {
    const w = LEGEND_R * 2 + 8 + textWidth(name, LEGEND_TEXT)
    items.push({ kind, cx: x + LEGEND_R, cy: y, labelX: x + LEGEND_R * 2 + 8, name, box: { x: x - 8, y: y - 16, w: w + 16, h: 32 } })
    x += w + 28
  }
  legends.set(L, items)
  return items
}
/** 제목 "DAY n" 뒤 구분선의 x. 부제목 칸은 여기서 16 뒤부터 시작한다(번호 자릿수에 따라 움직이므로 기록이 필요하다) */
export const routeTitleEnd = value => 40 + textWidth(`DAY ${normalizeRoutePlanner(value).options.day}`, 30, 'B') + 16
const paths = new Map()
/** 방향별 노선 경로 객체(routePath.js). 지점 끌기 · 추가가 쓴다. */
export function routePathOf(orientation) {
  const L = routePaperLayout(orientation)
  if (!paths.has(L.path)) paths.set(L.path, createRoutePath(L.path))
  return paths.get(L.path)
}

// ---------- 기록 ----------
const HEX = /^#[0-9a-f]{6}$/i
const color = value => typeof value === 'string' && HEX.test(value) ? value.toUpperCase() : null
const within = (value, { min, max }, digits) => Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value)) * 10 ** digits) / 10 ** digits : null
/** 기록을 검증한 모양으로. 없는 값은 기본값, 범위 밖은 범위 안으로. */
export function normalizeRoutePlanner(value) {
  const o = value && typeof value === 'object' && value.options && typeof value.options === 'object' ? value.options : {}
  return { options: {
    day: Number.isFinite(o.day) ? Math.round(Math.min(ROUTE_DAY_RANGE.max, Math.max(ROUTE_DAY_RANGE.min, o.day))) : DEFAULT_ROUTE_OPTIONS.day,
    color: color(o.color) ?? DEFAULT_ROUTE_OPTIONS.color,
    width: within(o.width, ROUTE_WIDTH_RANGE, 1) ?? DEFAULT_ROUTE_OPTIONS.width,
    opacity: within(o.opacity, ROUTE_OPACITY_RANGE, 2) ?? DEFAULT_ROUTE_OPTIONS.opacity,
  } }
}
export function setRoutePlannerOptions(value, patch) {
  const planner = normalizeRoutePlanner(value)
  return normalizeRoutePlanner({ ...planner, options: { ...planner.options, ...patch } })
}
/** 새로 만드는 페이지들 중 노선 속지에 DAY 번호를 매긴다: 이미 있는 노선 페이지 수 다음부터 1씩. 번호가 있는 페이지는 그대로 둔다. */
export function assignRouteDays(pages, existingPages = []) {
  let day = existingPages.filter(page => isRoutePaperId(page?.backgroundAssetId)).length
  return pages.map(page => {
    if (!isRoutePaperId(page?.backgroundAssetId)) return page
    day += 1
    if (Number.isFinite(page.planner?.options?.day)) return page
    return { ...page, planner: { ...(page.planner ?? {}), options: { ...(page.planner?.options ?? {}), day } } }
  })
}

// ---------- 그림 ----------
function header(L) {
  const out = []
  for (const [key, name] of [['region', '지역'], ['date', '날짜']]) {
    const slot = L[key]
    out.push(label(slot.x, 68, name), line(slot.line[0], 71, slot.line[1], 71, LINE))
  }
  out.push(line(L.sep, 50, L.sep, 78, LINE)) // 지역 | 날짜
  out.push(line(40, 92, L.right, 92, LINE))
  return out.join('')
}
/** "DAY n" 제목 + 뒤 구분선 + 부제목 칸 밑줄. 다른 플래너 제목과 같은 자리 · 크기(40, 70 · 30 굵게). 번호 자릿수에 따라 구분선이 움직여 덮개에 그린다 */
const title = (L, value) => {
  const end = routeTitleEnd(value)
  return write(40, 70, { s: `DAY ${normalizeRoutePlanner(value).options.day}`, size: 30, weight: 'B', fill: TEXT })
    + line(end, 50, end, 78, LINE) + line(end + 16, 71, L.region.x - 24, 71, LINE_SOFT)
}
// 속지 고르기 대표 그림용 노선 요약(build-paper-sketches 는 <line> · <rect> · 글자만 뽑는다): 직선 조각은 그대로, 굽은 조각은 가장 바깥 x 의 세로선으로 둔다.
function routeSketchLines(L) {
  return routeSegments(L.path).map(s => s.kind === 'line'
    ? line(s.from.x, s.from.y, s.to.x, s.to.y, LINE)
    : line(s.c1.x > s.from.x ? Math.max(s.c1.x, s.c2.x) - 20 : Math.min(s.c1.x, s.c2.x) + 20, s.from.y, s.c1.x > s.from.x ? Math.max(s.c1.x, s.c2.x) - 20 : Math.min(s.c1.x, s.c2.x) + 20, s.to.y, LINE)).join('')
}
/** 범례: 지금 스타일의 노선 견본 선 + 지점 표식(RouteNodeArt 와 같은 모양) + 이름. 노선 색 부분은 속지 색 변경에서 보호한다 */
function legendSvg(orientation, value) {
  const { color, width, opacity } = normalizeRoutePlanner(value).options
  const keep = 'data-preserve-paint="true"'
  const out = []
  for (const item of routeLegend(orientation)) {
    if (item.kind === 'line') { out.push(`<line x1="${n(item.x1)}" y1="${n(item.y)}" x2="${n(item.x2)}" y2="${n(item.y)}" fill="none" stroke="${color}" stroke-width="${n(Math.min(width, 12))}" stroke-opacity="${n(opacity)}" stroke-linecap="round" ${keep}/>`); continue }
    const c = `cx="${n(item.cx)}" cy="${n(item.cy)}"`
    if (item.kind === 'start') out.push(`<circle ${c} r="${LEGEND_R}" fill="${color}" ${keep}/>`)
    else if (item.kind === 'stop') out.push(`<circle ${c} r="${LEGEND_R}" fill="#FFFFFF" stroke="${color}" stroke-width="2" ${keep}/>`)
    else out.push(`<circle ${c} r="${LEGEND_R + 1}" fill="#FFFFFF" stroke="${color}" stroke-width="2" ${keep}/>`, `<circle ${c} r="${LEGEND_R - 3}" fill="none" stroke="${color}" stroke-width="1.5" ${keep}/>`)
    out.push(write(item.labelX, item.cy + 4, { s: item.name, size: LEGEND_TEXT, fill: LABEL }))
  }
  return out.join('')
}
/** 노선 자체. 사용자가 고른 색은 속지 색(레이아웃 색) 변경에서 보호한다(data-preserve-paint). */
function routeStroke(L, value) {
  const { color, width, opacity } = normalizeRoutePlanner(value).options
  return `<path d="${L.path}" fill="none" stroke="${color}" stroke-width="${n(width)}" stroke-opacity="${n(opacity)}" stroke-linecap="round" stroke-linejoin="round" data-preserve-paint="true"/>`
}
const baseBody = L => rect(0, 0, L.w, L.h, 'fill="#FFFFFF"') + header(L)

/** 바탕 SVG(캐시용): 지역 · 날짜 칸 · 구분선 */
export const routePaperBaseSvg = orientation => { const L = routePaperLayout(orientation); return `${svgOpen(L)}${baseBody(L)}</svg>` }
/** 덮개 SVG: DAY 제목 · 부제목 칸 + 기록의 스타일로 그린 노선 + 범례. 기록이 없으면 기본값 */
export const routePaperOverlaySvg = (orientation, value) => { const L = routePaperLayout(orientation); return `${svgOpen(L)}${title(L, value)}${routeStroke(L, value)}${legendSvg(orientation, value)}</svg>` }
/** 속지 고르기 대표 그림(scripts/build-paper-sketches.mjs)용: 머리줄(DAY 1 포함) + 노선을 선으로 요약한 SVG. 화면에는 쓰지 않는다 */
export const routePaperSketchSvg = orientation => { const L = routePaperLayout(orientation); return `${svgOpen(L)}${baseBody(L)}${title(L, null)}${routeSketchLines(L)}</svg>` }
/** 바탕 + 제목 + 노선 + 범례를 한 장으로(내보내기 · 썸네일) */
export const routePaperSvg = (orientation, value) => { const L = routePaperLayout(orientation); return `${svgOpen(L)}${baseBody(L)}${title(L, value)}${routeStroke(L, value)}${legendSvg(orientation, value)}</svg>` }

// ---------- 입력 ----------
const TEXT_FONT = 'maruburi', TEXT_SIZE = 14, SUBTITLE_SIZE = 16, LINE_PITCH = 28
const SIT = 6 // 줄 칸(28) 안에서 글자 상자를 내려 앉히는 만큼: 14 크기 글자가 칸 이름과 같은 높이로 밑줄 위에 앉는다
const inBox = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
/** 선택 도구로 속지를 눌렀을 때: "DAY n" 제목 → DAY 번호 창, 범례 노선 견본 → 노선 스타일 창, 범례 표식 → 지점 추가 { routeAdd: kind }. 그 밖이면 null */
export function routeEditTap(orientation, value, point) {
  if (point.y >= 40 && point.y <= 88 && point.x >= 32 && point.x <= routeTitleEnd(value) - 8) return { picker: { kind: 'routeDay' } }
  for (const item of routeLegend(orientation)) {
    if (inBox(item.box, point)) return item.kind === 'line' ? { picker: { kind: 'routeStyle' } } : { routeAdd: item.kind }
  }
  return null
}
/** 머리줄 칸(부제목 · 지역 · 날짜)을 텍스트 도구로 누르면 밑줄 폭만큼의 글상자. 부제목 칸은 제목 번호 자릿수에 따라 시작이 달라 기록(value)을 받는다. 그 밖이면 null. */
export function routeTextSlot(orientation, point, value = null) {
  const L = routePaperLayout(orientation)
  if (point.y < 40 || point.y > 88) return null
  const slot = (from, to, fontSize = TEXT_SIZE) => ({ x: from, y: 71 - LINE_PITCH + SIT, width: to - from, font: TEXT_FONT, fontSize, lineSpacing: LINE_PITCH / fontSize })
  const subtitleFrom = routeTitleEnd(value) + 16, subtitleTo = L.region.x - 24
  if (point.x >= subtitleFrom - 4 && point.x <= subtitleTo) return slot(subtitleFrom, subtitleTo, SUBTITLE_SIZE)
  for (const key of ['region', 'date']) {
    const s = L[key]
    if (point.x >= s.x - 4 && point.x <= s.line[1]) return slot(s.line[0], s.line[1])
  }
  return null
}
