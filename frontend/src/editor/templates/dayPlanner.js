// 데일리 플래너 인터랙션 속지. 구글 캘린더 일간 보기처럼 시간이 세로로 흐르는 하루 계획 속지다. 하루 계획(2026-reusable-daily)은 그대로 두고 따로 만든 사본이다.
// 하루 24시간을 오전(0~12시) · 오후(12~24시) 두 열로 나눠 모두 그린다. 맨 위 종일 칸에는 시간 없이 할 일만 쓴 줄이 위에서부터 자동으로 올라온다.
// 왼쪽 일정 목록은 완료 · 할 일 · 시작 · 진행(지속 시간) · 색 순서다. 칸마다 입력 방법이 정해져 있다:
//   완료: 펜 · 형광펜으로 톡 → 그 색의 체크   할 일: 글자만(눌러서 텍스트 입력, 글꼴은 마루부리)   시작 · 진행: 눌러서 시각 · 시간 고르기(진행의 「종일」은 종일 칸으로)
// 선택(화살표) 도구로 눌러도 같다: 칸을 누르면 바로 그 칸의 입력이 열린다(dayEditTap).
//   색: 할 일이 채워지면 형광펜 프리셋을 안 겹치게 돌려 가며 자동으로 주고, 형광펜으로 쓸어 덮어쓸 수 있다.
// 시작 · 진행이 정해지면 시간표에 일정 막대가 자동으로 놓이고(겹치면 나란히), 막대 · 종일 칸에는 할 일 글이 함께 보인다.
// 날짜는 눌러서 고르면 요일에 동그라미가 자동으로 생긴다.
// 속지 그림은 스터디 플래너와 같은 방식으로 두 장이다: 바탕(dayPlannerBaseSvg)은 기록과 상관없어 캐시해 두고,
// 일정 · 체크 · 날짜 · 종일 칸은 덮개(dayPlannerOverlaySvg)에만 그린다. 할 일 글(page.objects 의 글상자)은 덮개를 그릴 때 읽어 막대에 비춘다. 내보내기는 둘을 합친 dayPlannerSvg 를 쓴다.
// 기록(page.planner)은 줄 번호별 { start, dur, color } 라서 막대 위치는 저장하지 않고 열 때마다 계산한다.
import { LABEL, LINE, LINE_SOFT, TEXT, box, checkPath, esc, hitCircle, label, line, n, rect, ruled, sample, span, svgOpen, textWidth, write } from './plannerDraw.js'
import { formatMinutes } from './studyPlanner.js'
import { HIGHLIGHTER_COLORS } from '../utils/penSettings.js'

export const DAY_PLANNER_VERSION = '1.0.0'
export const dayPlannerId = (orientation = 'landscape') => `day-planner-${orientation === 'portrait' ? 'portrait' : 'landscape'}`
export const isDayPlannerId = id => typeof id === 'string' && /^day-planner-(landscape|portrait)$/.test(id)
export const DAY_PLANNER_TEMPLATES = ['landscape', 'portrait'].map(orientation => ({
  id: dayPlannerId(orientation), orientation, type: 'day', name: '데일리 플래너', templateVersion: DAY_PLANNER_VERSION,
}))
export const DAY_PLANNER_MENU_ITEM = { type: 'day', name: '데일리 플래너', assets: DAY_PLANNER_TEMPLATES.map(t => ({ orientation: t.orientation, assetId: t.id })) }

export const LIST_ROWS = 12
export const DAY_STEP = 5 // 시각 · 진행 시간을 고르는 단위(분)
export const DURATION_RANGE = { min: DAY_STEP, max: 24 * 60 }
/** 일정 색을 자동으로 줄 때 돌려 쓰는 색 (형광펜 프리셋) */
export const DAY_PALETTE = HIGHLIGHTER_COLORS
const MINUTES = 24 * 60, NOON = 12 * 60, HALF_HOURS = 12, DRAG_SNAP = 15, TAP_DURATION = 60, DEFAULT_START = 9 * 60
// 시간표는 한 시간이 40 ~ 60px 라 목록 칸의 톡 기준(30px)이면 한 시간 가까이 그은 것도 톡이 된다. 시간표에서는 손끝이 거의 안 움직인 것만 톡으로 본다.
const GRID_TAP_SPAN = 6
const DAYS = ['월', '화', '수', '목', '금', '토', '일']
const HEAD = 30, CHECK_W = 34, START_W = 56, DUR_W = 80, COLOR_W = 34, CHECK_BOX = 12
const FILL_OPACITY = 0.78, TAP_SPAN = 30
// 일정 목록 칸 안의 글자(할 일 · 시작 · 진행)는 모두 이 크기 하나로 맞춘다. 머리줄 칸 이름(오늘의 목표 · 날짜)과 메모 이름은 14 라, 그 칸에 쓰는 글자도 14 로 맞춘다.
const LIST_TEXT = 13, HEAD_TEXT = 14
/** 날짜로 요일에 자동으로 치는 동그라미 색 (펜 · 형광펜으로 다시 그으면 그 색으로 바뀐다) */
export const DEFAULT_DAY_MARK = { color: '#EF476F', hl: false }
/** 시간표 현재 시각 줄 색 */
export const NOW_LINE_COLOR = '#EF476F'

