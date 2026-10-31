// 스터디 플래너 인터랙션 속지 (docs/스터디 플래너 속지).
// 속지 그림은 파일 대신 이 모듈이 SVG로 만든다. 다른 속지(데일리 플래너 등)와 같은 양식 — 네모 테두리 · 회색 선 · MaruBuri 윤곽 글자.
// 그림은 두 장이다. 바탕(plannerBaseSvg)은 기록과 상관없어 캐시해 두고, 칠한 10분 칸 · 체크 · 합계 같은 기록(page.planner)은
// 덮개(plannerOverlaySvg)에만 그려 기록이 바뀔 때 덮개만 다시 만든다. 내보내기는 둘을 합친 studyPlannerSvg 를 쓴다.
// 기록은 획 요소가 아니라 칸 단위 데이터라 레이어 목록에 쌓이지 않고, 색 바꾸기 · 지우기 · 합계가 칸 단위로 된다.
import { LABEL, LINE, LINE_SOFT, TEXT, box, checkPath, hitCircle, label, line, n, onWhite, rect, ruled, sample, span, svgOpen, write } from './plannerDraw.js'

export const STUDY_PLANNER_VERSION = '1.0.0'
export const studyPlannerId = (orientation = 'landscape') => `study-planner-${orientation === 'portrait' ? 'portrait' : 'landscape'}`
export const isStudyPlannerId = id => typeof id === 'string' && /^study-planner-(landscape|portrait)$/.test(id)
export const STUDY_PLANNER_TEMPLATES = ['landscape', 'portrait'].map(orientation => ({
  id: studyPlannerId(orientation), orientation, type: 'study', name: '스터디 플래너', templateVersion: STUDY_PLANNER_VERSION,
}))
export const STUDY_PLANNER_MENU_ITEM = { type: 'study', name: '스터디 플래너', assets: STUDY_PLANNER_TEMPLATES.map(t => ({ orientation: t.orientation, assetId: t.id })) }

export const START_HOURS = [5, 6, 7]
const ROWS = 24, COLS = 6, DAYS = ['월', '화', '수', '목', '금', '토', '일'], HEARTS = [0, 1, 2, 3, 4]
const FILL_OPACITY = 0.78
const TAP_SPAN = 30
const CHECK_W = 34, COLOR_W = 36, TODO_HEAD = 30, SLOTS = 7

// 앱 좌표계 1024 × 768 · 768 × 1024 기준 영역. 머리줄(제목 · 날짜 · 요일 · D-day · 목표)은 데일리 플래너와 같은 자리.
const LAYOUTS = {
  landscape: { w: 1024, h: 768, right: 984,
    date: { x: 512, line: [548, 684] }, week: { x: 714, cy: 63 }, dday: { x: 900, line: [922, 984] },
    heads: [['TO DO LIST', 40], ['TIMELINE', 368], ['RECORD', 684]],
    todo: { x: 40, y: 180, w: 312, h: 366, rows: 12 }, memo: { x: 40, y: 546, w: 312, h: 182 },
    time: { x: 368, y: 180, w: 300, h: 548, hc: 34 },
    total: { x: 684, y: 180, w: 300, h: 80 }, sum: { x: 684, y: 260, w: 300, h: 236 }, review: { x: 684, y: 496, w: 300, h: 168 }, mood: { x: 684, y: 664, w: 300, h: 64 } },
  portrait: { w: 768, h: 1024, right: 728,
    date: { x: 268, line: [304, 428] }, week: { x: 458, cy: 63 }, dday: { x: 644, line: [666, 728] },
    heads: [['TO DO LIST', 40], ['TIMELINE', 496]],
    todo: { x: 40, y: 180, w: 440, h: 366, rows: 12 }, memo: null,
    time: { x: 496, y: 180, w: 232, h: 804, hc: 34 },
    total: { x: 40, y: 546, w: 440, h: 72 }, sum: { x: 40, y: 618, w: 440, h: 216 }, review: { x: 40, y: 834, w: 440, h: 96 }, mood: { x: 40, y: 930, w: 440, h: 54 } },
}
export const plannerLayout = orientation => LAYOUTS[orientation === 'portrait' ? 'portrait' : 'landscape']

const HEX = /^#[0-9a-f]{6}$/i
const color = value => typeof value === 'string' && HEX.test(value) ? value.toUpperCase() : null
export const DEFAULT_PLANNER_OPTIONS = { restColor: null, startHour: 6, snap: true }

export function normalizePlanner(value) {
  const v = value && typeof value === 'object' ? value : {}
  const map = (source, valid) => Object.fromEntries(Object.entries(source && typeof source === 'object' ? source : {}).filter(([k, c]) => valid(k) && color(c)).map(([k, c]) => [k, color(c)]))
  const cells = map(v.cells, k => /^\d{1,2},\d$/.test(k) && +k.split(',')[0] < ROWS && +k.split(',')[1] < COLS)
  const rowKey = k => /^\d{1,2}$/.test(k)
  const mark = m => m && Number.isInteger(m.i) && color(m.color) ? { i: m.i, color: color(m.color), hl: Boolean(m.hl) } : null
  // 만족도: 하트 5개 각각의 { color, hl } 또는 null. 하트마다 다른 색으로 칠할 수 있다. 다 비면 없음.
  // 예전 기록 { i, color, hl, off } 은 0 ~ i 번째(off 제외)를 그 색으로 읽는다.
  const moodMark = m => {
    if (!m || typeof m !== 'object') return null
    const legacy = mark(m), off = Array.isArray(m.off) ? m.off : []
    const list = Array.isArray(m.hearts) ? m.hearts : legacy ? HEARTS.map((_, k) => k <= legacy.i && !off.includes(k) ? legacy : null) : []
    const hearts = HEARTS.map((_, k) => list[k] && color(list[k].color) ? { color: color(list[k].color), hl: Boolean(list[k].hl) } : null)
    return hearts.some(Boolean) ? { hearts } : null
  }
  const o = v.options ?? {}
  const used = new Set(Object.values(cells))
  const order = [...new Set((Array.isArray(v.colorOrder) ? v.colorOrder : []).map(color).filter(Boolean))].filter(c => used.has(c))
  for (const c of Object.values(cells)) if (!order.includes(c)) order.push(c)
  return {
    // caps: 둥근 끝 형광펜으로 칠한 칸(그 밖은 네모 끝). 막대를 그릴 때 끝 모양을 정한다.
    cells, caps: Object.fromEntries(Object.entries(v.caps && typeof v.caps === 'object' ? v.caps : {}).filter(([k, cap]) => k in cells && cap === 'round')),
    checks: map(v.checks, rowKey), bands: map(v.bands, rowKey), day: mark(v.day), mood: moodMark(v.mood), colorOrder: order,
    options: { restColor: color(o.restColor), startHour: START_HOURS.includes(o.startHour) ? o.startHour : 6, snap: o.snap !== false },
  }
}

/** 옵션 바꾸기. 시작 시각을 바꿔도 칠한 칸은 같은 시각에 남도록 줄을 옮긴다(24줄이 하루 전체라 잃는 칸이 없다). */
export function setPlannerOptions(value, patch) {
  const planner = normalizePlanner(value)
  const options = normalizePlanner({ options: { ...planner.options, ...patch } }).options
  const shift = planner.options.startHour - options.startHour
  const move = map => shift ? Object.fromEntries(Object.entries(map).map(([k, c]) => { const [r, col] = k.split(',').map(Number); return [`${(r + shift + ROWS) % ROWS},${col}`, c] })) : map
  return { ...planner, cells: move(planner.cells), caps: move(planner.caps), options }
}

// ---------- 영역 판정 ----------
function grid(L) { const t = L.time; return { t, x0: t.x + t.hc, y0: t.y, cw: (t.w - t.hc) / COLS, rh: t.h / ROWS } }
function cellAt(L, p) {
  const g = grid(L), c = Math.floor((p.x - g.x0) / g.cw), r = Math.floor((p.y - g.y0) / g.rh)
  return c >= 0 && c < COLS && r >= 0 && r < ROWS ? `${r},${c}` : null
}
function todo(L) { const t = L.todo; return { t, head: TODO_HEAD, rh: (t.h - TODO_HEAD) / t.rows, box: 12, cx: t.x + t.w - COLOR_W } }
/** 할 일 줄과 칸. part: 'box'(왼쪽 체크칸) · 'color'(오른쪽 색 칸) · 'text'(할 일 글자) */
function todoAt(L, p) {
  const g = todo(L), r = Math.floor((p.y - g.t.y - g.head) / g.rh)
  if (r < 0 || r >= g.t.rows || p.x < g.t.x || p.x > g.t.x + g.t.w) return null
  return { r, part: p.x < g.t.x + CHECK_W ? 'box' : p.x >= g.cx ? 'color' : 'text' }
}
function days(L) { const w = L.week; return DAYS.map((_, i) => ({ cx: w.x + i * 26, cy: w.cy, r: 11 })) }
function hearts(L) { const m = L.mood, s = 20, gap = 8, x0 = m.x + m.w - 12 - 5 * s - 4 * gap; return HEARTS.map(i => ({ cx: x0 + s / 2 + i * (s + gap), cy: m.y + m.h / 2, r: s / 2 })) }