// 앱 좌표계 1024 × 768 · 768 × 1024 기준 영역. 머리줄(제목 · 날짜 · 요일 · 오늘의 목표)은 다른 플래너와 같은 자리.
// 시간표는 종일 칸(laneRows 줄) · 오전/오후 이름줄(headH) · 12시간 세로 칸 두 열이고, 열마다 왼쪽에 시각 숫자 열(axis)이 있다.
const LAYOUTS = {
  landscape: { w: 1024, h: 768, right: 984,
    date: { x: 608, line: [644, 776] }, week: { x: 800, cy: 63 },
    heads: [['TO DO LIST', 40], ['TIMELINE', 514]],
    list: { x: 40, y: 180, w: 450, h: 366 }, memo: { x: 40, y: 546, w: 450, h: 182 },
    time: { x: 514, y: 180, w: 470, h: 548, axis: 30, laneRows: 2, laneRh: 24, headH: 20 } },
  portrait: { w: 768, h: 1024, right: 728,
    date: { x: 330, line: [366, 506] }, week: { x: 548, cy: 63 },
    heads: [['TO DO LIST', 40], ['TIMELINE', 420]],
    list: { x: 40, y: 180, w: 360, h: 486 }, memo: { x: 40, y: 666, w: 360, h: 318 },
    time: { x: 420, y: 180, w: 308, h: 804, axis: 28, laneRows: 3, laneRh: 20, headH: 24 } },
}
export const dayPlannerLayout = orientation => LAYOUTS[orientation === 'portrait' ? 'portrait' : 'landscape']

// ---------- 기록 ----------
const HEX = /^#[0-9a-f]{6}$/i
const color = value => typeof value === 'string' && HEX.test(value) ? value.toUpperCase() : null
const whole = (value, min, max) => Number.isInteger(value) && value >= min && value <= max
export const DEFAULT_DAY_OPTIONS = { snap: true }
/** 시작 · 진행이 모두 정해진 줄만 시간표에 놓인다. 색만 있는 줄은 색 칸만 칠해 둔 것, allDay 인 줄은 종일 칸에 올라간다. */
export const isScheduled = row => row?.start != null && row?.dur != null
export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate()
/** 날짜의 요일 번호 (월 0 ~ 일 6) */
export const weekdayOf = ({ y, m, d }) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
/** 2026. 10. 31 */
export const formatDate = ({ y, m, d }) => `${y}. ${m}. ${d}`

function normalizeRow(row) {
  const c = color(row?.color), timed = whole(row?.start, 0, MINUTES - 1) && whole(row?.dur, DURATION_RANGE.min, DURATION_RANGE.max)
  const allDay = !timed && row?.allDay === true // 종일: 시간표 대신 종일 칸에 올라가는 줄
  return c || timed || allDay ? { color: c, start: timed ? row.start : null, dur: timed ? row.dur : null, ...(allDay ? { allDay: true } : {}) } : null
}
function normalizeDate(date) {
  return whole(date?.y, 1900, 2200) && whole(date?.m, 1, 12) && whole(date?.d, 1, daysInMonth(date.y, date.m)) ? { y: date.y, m: date.m, d: date.d } : null
}

export function normalizeDayPlanner(value) {
  const v = value && typeof value === 'object' ? value : {}
  const entries = source => Object.entries(source && typeof source === 'object' ? source : {})
  const keyed = (source, count, read) => Object.fromEntries(entries(source).filter(([k]) => /^\d{1,2}$/.test(k) && +k < count).flatMap(([k, x]) => { const y = read(x); return y ? [[k, y]] : [] }))
  const mark = m => m && Number.isInteger(m.i) && m.i >= 0 && m.i < DAYS.length && color(m.color) ? { i: m.i, color: color(m.color), hl: Boolean(m.hl) } : null
  return {
    rows: keyed(v.rows, LIST_ROWS, normalizeRow), checks: keyed(v.checks, LIST_ROWS, color),
    date: normalizeDate(v.date), day: mark(v.day), options: { snap: v.options?.snap !== false },
  }
}

/** 지금 요일 동그라미: 날짜가 있으면 그 날짜의 요일에 자동으로 치고(색 · 모양은 다시 그은 것을 따른다), 없으면 눌러서 표시한 것. 없으면 null. */
export function effectiveDay(value) {
  const planner = normalizeDayPlanner(value)
  return planner.date ? { i: weekdayOf(planner.date), color: planner.day?.color ?? DEFAULT_DAY_MARK.color, hl: planner.day?.hl ?? DEFAULT_DAY_MARK.hl } : planner.day
}

/** 일정 목록 한 줄을 바꾼다. row 가 null 이면 그 줄을 비운다. */
export function setDayRow(value, index, row) {
  const planner = normalizeDayPlanner(value), rows = { ...planner.rows }
  if (row) rows[index] = row; else delete rows[index]
  return normalizeDayPlanner({ ...planner, rows })
}
/** 날짜를 고른다. null 이면 날짜와 요일 표시를 비운다. */
export function setDayDate(value, date) {
  const planner = normalizeDayPlanner(value)
  return normalizeDayPlanner({ ...planner, date, day: date ? planner.day : null })
}
export function setDayPlannerOptions(value, patch) {
  const planner = normalizeDayPlanner(value)
  return normalizeDayPlanner({ ...planner, options: { ...planner.options, ...patch } })
}

/** 새 일정이 시작할 자리: 이미 놓은 일정 중 가장 늦게 끝나는 시각, 없으면 9시. */
export function suggestStart(value) {
  const ends = Object.values(normalizeDayPlanner(value).rows).filter(isScheduled).map(r => r.start + r.dur)
  return ends.length ? Math.min(MINUTES - DAY_STEP, Math.max(...ends)) : DEFAULT_START
}

/** 09:05 */
export const clock = minute => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
/** 진행 시간을 고르는 시간 목록(0~24시간, 일정 최대 길이까지). 시간표를 길게 긋거나 자정을 넘긴 일정도 휠에 맞는 값이 있다. */
export const DURATION_HOURS = Array.from({ length: DURATION_RANGE.max / 60 + 1 }, (_, i) => i)