// 줄 맞춤 글상자: 줄 간격 28 에 맞는 글자 크기. 줄 높이 = 글자 × 줄간격 = 28 이라 여러 줄도 다음 칸 · 다음 줄에 그대로 맞는다.
// 속지에 쓰는 글자는 속지 글꼴(마루부리)이 기본이다. 글자 크기는 칸 이름과 맞춘다: 머리줄 · 메모 · 돌아보기 14(칸 이름과 같다), 할 일 13.
export const PLANNER_TEXT_FONT = 'maruburi'
export const PLANNER_TEXT_SIZE = 14, TODO_TEXT_SIZE = 13
const LINE_PITCH = 28, TODO_LINE = 20
const SIT = 6 // 줄 칸(28) 안에서 글자 상자를 내려 앉히는 만큼: 14 크기 글자가 칸 이름과 같은 높이로 밑줄 위에 앉는다
/**
 * 텍스트 도구로 날짜 · D-day · 오늘의 목표 · 할 일 · 메모 · 오늘 돌아보기를 탭한 자리에 줄 맞춘 글상자 자리. 그 밖이면 null.
 * { x, y, width, font, fontSize, lineSpacing } — 할 일은 탭한 줄 칸 가운데, 메모 · 돌아보기는 탭한 줄 바로 위에 글자가 앉는다.
 */
export function plannerTextSlot(orientation, point) {
  const L = plannerLayout(orientation)
  const style = { font: PLANNER_TEXT_FONT, fontSize: PLANNER_TEXT_SIZE, lineSpacing: LINE_PITCH / PLANNER_TEXT_SIZE }
  const row = todoAt(L, point)
  if (row?.part === 'text') {
    // 한 줄짜리 칸이라 줄 높이를 글자에 가깝게(20) 줄여 줄 가운데에 앉힌다. 28 로 두면 입력 중 테두리와 커서가 칸 아래로 튀어나온다.
    const g = todo(L), x = g.t.x + CHECK_W + 10
    return { x, y: g.t.y + g.head + row.r * g.rh + (g.rh - TODO_LINE) / 2, width: g.cx - 8 - x, font: PLANNER_TEXT_FONT, fontSize: TODO_TEXT_SIZE, lineSpacing: TODO_LINE / TODO_TEXT_SIZE }
  }
  // 머리줄 밑줄 칸(날짜 · D-day · 오늘의 목표): 밑줄 폭만큼 상자를 잡고 글자가 밑줄 위에 앉게 한다. 정렬은 사용자가 고른다.
  const underline = (from, to, lineY) => ({ x: from, y: lineY - LINE_PITCH + SIT, width: to - from, ...style })
  if (point.y >= 40 && point.y <= 88) {
    if (point.x >= L.date.x - 4 && point.x <= L.date.line[1]) return underline(L.date.line[0], L.date.line[1], 71)
    if (point.x >= L.dday.x - 4 && point.x <= L.dday.line[1]) return underline(L.dday.line[0], L.dday.line[1], 71)
  }
  if (point.y > 96 && point.y <= 142 && point.x >= 40 && point.x <= L.right) return underline(124, L.right, 133)
  for (const R of [L.memo, L.review]) {
    if (!R || point.x < R.x || point.x > R.x + R.w || point.y < R.y + 34 || point.y > R.y + R.h) continue
    // 밑줄은 R.y + 58 부터 28 간격. 글자 줄 칸은 그 위 28. 줄 칸 가운데보다 조금 내려 글자가 밑줄에 가깝게 앉게 한다.
    const lines = Math.max(1, Math.floor((R.h - 8 - 30) / LINE_PITCH))
    const k = Math.max(0, Math.min(lines - 1, Math.floor((point.y - (R.y + 30)) / LINE_PITCH)))
    return { x: R.x + 12, y: R.y + 30 + k * LINE_PITCH + SIT, width: R.w - 24, ...style }
  }
  return null
}