// ---------- 영역 판정 ----------
function listGeo(L) {
  const t = L.list, rh = (t.h - HEAD) / LIST_ROWS
  const colorX = t.x + t.w - COLOR_W, durX = colorX - DUR_W, startX = durX - START_W, textX = t.x + CHECK_W
  return { t, rh, textX, startX, durX, colorX }
}
/** 일정 목록 줄과 칸. part: 'box'(완료 체크) · 'text'(할 일 글자) · 'start' · 'dur' · 'color'(색) */
function rowAt(L, p) {
  const g = listGeo(L), r = Math.floor((p.y - g.t.y - HEAD) / g.rh)
  if (r < 0 || r >= LIST_ROWS || p.x < g.t.x || p.x > g.t.x + g.t.w) return null
  return { r, part: p.x < g.textX ? 'box' : p.x < g.startX ? 'text' : p.x < g.durX ? 'start' : p.x < g.colorX ? 'dur' : 'color' }
}
/** 시간표: 오전(0) · 오후(1) 두 열. 열마다 왼쪽 시각 열(x ~ bx)과 일정이 놓이는 칸(bx ~ bx + bw). */
function grid(L) {
  const t = L.time, laneH = t.laneRows * t.laneRh, hw = t.w / 2
  return {
    t, laneH, hw, laneX: t.x + t.axis, laneW: t.w - t.axis,
    halves: [0, 1].map(i => ({ x: t.x + i * hw, bx: t.x + i * hw + t.axis, bw: hw - t.axis })),
    y0: t.y + laneH + t.headH, hh: (t.h - laneH - t.headH) / HALF_HOURS,
  }
}
const halfOfX = (g, x) => x < g.t.x + g.hw ? 0 : 1
/** 일정이 놓이는 칸 안이면 그 점이 가리키는 열(0 오전 · 1 오후), 아니면 -1 */
function gridHalf(g, p) {
  if (p.y < g.y0 || p.y >= g.y0 + HALF_HOURS * g.hh) return -1
  return g.halves.findIndex(h => p.x >= h.bx && p.x <= h.bx + h.bw)
}
/** 열 half 의 높이 y 가 가리키는 시각(분, 0~1440) */
const minuteAt = (g, half, y) => half * NOON + Math.max(0, Math.min(NOON, (y - g.y0) / g.hh * 60))
function days(L) { const w = L.week; return DAYS.map((_, i) => ({ cx: w.x + i * 26, cy: w.cy, r: 11 })) }
/** 오늘의 목표 칸(이름 + 밑줄) */
const inGoalZone = (L, p) => p.y > 96 && p.y <= 142 && p.x >= 40 && p.x <= L.right
/** 날짜 칸(이름 + 밑줄) */
const inDateZone = (L, p) => p.y >= 40 && p.y <= 88 && p.x >= L.date.x - 4 && p.x <= L.date.line[1]

/**
 * 시간표에 놓이는 일정 막대 조각. 오전 · 오후 열마다 따로 놓이고, 정오를 걸치면 두 조각으로 나뉘며 자정을 넘는 부분은 오전 열 맨 위에서 이어진다.
 * 겹치는 일정은 같은 열 안에서 폭을 나눠 나란히 놓는다(구글 캘린더 일간 보기와 같은 방식). head: 시작 시각이 있는 조각.
 */
function blocksOf(L, planner) {
  const g = grid(L), pieces = []
  for (const [k, r] of Object.entries(planner.rows)) {
    if (!isScheduled(r)) continue
    const end = r.start + r.dur
    const spans = [[r.start, Math.min(end, MINUTES), true], ...(end > MINUTES ? [[0, end - MINUTES, false]] : [])]
    for (const [a, b, head] of spans) {
      const cuts = a < NOON && b > NOON ? [[a, NOON], [NOON, b]] : [[a, b]]
      cuts.forEach(([from, to], i) => {
        const half = from >= NOON ? 1 : 0
        pieces.push({ row: +k, start: r.start, dur: r.dur, color: r.color, half, from: from - half * NOON, to: to - half * NOON, head: head && i === 0 })
      })
    }
  }
  const out = []
  for (const half of [0, 1]) {
    const items = pieces.filter(i => i.half === half).sort((a, b) => a.from - b.from || b.to - a.to || a.row - b.row)
    let cluster = [], clusterEnd = 0, columnEnds = []
    const close = () => { const cols = Math.max(...cluster.map(i => i.col)) + 1; for (const i of cluster) i.cols = cols; cluster = []; columnEnds = [] }
    for (const item of items) {
      if (cluster.length && item.from >= clusterEnd) close()
      let col = columnEnds.findIndex(end => end <= item.from)
      if (col < 0) col = columnEnds.length
      columnEnds[col] = item.to; item.col = col; cluster.push(item); clusterEnd = Math.max(clusterEnd, item.to)
    }
    if (cluster.length) close()
    const { bx, bw } = g.halves[half]
    for (const i of items) {
      const colW = (bw - 6) / i.cols
      out.push({ ...i, x: bx + 3 + i.col * colW, y: g.y0 + i.from / 60 * g.hh + 1, w: colW - (i.cols > 1 ? 1.5 : 0), h: Math.max(3, (i.to - i.from) / 60 * g.hh - 2) })
    }
  }
  return out
}
/** 시간표에 놓이는 일정 막대 조각(테스트 · 화면 확인용). */
export const dayPlannerBlocks = (orientation, value) => blocksOf(dayPlannerLayout(orientation), normalizeDayPlanner(value))
const within = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h

// ---------- 할 일 글자 ----------
const center = o => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 })
/** 글상자가 놓인 할 일 줄 번호 (할 일 칸 밖이면 -1) */
function titleRowOf(L, o) {
  if (![o.x, o.y, o.w, o.h].every(Number.isFinite)) return -1
  const at = rowAt(L, center(o))
  return at?.part === 'text' ? at.r : -1
}
/**
 * 줄마다 할 일 글 { 줄 번호: 글 }. 글상자의 가운데가 할 일 칸에 있으면 그 줄의 할 일이다(글자 없는 상자 · 숨긴 상자는 뺀다).
 * 한 줄에 상자가 여럿이면 왼쪽부터 이어 붙인다.
 */
export function dayTitles(orientation, objects) {
  const L = dayPlannerLayout(orientation), found = {}
  for (const o of objects ?? []) {
    if (o?.type !== 'text' || o.hidden) continue
    const text = String(o.text ?? '').replace(/\s+/g, ' ').trim(), r = text ? titleRowOf(L, o) : -1
    if (r >= 0) (found[r] ??= []).push({ x: o.x, text })
  }
  return Object.fromEntries(Object.entries(found).map(([r, list]) => [r, list.sort((a, b) => a.x - b.x).map(i => i.text).join(' ')]))
}
/** 할 일 칸 안에 글자가 있는 줄 번호들 */
export const dayTitleRows = (orientation, objects) => new Set(Object.keys(dayTitles(orientation, objects)).map(Number))
/** point 가 가리키는 할 일 칸 · 오늘의 목표 칸에 이미 있는 글상자(없으면 null). 눌렀을 때 새로 만들지 않고 그 글을 고친다. */
export function dayTitleAt(orientation, point, objects) {
  const L = dayPlannerLayout(orientation), at = rowAt(L, point), editable = o => o?.type === 'text' && !o.hidden && !o.locked && [o.x, o.y, o.w, o.h].every(Number.isFinite)
  if (at?.part === 'text') return (objects ?? []).find(o => editable(o) && titleRowOf(L, o) === at.r) ?? null
  if (!at && inGoalZone(L, point)) return (objects ?? []).find(o => editable(o) && inGoalZone(L, center(o))) ?? null
  return null
}

/**
 * 할 일 · 시간(시작 · 진행) · 종일 중 하나라도 있는데 색이 없는 줄에 색을 준다. 형광펜 프리셋을 안 겹치게 돌려 가며(가장 적게 쓰인 색, 같으면 프리셋 순서) 위 줄부터.
 * 이미 색이 있는 줄(형광펜으로 고른 색)은 그대로 둔다. 바뀐 것이 없으면 null.
 */
export function assignDayColors(value, orientation, objects) {
  const planner = normalizeDayPlanner(value), titles = dayTitles(orientation, objects), rows = { ...planner.rows }
  const used = Object.fromEntries(DAY_PALETTE.map(c => [c, 0]))
  for (const r of Object.values(rows)) if (r.color && r.color in used) used[r.color]++
  let changed = false
  // 할 일이 있거나, 종일로 정했거나, 시간이 정해진 줄(할 일보다 시간을 먼저 적어도 색이 붙는다)
  const targets = new Set([...Object.keys(titles), ...Object.entries(rows).filter(([, r]) => r.allDay || isScheduled(r)).map(([k]) => k)])
  for (const k of [...targets].sort((a, b) => a - b)) {
    if (rows[k]?.color) continue
    const pick = DAY_PALETTE.reduce((best, c) => used[c] < used[best] ? c : best, DAY_PALETTE[0])
    rows[k] = { start: null, dur: null, ...rows[k], color: pick }; used[pick]++; changed = true
  }
  return changed ? normalizeDayPlanner({ ...planner, rows }) : null
}

/** 종일 칸에 올라오는 줄: 진행을 「종일」로 정한 줄과, 할 일만 있고 시간이 없는 줄을 위에서부터 칸 수만큼. more: 칸에 못 올라온 줄 수. */
function laneItems(L, planner, titles) {
  const rows = new Set([...Object.keys(titles).map(Number), ...Object.entries(planner.rows).filter(([, r]) => r.allDay).map(([k]) => +k)])
  const all = [...rows].sort((a, b) => a - b).filter(r => !isScheduled(planner.rows[r]))
  return { items: all.slice(0, L.time.laneRows).map(row => ({ row, title: titles[row] ?? '', color: planner.rows[row]?.color ?? null })), more: Math.max(0, all.length - L.time.laneRows) }
}

/**
 * 시간표의 현재 시각 줄(구글 캘린더 일간 보기의 빨간 줄). 지금이 들어 있는 오전/오후 열 안의 { x, y, w } (앱 좌표).
 * 날짜를 골랐는데 오늘이 아니면 null(날짜를 아직 안 골랐으면 오늘로 본다). 화면에서만 그리는 표시라 SVG · 내보내기에는 넣지 않는다.
 */
export function dayNowLine(orientation, value, now = new Date()) {
  const planner = normalizeDayPlanner(value), date = planner.date
  if (date && (date.y !== now.getFullYear() || date.m !== now.getMonth() + 1 || date.d !== now.getDate())) return null
  const g = grid(dayPlannerLayout(orientation)), minute = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  const half = minute >= NOON ? 1 : 0, { bx, bw } = g.halves[half]
  return { x: bx, y: g.y0 + (minute - half * NOON) / 60 * g.hh, w: bw, half }
}