const inGoal = (L, p) => p.y > 96 && p.y <= 142 && p.x >= 40 && p.x <= L.right
/** 글 입력 칸의 이름: 'todo-3'(할 일 줄) · 'date' · 'dday' · 'goal'. 입력 칸이 아니면 null. 메모 · 돌아보기는 넓은 빈 곳이라 포함하지 않는다. */
function fieldOf(L, p) {
  const row = todoAt(L, p)
  if (row) return row.part === 'text' ? `todo-${row.r}` : null
  if (p.y >= 40 && p.y <= 88 && p.x >= L.date.x - 4 && p.x <= L.date.line[1]) return 'date'
  if (p.y >= 40 && p.y <= 88 && p.x >= L.dday.x - 4 && p.x <= L.dday.line[1]) return 'dday'
  return inGoal(L, p) ? 'goal' : null
}
/** point 가 가리키는 글 입력 칸(할 일 · 날짜 · D-day · 오늘의 목표)에 이미 있는 글상자(없으면 null). 눌렀을 때 새로 만들지 않고 그 글을 고친다. */
export function plannerTitleAt(orientation, point, objects) {
  const L = plannerLayout(orientation), field = fieldOf(L, point)
  if (!field) return null
  return (objects ?? []).find(o => o?.type === 'text' && !o.hidden && !o.locked && [o.x, o.y, o.w, o.h].every(Number.isFinite)
    && fieldOf(L, { x: o.x + o.w / 2, y: o.y + o.h / 2 }) === field) ?? null
}

/**
 * 선택(화살표) 도구로 칸을 톡 눌렀을 때 그 칸의 입력을 연다. 칸이 아니면 null.
 *   완료: 체크를 켜고 끈다(color 로 친다)   할 일 · 날짜 · D-day · 오늘의 목표: 글 입력   요일: 동그라미를 켜고 끈다   하트: 그 하트를 칠하고 끈다
 * 결과는 applyPlannerStroke 와 달리 { planner } | { text: 점 } 로 돌려준다(속지 모음의 editTap 과 같은 모양).
 */
export function plannerEditTap(orientation, point, value, markColor) {
  const planner = normalizePlanner(value), L = plannerLayout(orientation), c = color(markColor) ?? color(TEXT)
  const row = todoAt(L, point)
  if (row?.part === 'box') {
    const checks = { ...planner.checks }
    if (checks[row.r]) delete checks[row.r]; else checks[row.r] = c
    return { planner: normalizePlanner({ ...planner, checks }) }
  }
  if (fieldOf(L, point)) return { text: point }
  if (row) return null
  const day = hitCircle(days(L), point)
  if (day >= 0) return { planner: normalizePlanner({ ...planner, day: planner.day?.i === day ? null : { i: day, color: c, hl: false } }) }
  const heart = hitCircle(hearts(L), point)
  if (heart >= 0) {
    const kept = planner.mood?.hearts ?? HEARTS.map(() => null)
    return { planner: normalizePlanner({ ...planner, mood: { hearts: HEARTS.map(k => k === heart ? (kept[k] ? null : { color: c, hl: false }) : kept[k]) } }) }
  }
  return null
}

/** 지나간 칸(형광펜이 시간표 안에서 시작했을 때). 화면 미리보기에도 쓴다. */
export function plannerStrokeCells(orientation, points) {
  const L = plannerLayout(orientation)
  if (!points?.length || !cellAt(L, points[0])) return []
  return [...new Set(sample(points).map(p => cellAt(L, p)).filter(Boolean))]
}

/**
 * 펜 · 형광펜 획을 속지 기록으로 바꾼다. 속지 영역에서 시작한 획이 아니면 null(보통 획으로 남긴다).
 * settings: { kind, color } — kind 가 'highlighter' 면 형광펜, 그 밖은 펜.
 */