// ---------- 글상자 자리 ----------
// 줄 맞춤 글상자: 줄 간격 28 에 맞는 글자 크기 (스터디 플래너와 같다)
const LINE_PITCH = 28, TITLE_LINE = 20
const SIT = 6 // 줄 칸(28) 안에서 글자 상자를 내려 앉히는 만큼: 14 크기 글자가 칸 이름과 같은 높이로 밑줄 위에 앉는다
// 속지에 쓰는 글자는 속지 글꼴(마루부리)이 기본이다. 할 일 · 오늘의 목표 · 메모 글상자는 이 글꼴로 만든다.
const TEXT_FONT = 'maruburi'
/**
 * 텍스트 도구로 할 일 · 오늘의 목표 · 메모를 탭한 자리에 줄 맞춘 글상자 자리. 그 밖이면 null.
 * { x, y, width, fontSize, lineSpacing }
 */
export function dayTextSlot(orientation, point) {
  const L = dayPlannerLayout(orientation), style = { font: TEXT_FONT, fontSize: HEAD_TEXT, lineSpacing: LINE_PITCH / HEAD_TEXT }
  const at = rowAt(L, point)
  if (at?.part === 'text') {
    // 글자 크기는 시작 · 진행 칸과 같다(LIST_TEXT). 한 줄짜리 칸이라 줄 높이를 글자에 가깝게(20) 줄여 줄 가운데에 앉힌다. 28 로 두면 입력 중 테두리와 커서가 칸 아래로 튀어나온다.
    const g = listGeo(L), x = g.textX + 10
    return { x, y: g.t.y + HEAD + at.r * g.rh + (g.rh - TITLE_LINE) / 2, width: g.startX - 8 - x, font: TEXT_FONT, fontSize: LIST_TEXT, lineSpacing: TITLE_LINE / LIST_TEXT }
  }
  if (inGoalZone(L, point)) return { x: 124, y: 133 - LINE_PITCH + SIT, width: L.right - 124, ...style } // 글자가 밑줄 위에 앉는다
  const R = L.memo
  if (point.x >= R.x && point.x <= R.x + R.w && point.y >= R.y + 34 && point.y <= R.y + R.h) {
    const lines = Math.max(1, Math.floor((R.h - 8 - 30) / LINE_PITCH))
    const k = Math.max(0, Math.min(lines - 1, Math.floor((point.y - (R.y + 30)) / LINE_PITCH)))
    return { x: R.x + 12, y: R.y + 30 + k * LINE_PITCH + SIT, width: R.w - 24, ...style }
  }
  return null
}

/** 텍스트 도구로 시작 · 진행 · 날짜 칸을 탭하면 글상자 대신 고르는 창을 연다. 그 밖이면 null. */
export function dayCellTap(orientation, point) {
  const L = dayPlannerLayout(orientation), at = rowAt(L, point)
  if (at?.part === 'start' || at?.part === 'dur') return { picker: { kind: 'time', row: at.r } }
  return inDateZone(L, point) ? { picker: { kind: 'date' } } : null
}

/**
 * 선택(화살표) 도구로 칸을 톡 눌렀을 때 그 칸의 입력을 연다. 칸이 아니면 null.
 *   완료: 체크를 켜고 끈다(color 로 친다)   할 일 · 오늘의 목표: 글 입력   시작 · 진행 · 시간표 막대 · 종일 칸 막대: 시간 고르기   날짜: 날짜 고르기   색: 받지 않는다
 * 결과는 applyDayStroke 와 같다: { planner } | { picker } | { text: 점 }
 */
export function dayEditTap(orientation, point, value, objects, markColor) {
  const planner = normalizeDayPlanner(value), L = dayPlannerLayout(orientation), at = rowAt(L, point)
  if (at) {
    if (at.part === 'box') {
      const checks = { ...planner.checks }
      if (checks[at.r]) delete checks[at.r]; else checks[at.r] = color(markColor) ?? color(TEXT)
      return { planner: { ...planner, checks } }
    }
    if (at.part === 'text') return { text: point }
    if (at.part === 'start' || at.part === 'dur') return { picker: { kind: 'time', row: at.r } }
    return null
  }
  if (inDateZone(L, point)) return { picker: { kind: 'date' } }
  if (inGoalZone(L, point)) return { text: point }
  const block = [...blocksOf(L, planner)].reverse().find(b => within(b, point))
  if (block) return { picker: { kind: 'time', row: block.row } } // 막대를 누르면 그 줄의 시간 창
  const G = grid(L), lane = laneItems(L, planner, dayTitles(orientation, objects))
  const item = lane.items.find((_, i) => point.x >= G.laneX && point.x <= G.t.x + G.t.w && point.y >= G.t.y + i * G.t.laneRh && point.y < G.t.y + (i + 1) * G.t.laneRh)
  return item ? { picker: { kind: 'time', row: item.row } } : null // 종일 칸 막대도 그 줄의 시간 창
}

// ---------- 획 → 기록 ----------
/**
 * 펜 · 형광펜 획을 속지 기록으로 바꾼다. 속지 영역에서 시작한 획이 아니면 null(보통 획으로 남긴다).
 * settings: { kind, color } — kind 가 'highlighter' 면 형광펜, 그 밖은 펜.
 * 칸은 글을 쓰는 곳이 아니라 입력 칸이라, 목록 · 날짜 칸에서 시작한 획은 모두 그 칸의 입력으로 받고 잉크는 남기지 않는다.
 * 결과(비어 있는 {} 는 받았지만 바꿀 것이 없음):
 *   { planner } 새 기록 · { picker: { kind: 'time', row } | { kind: 'date' } } 고르는 창 열기 · { text: 점 } 할 일 칸에 글 입력(글상자 만들기 · 고치기)
 */
export function applyDayStroke(value, orientation, points, settings, objects) {
  const planner = normalizeDayPlanner(value)
  if (!planner.options.snap || !points?.length) return null
  const L = dayPlannerLayout(orientation), first = points[0], last = points[points.length - 1], hl = settings?.kind === 'highlighter', c = color(settings?.color)
  if (!c) return null
  const tap = span(points) < TAP_SPAN, at = rowAt(L, first)
  if (at) {
    if (at.part === 'box') return { planner: { ...planner, checks: { ...planner.checks, [at.r]: c } } }
    if (at.part === 'text') return { text: first }
    if (at.part === 'start' || at.part === 'dur') return { picker: { kind: 'time', row: at.r } }
    // 색 칸을 형광펜으로 쓸면 지나간 줄의 색이 그 색으로 바뀐다(막대 색도 따라 바뀐다). 펜은 받지 않는다.
    if (!hl) return {}
    const rows = { ...planner.rows }
    for (const p of sample(points)) { const hit = rowAt(L, p); if (hit && hit.part !== 'box') rows[hit.r] = { start: null, dur: null, ...rows[hit.r], color: c } }
    return { planner: normalizeDayPlanner({ ...planner, rows }) }
  }
  if (inDateZone(L, first)) return { picker: { kind: 'date' } }
  // 시간표를 형광펜으로 위아래로 그으면 그 시간만큼 일정이 생기고, 비어 있는 첫 목록 줄(없으면 시간 없는 첫 줄)에 시작 · 진행이 적힌다. 톡 누르면 한 시간.
  // 색은 할 일을 쓰면 자동으로 붙는다(형광펜 색을 그대로 쓰지 않는다). 오전 열에서 시작해 오후 열로 넘어가도(또는 그 반대) 이어진 일정이 된다.
  const g = grid(L), half = gridHalf(g, first)
  if (hl && half >= 0) {
    const open = Array.from({ length: LIST_ROWS }, (_, i) => i).filter(i => !isScheduled(planner.rows[i])), titled = dayTitles(orientation, objects)
    const free = open.find(i => !(i in titled) && !planner.rows[i]?.allDay) ?? open[0]
    if (free == null) return null
    const a = minuteAt(g, half, first.y), b = minuteAt(g, halfOfX(g, last.x), last.y)
    const from = Math.floor(Math.min(a, b) / DRAG_SNAP) * DRAG_SNAP
    const to = span(points) < GRID_TAP_SPAN ? Math.min(MINUTES, from + TAP_DURATION) : Math.min(MINUTES, Math.max(from + DRAG_SNAP, Math.ceil(Math.max(a, b) / DRAG_SNAP) * DRAG_SNAP))
    if (to - from < DURATION_RANGE.min) return null
    return { planner: setDayRow(planner, free, { color: planner.rows[free]?.color ?? null, start: from % MINUTES, dur: to - from }) }
  }
  // 요일: 날짜를 골랐으면 요일은 날짜가 정하고 동그라미 색 · 모양만 다시 그어 바꾼다. 날짜가 없으면 톡 눌러 표시한다.
  const circles = days(L), now = effectiveDay(planner)
  let hit = hitCircle(circles, first)
  if (hit < 0 && span(points) < TAP_SPAN * 2) {
    const mid = { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length }
    hit = hitCircle(circles, mid)
  }
  if (hit >= 0) {
    if (planner.date) return hit === now.i ? { planner: { ...planner, day: { i: hit, color: c, hl } } } : {}
    return tap ? { planner: { ...planner, day: { i: hit, color: c, hl } } } : null
  }
  return null
}

/**
 * 지우개 경로가 지나간 기록을 지운다. 바뀐 것이 없으면 null.
 * 일정 막대 · 시작 · 진행 칸은 그 줄의 시간을 비우고(색은 남는다), 색 칸은 줄을 통째로 비운다.
 * 체크 · 요일 모양은 닿은 것 하나씩, 날짜 칸은 날짜와 요일 표시를 지운다. 할 일 글자는 보통 글상자라 여기서 건드리지 않는다.
 */
export function eraseDayPlanner(value, orientation, points) {
  if (!points?.length) return null
  const planner = normalizeDayPlanner(value), L = dayPlannerLayout(orientation), blocks = blocksOf(L, planner)
  const rows = { ...planner.rows }, checks = { ...planner.checks }
  let { date, day } = planner, changed = false
  const drop = (map, key) => { if (key in map) { delete map[key]; changed = true } }
  const unschedule = r => { if (isScheduled(rows[r]) || rows[r]?.allDay) { rows[r] = { ...rows[r], start: null, dur: null, allDay: false }; changed = true } }
  const circles = days(L)
  for (const p of sample(points)) {
    const at = rowAt(L, p)
    if (at) {
      if (at.part === 'box') drop(checks, String(at.r))
      else if (at.part === 'start' || at.part === 'dur') unschedule(String(at.r))
      else if (at.part === 'color') drop(rows, String(at.r))
      continue
    }
    if (inDateZone(L, p)) { if (date) { date = null; day = null; changed = true } continue }
    const block = [...blocks].reverse().find(b => within(b, p))
    if (block) { unschedule(String(block.row)); continue }
    const d = hitCircle(circles, p)
    if (d >= 0 && day && (planner.date || day.i === d)) { day = null; changed = true }
  }
  return changed ? normalizeDayPlanner({ ...planner, rows, checks, date, day }) : null
}