export function applyPlannerStroke(value, orientation, points, settings) {
  const planner = normalizePlanner(value)
  if (!planner.options.snap || !points?.length) return null
  const L = plannerLayout(orientation), first = points[0], hl = settings?.kind === 'highlighter', c = color(settings?.color)
  if (!c) return null
  const tap = span(points) < TAP_SPAN
  if (hl && cellAt(L, first)) {
    const cells = { ...planner.cells }, caps = { ...planner.caps }, round = settings.lineCap === 'round'
    for (const k of plannerStrokeCells(orientation, points)) { cells[k] = c; if (round) caps[k] = 'round'; else delete caps[k] }
    return normalizePlanner({ ...planner, cells, caps, colorOrder: [...planner.colorOrder, c] })
  }
  const row = todoAt(L, first)
  if (row?.part === 'box') return { ...planner, checks: { ...planner.checks, [row.r]: c } }
  // 할 일 줄을 형광펜으로 쓸면 그 줄 오른쪽 색 칸이 그 색으로 찬다(시간표에 칠한 색과 할 일을 짝짓는다).
  if (hl && row) {
    const bands = { ...planner.bands }
    for (const p of sample(points)) { const at = todoAt(L, p); if (at && at.part !== 'box') bands[at.r] = c }
    return { ...planner, bands }
  }
  const day = hitCircle(days(L), first)
  if (day >= 0 && tap) return { ...planner, day: { i: day, color: c, hl } }
  const heartHits = hearts(L), heart = hitCircle(heartHits, first)
  // 하트에서 시작해 펜 · 형광펜으로 여러 개를 그으면 지나간 하트가 한 번에 찬다. 이미 찬 하트에 누적한다.
  // 이웃한 하트 둘은 톡 판정 거리보다 가까워서, 지나간 하트 수로 긋기를 가른다.
  const passed = heart >= 0 ? new Set(sample(points).map(p => hitCircle(heartHits, p)).filter(i => i >= 0)) : null
  const paint = { color: c, hl }
  // 톡: 누른 하트만 새 색으로 칠하고 나머지 하트는 그대로 둔다(누적).
  const kept = planner.mood?.hearts ?? HEARTS.map(() => null)
  if (heart >= 0 && tap && !(passed?.size > 1)) return { ...planner, mood: { hearts: HEARTS.map(k => k === heart ? paint : kept[k]) } }
  // 그은 하트만 새 색으로 칠하고, 나머지 하트는 원래 색 그대로 둔다(누적).
  if (passed) return { ...planner, mood: { hearts: HEARTS.map(k => passed.has(k) ? paint : kept[k]) } }
  return null
}

/**
 * 지우개 경로가 지나간 기록을 지운다. 바뀐 것이 없으면 null.
 * mode 'stroke'(획 지우기): 닿은 칸이 속한 막대(같은 줄에 이어진 같은 색 칸) 전체를 지운다.
 * mode 'area'(영역 지우기): 지우개 중심이 지나간 칸 하나하나만 지운다.
 * 만족도 하트는 두 모드 모두 닿은 하트 하나씩만 비운다.
 * 짧은 구간씩 여러 번 불러도(지우는 중 미리보기) 한 번에 부른 것과 결과가 같다.
 */
export function erasePlanner(value, orientation, points, mode = 'stroke') {
  if (!points?.length) return null
  const planner = normalizePlanner(value)
  const L = plannerLayout(orientation)
  const cells = { ...planner.cells }, caps = { ...planner.caps }, checks = { ...planner.checks }, bands = { ...planner.bands }
  let { day, mood } = planner, changed = false
  const dropCell = key => {
    const fill = cells[key], cap = caps[key]
    if (!fill) return
    changed = true
    const remove = k => { delete cells[k]; delete caps[k] }
    remove(key)
    if (mode === 'area') return
    // 막대 = 같은 줄에 이어진 같은 색 · 같은 끝 모양 칸 (그릴 때와 같은 기준)
    const [r, c] = key.split(',').map(Number), same = k => cells[k] === fill && caps[k] === cap
    for (let e = c - 1; same(`${r},${e}`); e--) remove(`${r},${e}`)
    for (let e = c + 1; same(`${r},${e}`); e++) remove(`${r},${e}`)
  }
  const drop = (map, key) => { if (key in map) { delete map[key]; changed = true } }
  const dayHits = days(L), heartHits = hearts(L)
  for (const p of sample(points)) {
    const k = cellAt(L, p)
    if (k) { dropCell(k); continue }
    const row = todoAt(L, p)
    if (row?.part === 'box') drop(checks, String(row.r))
    else if (row?.part === 'color') drop(bands, String(row.r))
    if (row) continue
    const d = hitCircle(dayHits, p)
    if (d >= 0 && day?.i === d) { day = null; changed = true }
    const h = hitCircle(heartHits, p)
    if (h >= 0 && mood?.hearts[h]) { mood = { hearts: mood.hearts.map((x, k) => k === h ? null : x) }; changed = true }
  }
  return changed ? normalizePlanner({ ...planner, cells, caps, checks, bands, day, mood }) : null
}