// ---------- SVG ----------
const pad2 = v => String(v).padStart(2, '0')
// 할 일 글은 글자 윤곽 표에 없는 글자도 쓰므로 기기 글꼴(<text>)로 그린다. 시각 · 숫자 같은 정해진 글자만 윤곽 글자다.
const glyphUnits = ch => ch === ' ' ? 0.3 : /[\u1100-\u11FF\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? 1 : /[A-Z]/.test(ch) ? 0.65 : 0.55
const textUnits = (s, size) => [...s].reduce((sum, ch) => sum + glyphUnits(ch), 0) * size
/** 폭 max 안에 들어오게 자르고 끝에 …을 붙인다. 한 글자도 안 들어가면 빈 글. */
function fitText(s, size, max) {
  if (textUnits(s, size) <= max) return s
  let out = ''
  for (const ch of s) { if (textUnits(out + ch + '…', size) > max) break; out += ch }
  return out ? out + '…' : ''
}
// 속지 글꼴(마루부리)은 앱이 불러온 글꼴이다. 굵은 글자는 Bold 글꼴 파일을 따로 쓴다(글꼴이 없을 때만 기기 명조로 보인다).
const deviceText = (x, y, s, size, { weight = 400, anchor = 'start' } = {}) => s
  ? `<text x="${n(x)}" y="${n(y)}" font-size="${size}" font-weight="400" font-family="${weight >= 700 ? 'MaruBuriBold' : 'MaruBuri'}, serif" text-anchor="${anchor}" fill="${TEXT}">${esc(s)}</text>` : ''
// 색이 있으면 그 색(속지 배색에서 제외), 아직 없으면 회색
const barRect = (R, c, userRect) => c ? userRect(R.x, R.y, R.w, R.h, `rx="3" fill="${c}" fill-opacity="${FILL_OPACITY}"`) : rect(R.x, R.y, R.w, R.h, `rx="3" fill="${LINE_SOFT}" stroke="${LINE}" stroke-width="1"`)
const listRowY = (g, r) => g.t.y + HEAD + r * g.rh

/** 기록과 상관없는 바탕. */
function baseBody(orientation) {
  const L = dayPlannerLayout(orientation), out = [rect(0, 0, L.w, L.h, 'fill="#FFFFFF"')]
  // 머리줄 — 다른 플래너와 같은 제목 · 칸 이름 · 밑줄
  out.push(write(40, 70, { s: '데일리 플래너', size: 30, weight: 'B', fill: TEXT }))
  out.push(label(L.date.x, 68, '날짜'), line(L.date.line[0], 71, L.date.line[1], 71, LINE))
  days(L).forEach((c, i) => out.push(write(c.cx, c.cy + 5, { s: DAYS[i], size: 14 }, 'middle')))
  out.push(line(40, 92, L.right, 92, LINE))
  out.push(label(40, 130, '오늘의 목표'), line(124, 133, L.right, 133, LINE))
  for (const [name, x] of L.heads) out.push(write(x, 166, { s: name, size: 16, weight: 'B', fill: TEXT }))

  // 일정 목록: 완료 · 할 일 · 시작 · 진행 · 색
  const P = listGeo(L), t = P.t
  out.push(box(t), line(t.x, t.y + HEAD, t.x + t.w, t.y + HEAD, LINE))
  for (const x of [P.textX, P.startX, P.durX, P.colorX]) out.push(line(x, t.y, x, t.y + t.h, LINE))
  out.push(write(t.x + CHECK_W / 2, t.y + 20, { s: '완료', size: 11.5 }, 'middle'), label(P.textX + 12, t.y + 20, '할 일', 12.5))
  out.push(write((P.startX + P.durX) / 2, t.y + 20, { s: '시작', size: 11.5 }, 'middle'), write((P.durX + P.colorX) / 2, t.y + 20, { s: '진행', size: 11.5 }, 'middle'), write(P.colorX + COLOR_W / 2, t.y + 20, { s: '색', size: 11.5 }, 'middle'))
  for (let r = 0; r < LIST_ROWS; r++) {
    const y = listRowY(P, r)
    if (r > 0) out.push(line(t.x, y, t.x + t.w, y))
    out.push(rect(t.x + (CHECK_W - CHECK_BOX) / 2, y + (P.rh - CHECK_BOX) / 2, CHECK_BOX, CHECK_BOX, `fill="none" stroke="${LABEL}" stroke-width="1"`))
  }
  out.push(ruled(L.memo, '메모'))

  // 시간표: 종일 칸 · 오전/오후 이름줄 · 12시간 세로 칸 두 열(정시는 실선, 30분은 점선)
  const G = grid(L), tm = G.t, right = tm.x + tm.w
  out.push(box(tm))
  for (let i = 1; i < tm.laneRows; i++) out.push(line(G.laneX, tm.y + i * tm.laneRh, right, tm.y + i * tm.laneRh))
  out.push(line(G.laneX, tm.y, G.laneX, tm.y + G.laneH, LINE), write(tm.x + tm.axis / 2, tm.y + G.laneH / 2 + 4, { s: '종일', size: 11.5 }, 'middle'))
  out.push(line(tm.x, tm.y + G.laneH, right, tm.y + G.laneH, LINE), line(tm.x, G.y0, right, G.y0, LINE))
  G.halves.forEach((half, i) => {
    out.push(write(half.x + G.hw / 2, tm.y + G.laneH + tm.headH / 2 + 4, { s: i ? '오후' : '오전', size: 12 }, 'middle'))
    out.push(line(half.bx, G.y0, half.bx, tm.y + tm.h, LINE))
    if (i) out.push(line(half.x, tm.y + G.laneH, half.x, tm.y + tm.h, LINE))
    for (let h = 0; h < HALF_HOURS; h++) {
      const y = G.y0 + h * G.hh
      if (h > 0) out.push(line(half.x, y, half.x + G.hw, y))
      out.push(line(half.bx, y + G.hh / 2, half.x + G.hw, y + G.hh / 2, LINE_SOFT, '2 3'))
      out.push(write(half.x + tm.axis / 2, y + 12, { s: pad2(i * HALF_HOURS + h), size: 11 }, 'middle'))
    }
  })
  return out.join('')
}

/** 기록만 그린 덮개(투명 바탕). */
function overlayBody(orientation, value, objects) {
  const L = dayPlannerLayout(orientation), p = normalizeDayPlanner(value), titles = dayTitles(orientation, objects), out = []
  // 사용자 색 도형만 속지 배색에서 제외한다(글자는 배색을 따른다).
  const userRect = (...args) => rect(...args).replace('/>', ' data-preserve-paint="true"/>')

  // 날짜: 밑줄 위에 쓴다. 요일은 날짜에서 정해 동그라미를 치고, 형광펜은 동그란 칠 위에 글자를 다시 쓴다.
  if (p.date) out.push(write(L.date.line[0] + 6, 68, { s: formatDate(p.date), size: 14, fill: TEXT }))
  const day = effectiveDay(p)
  if (day) {
    const c = days(L)[day.i]
    if (day.hl) out.push(`<circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="${c.r}" fill="${day.color}" fill-opacity="0.6" data-preserve-paint="true"/>`, write(c.cx, c.cy + 5, { s: DAYS[day.i], size: 14 }, 'middle'))
    else out.push(`<circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="${c.r}" fill="none" stroke="${day.color}" stroke-width="1.6" data-preserve-paint="true"/>`)
  }

  // 일정 목록: 체크 · 시작 · 진행 · 색 칸(색만 찬다)
  const P = listGeo(L)
  for (let r = 0; r < LIST_ROWS; r++) {
    const y = listRowY(P, r), cy = y + P.rh / 2, row = p.rows[r]
    if (row?.color) out.push(userRect(P.colorX + 5, y + 5, COLOR_W - 10, P.rh - 10, `rx="2" fill="${row.color}" fill-opacity="${FILL_OPACITY}"`))
    if (isScheduled(row)) {
      out.push(write((P.startX + P.durX) / 2, cy + 4.5, { s: clock(row.start), size: LIST_TEXT, fill: TEXT }, 'middle'))
      out.push(write((P.durX + P.colorX) / 2, cy + 4.5, { s: formatMinutes(row.dur), size: LIST_TEXT, fill: TEXT }, 'middle'))
    }
    if (row?.allDay) out.push(write((P.durX + P.colorX) / 2, cy + 4.5, { s: '종일', size: LIST_TEXT, fill: TEXT }, 'middle'))
    if (p.checks[r]) out.push(`<path d="${checkPath(P.t.x + CHECK_W / 2, cy, CHECK_BOX * 1.3)}" fill="none" stroke="${p.checks[r]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" data-preserve-paint="true"/>`)
  }

  // 종일 칸: 시간 없이 할 일만 쓴 줄이 위에서부터 한 줄씩 올라온다. 못 올라온 줄은 마지막 줄 끝에 +n 으로 알린다.
  const G = grid(L), lane = laneItems(L, p, titles), right = G.t.x + G.t.w
  lane.items.forEach((item, i) => {
    const R = { x: G.laneX + 3, y: G.t.y + i * G.t.laneRh + 2, w: G.laneW - 6, h: G.t.laneRh - 4 }, last = i === lane.items.length - 1 && lane.more > 0
    out.push(barRect(R, item.color, userRect), deviceText(R.x + 7, R.y + R.h / 2 + 4, fitText(item.title, 12, R.w - 14 - (last ? 28 : 0)), 12, { weight: 700 }))
    if (last) out.push(deviceText(right - 10, R.y + R.h / 2 + 4, `+${lane.more}`, 11, { anchor: 'end' }))
  })

  // 일정 막대: 할 일 글과 시작 ~ 끝 시각(들어갈 만큼 크면). 색이 아직 없는 일정(할 일이 비었을 때)은 회색 막대.
  for (const b of blocksOf(L, p)) {
    out.push(barRect(b, b.color, userRect))
    if (b.h < 14) continue
    const title = titles[b.row], range = `${clock(b.start)} ~ ${clock(b.start + b.dur)}`, max = b.w - 10
    if (title) {
      out.push(deviceText(b.x + 5, b.y + 11.5, fitText(title, 11, max), 11, { weight: 700 }))
      if (b.head && b.h >= 30 && textWidth(range, 10) <= max) out.push(write(b.x + 5, b.y + 24.5, { s: range, size: 10, fill: TEXT }))
    } else if (b.head && textWidth(range, 10.5) <= max) out.push(write(b.x + 5, b.y + 11.5, { s: range, size: 10.5, fill: TEXT }))
  }
  return out.join('')
}

/** 바탕 SVG(캐시용). */
export const dayPlannerBaseSvg = orientation => `${svgOpen(dayPlannerLayout(orientation))}${baseBody(orientation)}</svg>`
/** 기록 덮개 SVG. 바탕 위에 겹쳐 그린다. */
export const dayPlannerOverlaySvg = (orientation, value, objects) => `${svgOpen(dayPlannerLayout(orientation))}${overlayBody(orientation, value, objects)}</svg>`
/** 바탕 + 기록을 한 장으로(내보내기 · 썸네일). */
export function dayPlannerSvg(orientation, value, objects) {
  return `${svgOpen(dayPlannerLayout(orientation))}${baseBody(orientation)}${value || objects?.length ? overlayBody(orientation, value, objects) : ''}</svg>`
}