// ---------- 합계 ----------
/** 정수 퍼센트. 합이 정확히 100이 되도록 버린 소수점이 큰 순서로 1씩 더한다(최대 잉여 방식). */
export function wholePercents(values) {
  const total = values.reduce((sum, v) => sum + v, 0)
  if (!total) return values.map(() => 0)
  const exact = values.map(v => v * 100 / total), out = exact.map(Math.floor)
  let left = 100 - out.reduce((sum, v) => sum + v, 0)
  const order = exact.map((v, i) => [v - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left-- }
  return out
}

export function plannerTotals(value) {
  const planner = normalizePlanner(value), rest = planner.options.restColor
  const count = {}
  for (const c of Object.values(planner.cells)) count[c] = (count[c] ?? 0) + 1
  const colors = planner.colorOrder.map(c => ({ color: c, minutes: count[c] * 10, rest: c === rest }))
  // 쉬는 시간 색은 합계 · 퍼센트에서 빼고 색별 기록 맨 아래에 둔다.
  colors.sort((a, b) => Number(a.rest) - Number(b.rest))
  const studyColors = colors.filter(c => !c.rest), percents = wholePercents(studyColors.map(c => c.minutes))
  studyColors.forEach((c, i) => { c.percent = percents[i] })
  for (const c of colors) if (c.rest) c.percent = null
  const study = studyColors.reduce((sum, c) => sum + c.minutes, 0)
  const restMinutes = colors.filter(c => c.rest).reduce((sum, c) => sum + c.minutes, 0)
  const keys = Object.keys(planner.cells).map(k => k.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const at = (r, c) => { const t = (planner.options.startHour + r) * 60 + c * 10; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
  const range = keys.length ? `${at(keys[0][0], keys[0][1])} ~ ${at(keys[keys.length - 1][0], keys[keys.length - 1][1] + 1)}` : null
  return { study, rest: restMinutes, colors, range }
}
/** 1시간 40분 · 2시간 · 30분 */
export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60
  return h ? (m ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`
}

// ---------- SVG ----------
const heartPath = ({ cx, cy, r }) => `M${n(cx)} ${n(cy + r * .75)} C${n(cx - r * 1.3)} ${n(cy - r * .1)} ${n(cx - r * .55)} ${n(cy - r * 1.05)} ${n(cx)} ${n(cy - r * .35)} C${n(cx + r * .55)} ${n(cy - r * 1.05)} ${n(cx + r * 1.3)} ${n(cy - r * .1)} ${n(cx)} ${n(cy + r * .75)}Z`

function colorRow(S, i) {
  const srh = (S.h - 46) / SLOTS, cy = S.y + 38 + i * srh + srh / 2
  const bar = { x: S.x + 32, w: S.w - 32 - 12 - 34 - 6 - 72 }
  return { cy, bar, time: S.x + S.w - 52, pct: S.x + S.w - 12 }
}

/** 기록과 상관없는 바탕. 시간표 시작 시각만 숫자에 반영한다. */
function baseBody(orientation, startHour = 6) {
  const L = plannerLayout(orientation), out = [rect(0, 0, L.w, L.h, 'fill="#FFFFFF"')]
  // 머리줄 — 데일리 플래너와 같은 제목 · 칸 이름 · 밑줄
  out.push(write(40, 70, { s: '스터디 플래너', size: 30, weight: 'B', fill: TEXT }))
  out.push(label(L.date.x, 68, '날짜'), line(L.date.line[0], 71, L.date.line[1], 71, LINE))
  days(L).forEach((c, i) => out.push(write(c.cx, c.cy + 5, { s: DAYS[i], size: 14 }, 'middle')))
  out.push(label(L.dday.x, 68, 'D-'), line(L.dday.line[0], 71, L.dday.line[1], 71, LINE))
  out.push(line(40, 92, L.right, 92, LINE))
  out.push(label(40, 130, '오늘의 목표'), line(124, 133, L.right, 133, LINE))
  for (const [name, x] of L.heads) out.push(write(x, 166, { s: name, size: 16, weight: 'B', fill: TEXT }))

  // 할 일: 왼쪽 체크칸 · 할 일 · 오른쪽 색 칸
  const T = todo(L), t = T.t
  out.push(box(t), line(t.x, t.y + T.head, t.x + t.w, t.y + T.head, LINE), line(t.x + CHECK_W, t.y, t.x + CHECK_W, t.y + t.h, LINE), line(T.cx, t.y, T.cx, t.y + t.h, LINE))
  out.push(write(t.x + CHECK_W / 2, t.y + 20, { s: '완료', size: 11.5 }, 'middle'), label(t.x + CHECK_W + 12, t.y + 20, '할 일', 12.5), write(T.cx + COLOR_W / 2, t.y + 20, { s: '색', size: 11.5 }, 'middle'))
  for (let r = 0; r < t.rows; r++) {
    const y = t.y + T.head + r * T.rh
    if (r > 0) out.push(line(t.x, y, t.x + t.w, y))
    out.push(rect(t.x + (CHECK_W - T.box) / 2, y + (T.rh - T.box) / 2, T.box, T.box, `fill="none" stroke="${LABEL}" stroke-width="1"`))
  }
  if (L.memo) out.push(ruled(L.memo, '메모'))

  // 10분 시간표 — 데일리 플래너 TIMELINE 과 같은 실선 칸
  const G = grid(L), tm = G.t
  out.push(box(tm), line(G.x0, tm.y, G.x0, tm.y + tm.h, LINE))
  for (let c = 1; c < COLS; c++) out.push(line(G.x0 + c * G.cw, tm.y, G.x0 + c * G.cw, tm.y + tm.h))
  for (let r = 0; r < ROWS; r++) {
    if (r > 0) out.push(line(tm.x, G.y0 + r * G.rh, tm.x + tm.w, G.y0 + r * G.rh))
    out.push(write(tm.x + tm.hc / 2, G.y0 + r * G.rh + G.rh / 2 + 4, { s: String((startHour + r) % 24).padStart(2, '0'), size: 11.5 }, 'middle'))
  }

  // 기록 칸
  out.push(box(L.total), label(L.total.x + 12, L.total.y + 26, '총 공부 시간'))
  const S = L.sum
  out.push(box(S), label(S.x + 12, S.y + 26, '색깔별 공부 시간'))
  for (let i = 0; i < SLOTS; i++) {
    const row = colorRow(S, i)
    out.push(rect(S.x + 12, row.cy - 6, 12, 12, `fill="none" stroke="${LINE}" stroke-width="1"`), rect(row.bar.x, row.cy - 3, row.bar.w, 6, `rx="3" fill="${LINE_SOFT}"`))
  }
  out.push(ruled(L.review, '오늘 돌아보기'))
  const M = L.mood
  out.push(box(M), label(M.x + 12, M.y + M.h / 2 + 5, '오늘 만족도'))
  for (const c of hearts(L)) out.push(`<path d="${heartPath(c)}" fill="none" stroke="${LINE}" stroke-width="1.2"/>`)
  return out.join('')
}

/** 기록만 그린 덮개(투명 바탕). */
function overlayBody(orientation, value) {
  const L = plannerLayout(orientation), p = normalizePlanner(value), totals = plannerTotals(p), out = []

  // 사용자 색 도형만 속지 배색에서 제외한다(집계 글자는 배색을 따른다).
  const userRect = (...args) => rect(...args).replace('/>', ' data-preserve-paint="true"/>')

  // 요일 표시 — 형광펜은 동그란 칠 위에 글자를 다시 쓰고, 펜은 글자 가운데에 맞춘 정원 동그라미
  days(L).forEach((c, i) => {
    if (p.day?.i !== i) return
    if (p.day.hl) out.push(`<circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="${c.r}" fill="${p.day.color}" fill-opacity="0.6" data-preserve-paint="true"/>`, write(c.cx, c.cy + 5, { s: DAYS[i], size: 14 }, 'middle'))
    else out.push(`<circle cx="${n(c.cx)}" cy="${n(c.cy)}" r="${c.r}" fill="none" stroke="${p.day.color}" stroke-width="1.6" data-preserve-paint="true"/>`)
  })

  // 할 일 체크 · 색 칸
  const T = todo(L), t = T.t
  for (let r = 0; r < t.rows; r++) {
    const y = t.y + T.head + r * T.rh
    if (p.bands[r]) out.push(userRect(T.cx + 5, y + 5, COLOR_W - 10, T.rh - 10, `rx="2" fill="${p.bands[r]}" fill-opacity="${FILL_OPACITY}"`))
    if (p.checks[r]) out.push(`<path d="${checkPath(t.x + CHECK_W / 2, y + T.rh / 2, T.box * 1.3)}" fill="none" stroke="${p.checks[r]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" data-preserve-paint="true"/>`)
  }

  // 칠한 10분 칸 — 같은 줄 · 같은 색 · 같은 끝 모양으로 이어진 칸은 하나의 막대로 그린다.
  // 둥근 끝 형광펜이면 막대 양 끝이 반원이고, 가운데를 지워 나뉜 조각도 각자 반원 끝을 가진다.
  const G = grid(L), bh = G.rh - 5
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS;) {
      const fill = p.cells[`${r},${c}`], cap = p.caps[`${r},${c}`]
      if (!fill) { c++; continue }
      let e = c
      while (e + 1 < COLS && p.cells[`${r},${e + 1}`] === fill && p.caps[`${r},${e + 1}`] === cap) e++
      const rest = fill === p.options.restColor
      out.push(userRect(G.x0 + c * G.cw + 1.5, G.y0 + r * G.rh + 2.5, (e - c + 1) * G.cw - 3, bh, `rx="${cap === 'round' ? n(bh / 2) : 2}" fill="${fill}" fill-opacity="${rest ? 0.45 : FILL_OPACITY}"`))
      c = e + 1
    }
  }

  // 총 공부 시간
  const R = L.total
  if (totals.study || totals.rest) {
    const h = Math.floor(totals.study / 60), m = totals.study % 60, big = { size: 24, weight: 'B', fill: TEXT }, unit = { size: 13, weight: 'B', fill: LABEL }
    out.push(write(R.x + 12, R.y + R.h - 16, [{ ...big, s: String(h) }, { ...unit, s: '시간 ' }, { ...big, s: String(m).padStart(2, '0') }, { ...unit, s: '분' }]))
    if (totals.range) out.push(write(R.x + R.w - 12, R.y + 26, { s: totals.range, size: 11.5 }, 'end'))
    if (totals.rest) out.push(write(R.x + R.w - 12, R.y + R.h - 16, { s: `쉬는 시간 ${formatMinutes(totals.rest)}`, size: 11.5 }, 'end'))
  }

  // 색깔별 공부 시간 — 줄은 처음 칠한 순서로 고정한다. 시간 옆에 공부 시간 중 비율(정수, 합 100)
  const S = L.sum, max = Math.max(1, ...totals.colors.map(c => c.minutes))
  totals.colors.slice(0, SLOTS).forEach((item, i) => {
    const row = colorRow(S, i), ink = item.rest ? LABEL : TEXT
    out.push(userRect(S.x + 12, row.cy - 6, 12, 12, `fill="${item.color}"`))
    out.push(userRect(row.bar.x, row.cy - 3, Math.max(6, row.bar.w * item.minutes / max), 6, `rx="3" fill="${item.color}"${item.rest ? ' fill-opacity="0.5"' : ''}`))
    out.push(write(row.time, row.cy + 4, { s: formatMinutes(item.minutes), size: 11.5, fill: ink }, 'end'))
    out.push(write(row.pct, row.cy + 4, { s: item.rest ? '쉼' : `${item.percent}%`, size: 11.5, fill: item.rest ? LABEL : TEXT }, 'end'))
  })

  // 만족도
  if (p.mood) hearts(L).forEach((c, i) => {
    const h = p.mood.hearts[i]
    // 펜 · 형광펜 모두 윤곽선이 보이지 않게 한 가지 불투명 색으로 칠한다(형광펜은 흰 바탕에 섞은 색).
    // 가장자리도 같은 색으로 덮어 빈 하트의 회색 윤곽(굵기 1.2)이 비치지 않게 한다.
    if (h) { const fill = h.hl ? onWhite(h.color, 0.75) : h.color; out.push(`<path d="${heartPath(c)}" fill="${fill}" stroke="${fill}" stroke-width="1.6" stroke-linejoin="round" data-preserve-paint="true"/>`) }
  })
  return out.join('')
}

/** 바탕 SVG(캐시용). */
export const plannerBaseSvg = (orientation, startHour = 6) => `${svgOpen(plannerLayout(orientation))}${baseBody(orientation, startHour)}</svg>`
/** 기록 덮개 SVG. 바탕 위에 겹쳐 그린다. */
export const plannerOverlaySvg = (orientation, value) => `${svgOpen(plannerLayout(orientation))}${overlayBody(orientation, value)}</svg>`
/** 바탕 + 기록을 한 장으로(내보내기 · 썸네일). */
export function studyPlannerSvg(orientation, value) {
  const startHour = normalizePlanner(value).options.startHour
  return `${svgOpen(plannerLayout(orientation))}${baseBody(orientation, startHour)}${value ? overlayBody(orientation, value) : ''}</svg>`
}
