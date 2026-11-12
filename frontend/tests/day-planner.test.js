import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DAY_PALETTE, DAY_PLANNER_TEMPLATES, DURATION_HOURS, DURATION_RANGE, applyDayStroke, assignDayColors, clock, dayCellTap, dayEditTap, dayNowLine, dayPlannerBaseSvg, dayPlannerBlocks, dayPlannerId, dayPlannerLayout,
  dayAllDayItems, dayPlannerOverlaySvg, dayPlannerSvg, dayTextSlot, dayTitleAt, dayTitleRows, dayTitles, effectiveDay, eraseDayPlanner, isScheduled, normalizeDayPlanner, setDayDate, setDayPlannerOptions,
  NOW_LINE_COLOR, setDayRow, setDayRowColor, suggestStart, weekdayOf,
} from '../src/editor/templates/dayPlanner.js'
import { plannerFor } from '../src/editor/templates/planners.js'
import { getTemplate, reusableTemplates } from '../src/editor/templates/catalog.js'
import { PAPERS, countAssetId, papersIn, paperById } from '../src/diary/utils/paperChoice.js'
import { editorReducer, createInitialState } from '../src/editor/state/editorReducer.js'
import { createText } from '../src/editor/utils/text.js'

const HL = { kind: 'highlighter', color: '#F7DF8A' }
const PEN = { kind: 'fountain', color: '#EF476F' }
const [YELLOW, PINK, GREEN, BLUE] = DAY_PALETTE
const at = (h, m = 0) => h * 60 + m

// 일정 목록 칸 가운데 (완료 34 · 할 일 · 시작 56 · 진행 80 · 색 34, 머리줄 30)
function listPoint(r, part, o = 'landscape') {
  const t = dayPlannerLayout(o).list, rh = (t.h - 30) / 12, y = t.y + 30 + (r + 0.5) * rh
  const colorX = t.x + t.w - 34, durX = colorX - 80, startX = durX - 56
  const x = { box: t.x + 17, text: (t.x + 34 + startX) / 2, start: (startX + durX) / 2, dur: (durX + colorX) / 2, color: colorX + 17 }[part]
  return { x, y }
}
// 시간표의 시각(0~1439분)에 해당하는 높이와 그 열(오전 · 오후) 가운데 x
function gridPoint(minutes, o = 'landscape') {
  const t = dayPlannerLayout(o).time, laneH = t.laneRows * t.laneRh, hw = t.w / 2, hh = (t.h - laneH - t.headH) / 12
  const half = minutes >= 720 ? 1 : 0
  return { x: t.x + half * hw + t.axis + (hw - t.axis) / 2, y: t.y + laneH + t.headH + (minutes - half * 720) / 60 * hh }
}
const weekPoint = (i, o = 'landscape') => { const w = dayPlannerLayout(o).week; return { x: w.x + i * 26, y: w.cy } }
const datePoint = (o = 'landscape') => ({ x: dayPlannerLayout(o).date.line[0] + 20, y: 62 })
// 할 일 칸에 글자가 있는 글상자
const title = (r, text = '공부', o = 'landscape') => { const { x, y } = listPoint(r, 'text', o); return { id: `t${r}`, type: 'text', text, x: x - 50, y: y - 14, w: 100, h: 28 } }

test('데일리 플래너 속지가 메뉴와 카탈로그에 가로 · 세로로 있고 하루 계획 자리를 대신한다', () => {
  for (const o of ['landscape', 'portrait']) {
    const menu = reusableTemplates(o)
    const item = menu.find(t => t.type === 'day')
    assert.equal(item.assetId, dayPlannerId(o))
    assert.equal(item.name, '데일리 플래너')
    assert.equal(getTemplate(item.assetId).orientation, o)
    assert.deepEqual(menu.slice(0, 2).map(t => t.type), ['study', 'day'])
    assert.equal(menu.some(t => t.type === 'daily'), false)
  }
  assert.deepEqual(DAY_PLANNER_TEMPLATES.map(t => t.id), ['day-planner-landscape', 'day-planner-portrait'])
})

test('하루 계획은 메뉴에서 빠지고 이미 만든 다이어리의 옛 속지 파일만 남는다', () => {
  assert.equal(getTemplate('2026-reusable-daily-landscape').type, 'daily')
  assert.equal(getTemplate('2026-reusable-daily-portrait').type, 'daily')
  assert.equal(paperById('daily').id, 'day')
})

test('데일리 플래너가 새 다이어리 속지 고르기의 하루 계획 자리에 나온다', () => {
  const day = PAPERS.find(p => p.id === 'day')
  assert.equal(day.name, '데일리 플래너')
  assert.equal(PAPERS.some(p => p.id === 'daily'), false)
  assert.deepEqual(papersIn('planner').filter(p => p.kind === 'count').map(p => p.id), ['day', 'study', 'route'])
  for (const o of ['landscape', 'portrait']) assert.equal(countAssetId('day', o), dayPlannerId(o))
})

test('하루 24시간이 오전 · 오후 두 열로 모두 그려지고 시작 시각 옵션은 없다', () => {
  const base = dayPlannerBaseSvg('landscape')
  for (const label of ['오전', '오후', '종일', '00', '11', '12', '23']) assert.match(base, new RegExp(`aria-label="${label}"`))
  assert.deepEqual(normalizeDayPlanner({ options: { startHour: 0, snap: false } }).options, { snap: false })
  assert.deepEqual(setDayPlannerOptions(null, { snap: false }).options, { snap: false })
  // 목록 열 순서: 완료 · 할 일 · 시작 · 진행 · 색
  const names = [...base.matchAll(/aria-label="(완료|할 일|시작|진행|색)"/g)].map(m => m[1])
  assert.deepEqual(names, ['완료', '할 일', '시작', '진행', '색'])
})

test('일정은 시작 · 진행이 모두 있어야 시간표에 놓이고 시각대로 열과 위치가 정해진다', () => {
  let p = setDayRow(null, 0, { color: YELLOW, start: at(9), dur: 90 })
  p = setDayRow(p, 1, { color: PINK, start: null, dur: null })
  assert.equal(isScheduled(p.rows[0]), true)
  assert.equal(isScheduled(p.rows[1]), false)
  const [b, ...rest] = dayPlannerBlocks('landscape', p)
  assert.equal(rest.length, 0)
  // 가로: 종일 칸 48 + 이름줄 20 아래 오전 열, 한 시간 40px → 9시는 9칸 아래
  assert.equal(b.half, 0)
  assert.equal(b.y, 248 + 9 * 40 + 1)
  assert.equal(b.h, 1.5 * 40 - 2)
  assert.equal(b.x, 544 + 3)
  const pm = dayPlannerBlocks('landscape', setDayRow(null, 0, { color: YELLOW, start: at(14), dur: 60 }))[0]
  assert.equal(pm.half, 1)
  assert.equal(pm.y, 248 + 2 * 40 + 1)
  assert.equal(pm.x, 779 + 3)
})

test('정오를 걸친 일정은 두 열로 나뉘고, 자정을 넘는 일정은 오전 열 맨 위에서 이어진다', () => {
  const noon = dayPlannerBlocks('landscape', setDayRow(null, 0, { color: YELLOW, start: at(11, 30), dur: 60 }))
  assert.deepEqual(noon.map(b => [b.half, b.from, b.to, b.head]), [[0, 690, 720, true], [1, 0, 30, false]])
  const night = dayPlannerBlocks('landscape', setDayRow(null, 0, { color: YELLOW, start: at(23), dur: 120 }))
  assert.deepEqual(night.map(b => [b.half, b.from, b.to, b.head]), [[0, 0, 60, false], [1, 660, 720, true]])
})

test('겹치는 일정은 같은 열 안에서 폭을 나눠 나란히 놓고, 이어지지 않는 일정은 전체 폭을 쓴다', () => {
  let p = setDayRow(null, 0, { color: YELLOW, start: at(9), dur: 120 })
  p = setDayRow(p, 1, { color: PINK, start: at(9, 30), dur: 60 })
  p = setDayRow(p, 2, { color: BLUE, start: at(14), dur: 60 })
  const [a, b, c] = dayPlannerBlocks('landscape', p)
  assert.equal(a.cols, 2); assert.equal(b.cols, 2)
  assert.equal(a.col, 0); assert.equal(b.col, 1)
  assert.equal(a.w, b.w)
  assert.ok(b.x > a.x + a.w - 1)
  assert.equal(c.cols, 1)
  assert.ok(c.w > a.w * 1.9)
  // 9:00–10:00 · 9:30–10:30 · 10:15–11:00: 셋은 한 묶음이고 첫째와 셋째는 같은 줄에 이어 놓인다
  let q = setDayRow(null, 0, { color: YELLOW, start: at(9), dur: 60 })
  q = setDayRow(q, 1, { color: PINK, start: at(9, 30), dur: 60 })
  q = setDayRow(q, 2, { color: BLUE, start: at(10, 15), dur: 45 })
  assert.deepEqual(dayPlannerBlocks('landscape', q).map(x => [x.row, x.col, x.cols]), [[0, 0, 2], [1, 1, 2], [2, 0, 2]])
  // 오전 일정과 오후 일정은 시각이 겹쳐 보이지 않으므로 서로 폭을 나누지 않는다
  const split = setDayRow(setDayRow(null, 0, { color: YELLOW, start: at(9), dur: 60 }), 1, { color: PINK, start: at(21), dur: 60 })
  assert.deepEqual(dayPlannerBlocks('landscape', split).map(x => x.cols), [1, 1])
})

test('기록을 읽을 때 잘못된 값은 버리고, 색이 없는 일정은 그대로 둔다', () => {
  const p = normalizeDayPlanner({
    rows: { 0: { color: '#f7df8a', start: 540, dur: 60 }, 1: { color: 'red', start: 10, dur: 10 }, 2: { start: 600 }, 3: { color: PINK, start: 2000, dur: 60 }, 99: { color: YELLOW }, x: { color: YELLOW }, 4: { color: BLUE, start: 60, dur: 0 } },
    checks: { 0: '#EF476F', 12: '#EF476F' }, lane: { 0: YELLOW }, day: { i: 9, color: PINK }, date: { y: 2026, m: 2, d: 30 },
  })
  assert.deepEqual(p.rows[0], { color: '#F7DF8A', start: 540, dur: 60 })
  assert.deepEqual(p.rows[1], { color: null, start: 10, dur: 10 })
  assert.equal(p.rows[2], undefined)
  assert.deepEqual(p.rows[3], { color: PINK, start: null, dur: null })
  assert.deepEqual(p.rows[4], { color: BLUE, start: null, dur: null })
  assert.deepEqual(Object.keys(p.rows).sort(), ['0', '1', '3', '4'])
  assert.deepEqual(p.checks, { 0: '#EF476F' })
  assert.equal(p.lane, undefined) // 종일 칸은 기록이 아니라 할 일에서 만든다
  assert.equal(p.day, null)
  assert.equal(p.date, null)
  assert.deepEqual(normalizeDayPlanner(null).options, { snap: true })
})

test('새 일정은 가장 늦게 끝나는 일정 뒤에서 시작하자고 제안한다', () => {
  assert.equal(suggestStart(null), at(9))
  let p = setDayRow(null, 0, { color: YELLOW, start: at(9), dur: 90 })
  p = setDayRow(p, 1, { color: PINK, start: at(13), dur: 60 })
  assert.equal(suggestStart(p), at(14))
  assert.equal(suggestStart(setDayRow(p, 2, { color: BLUE, start: at(7), dur: 30 })), at(14))
})

test('완료 칸은 펜 · 형광펜 색의 체크로 받는다', () => {
  assert.equal(applyDayStroke(null, 'landscape', [listPoint(3, 'box')], PEN).planner.checks['3'], '#EF476F')
  assert.equal(applyDayStroke(null, 'landscape', [listPoint(3, 'box')], HL).planner.checks['3'], YELLOW)
  assert.equal(applyDayStroke(null, 'landscape', [{ x: 10, y: 10 }, { x: 60, y: 60 }], PEN), null)
})

test('할 일 칸은 글자만 받는다: 눌러도 그어도 글 입력이 열리고 잉크는 남지 않는다', () => {
  const p = listPoint(2, 'text')
  assert.deepEqual(applyDayStroke(null, 'landscape', [p], PEN), { text: p })
  assert.deepEqual(applyDayStroke(null, 'landscape', [p], HL), { text: p })
  assert.deepEqual(applyDayStroke(null, 'landscape', [p, { x: p.x + 100, y: p.y }], PEN), { text: p })
})

test('시작 · 진행 칸을 누르면(어떤 획이든) 시간 고르는 창을 연다', () => {
  for (const part of ['start', 'dur']) {
    assert.deepEqual(applyDayStroke(null, 'landscape', [listPoint(2, part)], PEN), { picker: { kind: 'time', row: 2 } })
    assert.deepEqual(applyDayStroke(null, 'landscape', [listPoint(5, part)], HL), { picker: { kind: 'time', row: 5 } })
    const a = listPoint(1, part)
    assert.deepEqual(applyDayStroke(null, 'landscape', [a, { x: a.x + 20, y: a.y + 40 }], PEN), { picker: { kind: 'time', row: 1 } })
  }
})

test('색 칸을 형광펜으로 쓸어 덮어쓰면 지나간 줄의 색이 바뀌고 막대 색도 따라간다', () => {
  const p = setDayRow(null, 1, { color: YELLOW, start: at(9), dur: 60 })
  const { planner } = applyDayStroke(p, 'landscape', [listPoint(0, 'color'), listPoint(2, 'color')], { kind: 'highlighter', color: PINK })
  assert.deepEqual(planner.rows[0], { color: PINK, start: null, dur: null })
  assert.deepEqual(planner.rows[1], { color: PINK, start: at(9), dur: 60 })
  assert.equal(planner.rows[2].color, PINK)
  assert.equal(dayPlannerBlocks('landscape', planner)[0].color, PINK)
  // 펜으로 톡 누르면 색 고르기 창, 펜으로 긋는 것은 받기만 한다(잉크 없음)
  assert.deepEqual(applyDayStroke(p, 'landscape', [listPoint(1, 'color')], PEN), { picker: { kind: 'color', row: 1 } })
  assert.deepEqual(applyDayStroke(p, 'landscape', [listPoint(1, 'color'), listPoint(3, 'color')], PEN), {})
  // 할 일 줄을 형광펜으로 가로질러 쓸면 그 줄 색이 바뀐다(톡은 글 입력)
  const sweep = applyDayStroke(p, 'landscape', [listPoint(2, 'text'), { x: listPoint(2, 'text').x + 80, y: listPoint(2, 'text').y }], { kind: 'highlighter', color: GREEN }).planner
  assert.equal(sweep.rows[2].color, GREEN)
  assert.deepEqual(applyDayStroke(p, 'landscape', [listPoint(2, 'text')], HL), { text: listPoint(2, 'text') })
})

test('날짜 칸을 누르면 날짜 고르는 창을 열고, 텍스트 도구로 눌러도 시작 · 진행 · 날짜는 고르는 창이 열린다', () => {
  assert.deepEqual(applyDayStroke(null, 'landscape', [datePoint()], PEN), { picker: { kind: 'date' } })
  assert.deepEqual(applyDayStroke(null, 'portrait', [datePoint('portrait')], HL), { picker: { kind: 'date' } })
  assert.deepEqual(dayCellTap('landscape', datePoint()), { picker: { kind: 'date' } })
  assert.deepEqual(dayCellTap('landscape', listPoint(4, 'start')), { picker: { kind: 'time', row: 4 } })
  assert.deepEqual(dayCellTap('landscape', listPoint(4, 'dur')), { picker: { kind: 'time', row: 4 } })
  assert.equal(dayCellTap('landscape', listPoint(4, 'text')), null)
})

test('날짜를 고르면 요일에 동그라미가 자동으로 생기고, 펜 · 형광펜으로 다시 그으면 색이 바뀐다', () => {
  assert.equal(weekdayOf({ y: 2026, m: 10, d: 31 }), 5) // 토요일
  assert.equal(weekdayOf({ y: 2026, m: 11, d: 2 }), 0) // 월요일
  let p = setDayDate(null, { y: 2026, m: 10, d: 31 })
  assert.deepEqual(effectiveDay(p), { i: 5, color: '#EF476F', hl: false })
  const svg = dayPlannerOverlaySvg('landscape', p)
  assert.match(svg, /aria-label="2026\. 10\. 31"/)
  assert.match(svg, /<circle cx="930" cy="63" r="11" fill="none" stroke="#EF476F"/)
  // 같은 요일을 펜으로 다시 그으면 그 색, 형광펜이면 칠한 동그라미
  const recolored = applyDayStroke(p, 'landscape', [weekPoint(5)], { kind: 'fountain', color: '#118AB2' }).planner
  assert.deepEqual(effectiveDay(recolored), { i: 5, color: '#118AB2', hl: false })
  assert.equal(effectiveDay(applyDayStroke(p, 'landscape', [weekPoint(5)], HL).planner).hl, true)
  // 동그라미를 그리듯 바깥에서 시작해 한 바퀴 돌려도 가운데가 그 요일이면 같은 요일
  const c = weekPoint(5), ring = Array.from({ length: 12 }, (_, k) => ({ x: c.x + 16 * Math.cos(k / 12 * 2 * Math.PI), y: c.y + 16 * Math.sin(k / 12 * 2 * Math.PI) }))
  assert.equal(effectiveDay(applyDayStroke(p, 'landscape', ring, PEN).planner).color, '#EF476F')
  // 날짜가 정한 요일이 아닌 곳은 받기만 하고 바꾸지 않는다
  assert.deepEqual(applyDayStroke(p, 'landscape', [weekPoint(1)], PEN), {})
  // 날짜가 없으면 눌러서 표시한다
  assert.deepEqual(applyDayStroke(null, 'landscape', [weekPoint(3)], PEN).planner.day, { i: 3, color: '#EF476F', hl: false })
  // 날짜를 지우면 요일 표시도 지워진다
  assert.equal(effectiveDay(setDayDate(recolored, null)), null)
  assert.equal(normalizeDayPlanner({ date: { y: 2026, m: 2, d: 31 } }).date, null)
})

test('시간 없이 할 일만 쓴 줄은 종일 칸에 위에서부터 올라오고, 시간이 생기면 시간표로 옮겨 간다', () => {
  const objects = [title(0, '병원 예약'), title(1, '장보기'), title(2, '청소'), title(5, '회의')]
  const planner = setDayRow(null, 5, { color: BLUE, start: at(14), dur: 60 })
  const svg = dayPlannerOverlaySvg('landscape', planner, objects)
  // 가로는 종일 칸이 2줄: 시간 없는 첫 두 줄만 올라오고 나머지는 +n
  assert.match(svg, />병원 예약<\/text>/)
  assert.match(svg, />장보기<\/text>/)
  assert.doesNotMatch(svg, />청소<\/text>/)
  assert.match(svg, />\+1<\/text>/)
  // 시간이 있는 줄은 시간표 막대에 있고 종일 칸에는 없다
  assert.equal((svg.match(/>회의<\/text>/g) ?? []).length, 1)
  // 세로는 종일 칸이 3줄이라 모두 올라온다
  const tall = dayPlannerOverlaySvg('portrait', planner, objects.map((o, i) => title([0, 1, 2, 5][i], o.text, 'portrait')))
  assert.match(tall, />청소<\/text>/)
  assert.doesNotMatch(tall, />\+\d<\/text>/)
  // 아직 색이 없으면 회색, 색이 붙으면 그 색
  assert.match(svg, /fill="#e8e9eb" stroke="#d7d9dc"/)
  assert.match(dayPlannerOverlaySvg('landscape', assignDayColors(planner, 'landscape', objects), objects), /fill="#F7DF8A" fill-opacity="0.78" data-preserve-paint="true"/)
  // 할 일 글이 없으면 아무것도 올라오지 않는다
  assert.doesNotMatch(dayPlannerOverlaySvg('landscape', null, []), /<text/)
})

test('할 일 글이 막대에 비치고, 긴 글은 …으로 줄며, 막대가 낮으면 글만 나온다', () => {
  const planner = setDayRow(setDayRow(null, 0, { color: GREEN, start: at(9), dur: 60 }), 1, { color: PINK, start: at(14), dur: 30 })
  const svg = dayPlannerOverlaySvg('landscape', planner, [title(0, '독서'), title(1, '아주아주아주아주아주아주아주아주아주아주 아주아주아주아주아주 긴 할 일 이름')])
  assert.match(svg, />독서<\/text>/)
  // 한 시간(40px) 막대는 글 아래에 시각, 30분(20px) 막대는 글만
  assert.match(svg, /aria-label="09:00 ~ 10:00"/)
  assert.doesNotMatch(svg, /aria-label="14:00 ~ 14:30"/)
  assert.match(svg, /아주아주[^<]*…<\/text>/)
  assert.deepEqual(dayTitles('landscape', [title(0, '독서'), { ...title(0, '둘째'), x: 200 }, title(3, '  ')]), { 0: '독서 둘째' })
  // XML 특수문자는 안전하게
  assert.match(dayPlannerOverlaySvg('landscape', planner, [title(0, 'A & B <c>')]), />A &amp; B &lt;c&gt;<\/text>/)
})

test('시간표를 형광펜으로 위아래로 그으면 15분 단위 일정이 비어 있는 첫 줄에 생기고, 오전에서 오후로 이어 그을 수 있다', () => {
  // 9:07 → 10:20: 9:00 부터 1시간 30분
  const down = applyDayStroke(null, 'landscape', [gridPoint(at(9, 7)), gridPoint(at(10, 20))], HL).planner
  assert.deepEqual(down.rows[0], { color: YELLOW, start: at(9), dur: 90 }) // 일정 색은 그은 형광펜 색(지라 829)
  assert.deepEqual(applyDayStroke(null, 'landscape', [gridPoint(at(10, 20)), gridPoint(at(9, 7))], HL).planner.rows[0], down.rows[0])
  // 이미 찬 줄은 건너뛰고 다음 빈 줄, 오후 열
  const second = applyDayStroke(down, 'landscape', [gridPoint(at(14)), gridPoint(at(15))], { kind: 'highlighter', color: PINK }).planner
  assert.deepEqual(second.rows[1], { color: PINK, start: at(14), dur: 60 })
  // 오전 열 11시에서 오후 열 13시까지
  assert.deepEqual(applyDayStroke(null, 'landscape', [gridPoint(at(11)), gridPoint(at(13))], HL).planner.rows[0], { color: YELLOW, start: at(11), dur: 120 })
  // 가로로 그은 획처럼 높이가 거의 같으면 15분, 손끝이 거의 안 움직인 톡은 한 시간
  const flat = gridPoint(at(9, 10))
  assert.equal(applyDayStroke(null, 'landscape', [flat, { ...flat, x: flat.x + 80 }], HL).planner.rows[0].dur, 15)
  assert.deepEqual(applyDayStroke(null, 'landscape', [gridPoint(at(9, 10))], HL).planner.rows[0], { color: YELLOW, start: at(9), dur: 60 })
  // 할 일만 써 둔 줄이 있으면 그 줄은 건너뛰고 빈 줄에 만든다
  assert.equal(applyDayStroke(null, 'landscape', [gridPoint(at(9, 7)), gridPoint(at(10, 20))], HL, [title(0)]).planner.rows[1].start, at(9))
})

test('시간표에 펜으로 쓰는 것은 자유 필기이고, 목록이 가득 차거나 칸 맞춤을 끄면 보통 획이다', () => {
  assert.equal(applyDayStroke(null, 'landscape', [gridPoint(at(9, 7)), gridPoint(at(10, 20))], PEN), null)
  for (const part of ['box', 'text', 'start', 'dur', 'color']) assert.equal(applyDayStroke({ options: { snap: false } }, 'landscape', [listPoint(0, part)], PEN), null)
  assert.equal(applyDayStroke({ options: { snap: false } }, 'landscape', [datePoint()], PEN), null)
  let full = null
  for (let i = 0; i < 12; i++) full = setDayRow(full, i, { color: PINK, start: at(8) + i * 30, dur: 30 })
  assert.equal(applyDayStroke(full, 'landscape', [gridPoint(at(9, 7)), gridPoint(at(10, 20))], HL), null)
})

test('829: 같은 색 형광펜으로 일정에 겹치거나 맞닿게 그으면 새 일정 대신 그 일정이 늘어난다(목록이 가득 차도)', () => {
  const base = setDayRow(null, 3, { color: YELLOW, start: at(9), dur: 60 })
  // 맞닿게(10:00 ~ 11:00) → 9:00 ~ 11:00 한 일정
  const touch = applyDayStroke(base, 'landscape', [gridPoint(at(10)), gridPoint(at(11))], HL).planner
  assert.deepEqual(touch.rows[3], { color: YELLOW, start: at(9), dur: 120 })
  assert.equal(Object.values(touch.rows).filter(isScheduled).length, 1)
  // 겹치게 앞쪽으로(8:00 ~ 9:30) → 8:00 ~ 10:00
  assert.deepEqual(applyDayStroke(base, 'landscape', [gridPoint(at(8)), gridPoint(at(9, 30))], HL).planner.rows[3], { color: YELLOW, start: at(8), dur: 120 })
  // 이미 그 일정 안을 다시 칠하면 바뀌는 것이 없다(잉크도 남기지 않는다)
  assert.deepEqual(applyDayStroke(base, 'landscape', [gridPoint(at(9, 10)), gridPoint(at(9, 40))], HL), {})
  // 다른 색은 새 일정(나란히 놓인다), 떨어진 같은 색도 새 일정
  const other = applyDayStroke(base, 'landscape', [gridPoint(at(9)), gridPoint(at(10))], { kind: 'highlighter', color: PINK }).planner
  assert.equal(Object.values(other.rows).filter(isScheduled).length, 2)
  const apart = applyDayStroke(base, 'landscape', [gridPoint(at(11)), gridPoint(at(12))], HL).planner
  assert.equal(Object.values(apart.rows).filter(isScheduled).length, 2)
  // 두 같은 색 일정에 걸치면 목록 위쪽 줄 하나만 늘리고 다른 할 일의 시간은 그대로 둔다
  const two = setDayRow(base, 1, { color: YELLOW, start: at(11), dur: 60 })
  const both = applyDayStroke(two, 'landscape', [gridPoint(at(10)), gridPoint(at(11))], HL).planner
  assert.deepEqual(both.rows[1], { color: YELLOW, start: at(10), dur: 120 })
  assert.deepEqual(both.rows[3], { color: YELLOW, start: at(9), dur: 60 })
  // 할 일을 먼저 써서 색이 정해진 줄에 새 일정이 들어가면 그 줄 색을 지킨다
  // 자정을 넘는 일정(22:00부터 4시간)에 앞쪽으로 이어 칠해도 끝은 줄지 않는다
  const late = setDayRow(null, 2, { color: YELLOW, start: at(22), dur: 240 })
  assert.deepEqual(applyDayStroke(late, 'landscape', [gridPoint(at(21)), gridPoint(at(22))], HL).planner.rows[2], { color: YELLOW, start: at(21), dur: 300 })
  const colored = setDayRow(null, 0, { color: GREEN, start: null, dur: null })
  assert.equal(applyDayStroke(colored, 'landscape', [gridPoint(at(15)), gridPoint(at(16))], HL).planner.rows[0].color, GREEN)
})

test('827: 종일 칸에 못 올라온 일정은 마지막 줄 끝 +n 알약 — 누르면(선택 도구 · 펜 톡) 종일 전체 목록, 줄은 그 줄의 시간 창', () => {
  for (const o of ['landscape', 'portrait']) {
    const L = dayPlannerLayout(o), t = L.time, n = t.laneRows + 2
    const objects = Array.from({ length: n }, (_, i) => title(i, `할 일 ${i + 1}`, o))
    const items = dayAllDayItems(o, null, objects)
    assert.equal(items.length, n)
    assert.deepEqual(items.map(i => i.row), Array.from({ length: n }, (_, i) => i))
    const right = t.x + t.w, lastY = t.y + (t.laneRows - 0.5) * t.laneRh
    const chip = { x: right - 3 - 15, y: lastY }
    assert.deepEqual(dayEditTap(o, chip, null, objects), { picker: { kind: 'allday' } })
    assert.deepEqual(applyDayStroke(null, o, [chip], PEN, objects), { picker: { kind: 'allday' } })
    // 올라온 줄은 그 줄의 시간 창(펜 톡도 같다), 긋는 획은 잉크 없이 받기만 한다
    const firstLane = { x: t.x + t.axis + 40, y: t.y + t.laneRh / 2 }
    assert.deepEqual(dayEditTap(o, firstLane, null, objects), { picker: { kind: 'time', row: 0 } })
    assert.deepEqual(applyDayStroke(null, o, [firstLane], HL, objects), { picker: { kind: 'time', row: 0 } })
    assert.deepEqual(applyDayStroke(null, o, [firstLane, { x: firstLane.x + 120, y: firstLane.y }], PEN, objects), {})
    const svg = dayPlannerOverlaySvg(o, null, objects)
    assert.match(svg, new RegExp(`>\\+${n - t.laneRows}</text>`))
  }
  // 넘치지 않으면 알약이 없다
  assert.doesNotMatch(dayPlannerOverlaySvg('landscape', null, [title(0)]), />\+\d+<\/text>/)
})

test('826: 종일 칸 · 일정 막대의 작은 글자는 보통 굵기 마루부리(굵은 글꼴은 작게 그리면 ㅇ 속이 메워진다)', () => {
  const objects = [title(0, '영어 공부'), title(1, '운동')]
  const p = setDayRow(setDayRow(null, 1, { color: PINK, start: at(9), dur: 90 }), 0, { color: YELLOW, start: null, dur: null })
  const svg = dayPlannerOverlaySvg('landscape', p, objects)
  assert.match(svg, /font-family="MaruBuri, serif"[^>]*>영어 공부</)
  assert.match(svg, /font-family="MaruBuri, serif"[^>]*>운동</)
  assert.doesNotMatch(svg, /MaruBuriBold/)
})

test('할 일 · 시간 · 종일이 채워지면 형광펜 프리셋 색이 겹치지 않게 돌아가며 자동으로 붙는다', () => {
  let p = null
  for (let i = 0; i < 9; i++) p = setDayRow(p, i, { color: null, start: at(6) + i * 60, dur: 30 })
  const objects = Array.from({ length: 9 }, (_, i) => title(i))
  // 글자가 없어도 시간이 있으면 색이 붙는다(할 일보다 시간을 먼저 적은 경우)
  const timeFirst = assignDayColors(p, 'landscape', [])
  assert.deepEqual(Object.keys(timeFirst.rows).map(k => timeFirst.rows[k].color), Array.from({ length: 9 }, (_, i) => DAY_PALETTE[i % DAY_PALETTE.length]))
  assert.equal(assignDayColors(timeFirst, 'landscape', []), null)
  // 시간도 글자도 없이 색만 비어 있는 줄은 받지 않는다
  assert.equal(assignDayColors(null, 'landscape', []), null)
  const colored = assignDayColors(p, 'landscape', objects)
  assert.deepEqual(Object.keys(colored.rows).map(k => colored.rows[k].color), Array.from({ length: 9 }, (_, i) => DAY_PALETTE[i % DAY_PALETTE.length]))
  // 한 번 붙은 색은 그대로, 다시 불러도 바뀌지 않는다
  assert.equal(assignDayColors(colored, 'landscape', objects), null)
  // 시간 없이 할 일만 있는 줄(기록이 아직 없는 줄)도 색이 붙어 종일 칸에 올라간다
  const only = assignDayColors(null, 'landscape', [title(4, '장보기'), title(6, '청소')])
  assert.deepEqual(only.rows, { 4: { color: YELLOW, start: null, dur: null }, 6: { color: PINK, start: null, dur: null } })
  // 형광펜으로 고른 색은 지키고, 그 색은 이미 쓰인 것으로 세어 다음 줄이 피한다
  const mine = setDayRow(setDayRow(null, 0, { color: YELLOW, start: at(9), dur: 60 }), 1, { color: null, start: at(10), dur: 60 })
  assert.equal(assignDayColors(mine, 'landscape', [title(0), title(1)]).rows[1].color, PINK)
  // 비어 있는 글상자 · 숨긴 글상자는 할 일이 아니다(시간이 없는 줄이면 색도 붙지 않는다)
  assert.equal(assignDayColors(null, 'landscape', [{ ...title(0), text: '  ' }, { ...title(1), hidden: true }]), null)
  assert.deepEqual([...dayTitleRows('landscape', [title(3), { ...title(4), x: 700 }])], [3])
})

test('눌렀을 때 그 칸에 이미 쓴 글이 있으면 그 글상자를 돌려준다', () => {
  const objects = [title(2, '독서'), { ...title(5, '운동'), locked: true }]
  assert.equal(dayTitleAt('landscape', listPoint(2, 'text'), objects).text, '독서')
  assert.equal(dayTitleAt('landscape', listPoint(3, 'text'), objects), null)
  assert.equal(dayTitleAt('landscape', listPoint(5, 'text'), objects), null)
  assert.equal(dayTitleAt('landscape', listPoint(2, 'start'), objects), null)
})

test('색이 아직 없는 일정은 회색 막대, 색이 정해지면 그 색 막대로 그려진다', () => {
  const pending = dayPlannerOverlaySvg('landscape', setDayRow(null, 0, { color: null, start: at(9), dur: 60 }))
  assert.match(pending, /fill="#e8e9eb" stroke="#d7d9dc"/)
  assert.doesNotMatch(pending, /data-preserve-paint/)
  const colored = dayPlannerOverlaySvg('landscape', setDayRow(null, 0, { color: GREEN, start: at(9), dur: 60 }))
  assert.match(colored, /fill="#F2B4AE" fill-opacity="0.78" data-preserve-paint="true"/)
})

test('지우개: 막대 · 시작 · 진행 칸은 시간을 비우고 색 칸은 줄을, 체크 · 날짜는 하나씩 지운다', () => {
  let p = setDayRow(null, 0, { color: YELLOW, start: at(9), dur: 60 })
  p = setDayRow(p, 1, { color: PINK, start: at(14), dur: 60 })
  p = { ...p, checks: { 0: '#EF476F' }, date: { y: 2026, m: 10, d: 31 }, day: { i: 5, color: '#118AB2', hl: false } }
  const [first] = dayPlannerBlocks('landscape', p)
  const block = { x: first.x + 20, y: first.y + 5 }
  assert.deepEqual(eraseDayPlanner(p, 'landscape', [block]).rows[0], { color: YELLOW, start: null, dur: null })
  assert.equal(isScheduled(eraseDayPlanner(p, 'landscape', [block]).rows[1]), true)
  assert.deepEqual(eraseDayPlanner(p, 'landscape', [listPoint(1, 'start')]).rows[1], { color: PINK, start: null, dur: null })
  assert.deepEqual(eraseDayPlanner(p, 'landscape', [listPoint(1, 'dur')]).rows[1], { color: PINK, start: null, dur: null })
  assert.equal(eraseDayPlanner(p, 'landscape', [listPoint(1, 'color')]).rows[1], undefined)
  assert.equal(eraseDayPlanner(p, 'landscape', [listPoint(0, 'box')]).checks[0], undefined)
  // 날짜 칸을 지우면 날짜와 요일 표시가 함께 지워지고, 요일 동그라미만 지우면 날짜가 정한 기본 모양으로 돌아간다
  const noDate = eraseDayPlanner(p, 'landscape', [datePoint()])
  assert.equal(noDate.date, null); assert.equal(effectiveDay(noDate), null)
  const reset = eraseDayPlanner(p, 'landscape', [weekPoint(5)])
  assert.equal(reset.date.d, 31); assert.equal(effectiveDay(reset).color, '#EF476F')
  // 할 일 글자 칸 · 빈 곳은 건드리지 않는다(글자는 보통 글상자)
  assert.equal(eraseDayPlanner(p, 'landscape', [listPoint(0, 'text'), { x: 5, y: 5 }]), null)
  assert.equal(eraseDayPlanner(null, 'landscape', [block]), null)
})

test('텍스트 도구로 할 일 줄 · 오늘의 목표 · 메모를 탭하면 줄 맞춘 글상자가 생기고, 할 일 상자는 줄 가운데에 앉는다', () => {
  const todo = dayTextSlot('landscape', listPoint(1, 'text'))
  assert.equal(todo.fontSize * todo.lineSpacing, 20)
  assert.equal(todo.x, 40 + 34 + 10)
  // 줄(28) 가운데에 20 짜리 상자: 입력 테두리(상자 바깥 6)가 줄 밖으로 거의 안 나온다
  assert.equal(todo.y, 180 + 30 + 28 + 4)
  assert.ok(todo.x + todo.width <= 40 + 450 - 34 - 80 - 56)
  const tall = dayTextSlot('portrait', listPoint(0, 'text', 'portrait'))
  assert.equal(tall.y, 180 + 30 + (38 - 20) / 2)
  assert.ok(dayTextSlot('landscape', { x: 300, y: 125 }))
  assert.ok(dayTextSlot('landscape', { x: 100, y: 600 }))
  assert.equal(dayTextSlot('landscape', gridPoint(at(9))), null)
  assert.equal(dayTextSlot('landscape', datePoint()), null)
})

test('바탕에는 기록이 없고 덮개에는 기록만 있다', () => {
  const p = setDayRow(null, 0, { color: YELLOW, start: at(9), dur: 90 })
  assert.doesNotMatch(dayPlannerBaseSvg('landscape'), /#F7DF8A/)
  assert.match(dayPlannerBaseSvg('landscape'), /aria-label="데일리 플래너"/)
  const overlay = dayPlannerOverlaySvg('landscape', p)
  assert.match(overlay, /fill="#F7DF8A"/)
  assert.match(overlay, /aria-label="09:00"/)
  assert.match(overlay, /aria-label="1시간 30분"/)
  assert.match(overlay, /aria-label="09:00 ~ 10:30"/)
  assert.doesNotMatch(overlay, /데일리 플래너|fill="#FFFFFF"/)
})

test('SVG는 앱 좌표계 viewBox 와 종이 사각형을 가진다', () => {
  assert.match(dayPlannerSvg('landscape'), /viewBox="0 0 1024 768"/)
  assert.match(dayPlannerSvg('portrait'), /<rect x="0" y="0" width="768" height="1024" fill="#FFFFFF"\/>/)
})

test('고를 수 있는 모든 시각 · 진행 시간 · 날짜의 글자 윤곽이 있다', () => {
  for (let start = 0; start < 24 * 60; start += 5) dayPlannerOverlaySvg('landscape', setDayRow(null, 0, { color: YELLOW, start, dur: 60 }))
  for (const h of DURATION_HOURS) for (let m = 0; m < 60; m += 5) dayPlannerOverlaySvg('portrait', setDayRow(null, 0, { color: YELLOW, start: at(9), dur: Math.min(1440, Math.max(5, h * 60 + m)) }))
  for (let m = 1; m <= 12; m++) for (const d of [1, 9, 10, 28]) dayPlannerOverlaySvg('landscape', setDayDate(null, { y: 2026, m, d }))
  assert.deepEqual([DURATION_HOURS[0], DURATION_HOURS.at(-1)], [0, 24])
  assert.equal(clock(at(23, 55)), '23:55')
})

test('속지 모음은 속지 ID 로 스터디 · 데일리 플래너를 같은 모양으로 돌려준다', () => {
  const day = plannerFor('day-planner-portrait'), study = plannerFor('study-planner-landscape')
  assert.equal(day.kind, 'day'); assert.equal(day.orientation, 'portrait')
  assert.equal(study.kind, 'study'); assert.equal(study.orientation, 'landscape')
  assert.equal(plannerFor('2026-reusable-daily-landscape'), null)
  assert.equal(plannerFor(undefined), null)
  assert.equal(day.startHour(), 6)
  assert.deepEqual(day.stroke(null, [listPoint(0, 'start', 'portrait')], PEN), { picker: { kind: 'time', row: 0 } })
  assert.match(day.svg(setDayRow(null, 0, { color: YELLOW, start: at(9), dur: 60 }), [title(0, '독서', 'portrait')]), />독서<\/text>/)
  assert.deepEqual(day.titles([title(2, '운동', 'portrait')]), { 2: '운동' })
  assert.equal(study.titles([title(2)]), null)
  assert.deepEqual(day.stroke(null, [gridPoint(at(9, 7), 'portrait'), gridPoint(at(10, 20), 'portrait')], HL, [title(0, '독서', 'portrait')]).planner.rows[1].start, at(9))
  assert.equal(day.cellTap({ x: 1, y: 1 }), null)
  assert.equal(study.cellTap({ x: 1, y: 1 }), null)
  assert.equal(study.autoColor(null, []), null)
})

test('일정은 되돌리기 한 번으로 돌아가고, 색이 저절로 채워지는 것은 되돌리기 단위를 만들지 않으며, 페이지 복제는 기록을 따로 복사한다', () => {
  const page = { id: 'p1', backgroundAssetId: dayPlannerId('landscape'), templateVersion: '1.0.0', canvasWidth: 1024, canvasHeight: 768, objects: [] }
  let state = createInitialState({ pages: [page] })
  const planner = setDayRow(null, 0, { color: null, start: at(9), dur: 60 })
  state = editorReducer(state, { type: 'setPlanner', planner })
  assert.deepEqual(state.doc.pages[0].planner.rows[0], planner.rows[0])
  const pastBefore = state.past.length
  state = editorReducer(state, { type: 'setPlanner', planner: setDayRow(planner, 0, { color: YELLOW, start: at(9), dur: 60 }), silent: true })
  assert.equal(state.past.length, pastBefore)
  assert.equal(state.doc.pages[0].planner.rows[0].color, YELLOW)
  const copy = editorReducer(state, { type: 'duplicatePage' }).doc.pages[1]
  assert.deepEqual(copy.planner, state.doc.pages[0].planner)
  assert.notEqual(copy.planner.rows, state.doc.pages[0].planner.rows)
  state = editorReducer(state, { type: 'undo' })
  assert.equal(state.doc.pages[0].planner, undefined)
})

test('PNG · PDF 내보내기 속지에도 일정과 날짜가 들어간다', async () => {
  const { createExportSnapshot, prepareExportSnapshot } = await import('../src/editor/utils/pageExport.js')
  const planner = setDayDate(setDayRow(null, 2, { color: BLUE, start: at(14), dur: 45 }), { y: 2026, m: 10, d: 31 })
  const page = { id: 'p1', backgroundAssetId: dayPlannerId('portrait'), templateVersion: '1.0.0', canvasWidth: 768, canvasHeight: 1024, objects: [createText({ id: 'exported-title', x: listPoint(2, 'text', 'portrait').x - 50, y: listPoint(2, 'text', 'portrait').y - 19, width: 100, text: '운동' })], planner }
  const prepared = await prepareExportSnapshot(createExportSnapshot(page), null, () => { throw new Error('파일 속지를 읽으면 안 된다') })
  assert.ok(prepared.backgroundXml.includes(`fill="${BLUE}"`)) // 형광펜 프리셋 넷째 색
  assert.match(prepared.backgroundXml, /aria-label="14:00"/)
  assert.match(prepared.backgroundXml, /aria-label="45분"/)
  assert.match(prepared.backgroundXml, /aria-label="2026\. 10\. 31"/)
  assert.match(prepared.backgroundXml, />운동<\/text>/)
  prepared.dispose()
})

test('진행을 종일로 정한 줄은 시간표 대신 종일 칸에 올라가고, 목록 진행 칸에 「종일」이 쓰이며, 색이 저절로 붙는다', () => {
  let v = setDayRow(null, 2, { color: null, start: null, dur: null, allDay: true })
  assert.deepEqual(normalizeDayPlanner(v).rows[2], { color: null, start: null, dur: null, allDay: true })
  assert.equal(isScheduled(normalizeDayPlanner(v).rows[2]), false)
  assert.equal(dayPlannerBlocks('landscape', v).length, 0)
  // 시간이 정해지면 종일은 풀린다
  assert.deepEqual(normalizeDayPlanner(setDayRow(v, 2, { color: null, start: at(9), dur: 60, allDay: true })).rows[2], { color: null, start: at(9), dur: 60 })
  // 글이 없어도 종일 칸에 막대가 생기고(+ 목록에 종일 글자), 색은 첫 프리셋
  const colored = assignDayColors(v, 'landscape', [])
  assert.equal(normalizeDayPlanner(colored).rows[2].color, YELLOW)
  assert.match(dayPlannerOverlaySvg('landscape', colored, []), new RegExp(`fill="${YELLOW}"`))
  assert.ok(dayPlannerOverlaySvg('landscape', colored, []).length > dayPlannerOverlaySvg('landscape', null, []).length)
  // 시간표에 끌어 만든 일정은 종일 줄을 피해 빈 줄에 들어간다
  const dragged = applyDayStroke(v, 'landscape', [gridPoint(at(10)), gridPoint(at(11))], HL, [])
  assert.equal(normalizeDayPlanner(dragged.planner).rows[0].start, at(10))
  assert.equal(normalizeDayPlanner(dragged.planner).rows[2].allDay, true)
  // 지우개로 진행 칸을 지우면 종일이 풀린다
  const cell = listPoint(2, 'dur')
  assert.equal(normalizeDayPlanner(eraseDayPlanner(colored, 'landscape', [cell])).rows[2].allDay, undefined)
})

test('선택 도구로 칸을 누르면 그 칸의 입력이 열린다', () => {
  const objects = [title(0)]
  assert.deepEqual(dayEditTap('landscape', listPoint(3, 'start'), null, objects), { picker: { kind: 'time', row: 3 } })
  assert.deepEqual(dayEditTap('landscape', listPoint(3, 'dur'), null, objects), { picker: { kind: 'time', row: 3 } })
  assert.deepEqual(dayEditTap('landscape', datePoint(), null, objects), { picker: { kind: 'date' } })
  assert.deepEqual(dayEditTap('landscape', listPoint(4, 'text'), null, objects), { text: listPoint(4, 'text') })
  assert.deepEqual(dayEditTap('landscape', listPoint(4, 'color'), null, objects), { picker: { kind: 'color', row: 4 } })
  assert.equal(setDayRowColor(null, 4, GREEN).rows[4].color, GREEN)
  // 요일: 날짜가 없으면 동그라미를 켜고 끄고, 날짜가 있으면 날짜 창
  const mark = dayEditTap('landscape', weekPoint(2), null, objects, '#3366FF').planner
  assert.deepEqual(normalizeDayPlanner(mark).day, { i: 2, color: '#3366FF', hl: false })
  assert.equal(normalizeDayPlanner(dayEditTap('landscape', weekPoint(2), mark, objects).planner).day, null)
  assert.deepEqual(dayEditTap('landscape', weekPoint(2), setDayDate(null, { y: 2026, m: 11, d: 10 }), objects), { picker: { kind: 'date' } })
  assert.equal(dayEditTap('landscape', { x: 300, y: 700 }, null, objects), null) // 메모는 칸이 아니다
  // 완료: 켜고 끈다
  const on = dayEditTap('landscape', listPoint(1, 'box'), null, objects, '#3366FF')
  assert.equal(normalizeDayPlanner(on.planner).checks[1], '#3366FF')
  assert.equal(normalizeDayPlanner(dayEditTap('landscape', listPoint(1, 'box'), on.planner, objects, '#3366FF').planner).checks[1], undefined)
  // 시간표 막대와 종일 칸 막대
  const v = setDayRow(setDayRow(null, 5, { color: null, start: at(14), dur: 60 }), 6, { color: null, start: null, dur: null, allDay: true })
  assert.deepEqual(dayEditTap('landscape', gridPoint(at(14, 30)), v, []), { picker: { kind: 'time', row: 5 } })
  const t = dayPlannerLayout('landscape').time
  assert.deepEqual(dayEditTap('landscape', { x: t.x + 100, y: t.y + 10 }, v, []), { picker: { kind: 'time', row: 6 } })
  assert.equal(dayEditTap('landscape', gridPoint(at(3)), v, []), null) // 빈 시간표
  // 스터디 플래너는 이 입력이 없다
  assert.equal(plannerFor('study-planner-landscape').editTap(null, { x: 700, y: 400 }), null)
  assert.ok(plannerFor('day-planner-landscape').editTap(null, listPoint(1, 'start'), []))
})

test('속지에서 만드는 글상자는 마루부리가 기본 글꼴이고, 덮개의 글도 마루부리로 그린다', () => {
  for (const o of ['landscape', 'portrait']) {
    for (const point of [listPoint(1, 'text', o), { x: 300, y: 125 }, { x: 100, y: o === 'landscape' ? 600 : 800 }]) assert.equal(dayTextSlot(o, point)?.font, 'maruburi', JSON.stringify(point))
  }
  // 할 일 글자 크기는 목록의 시작 · 진행 칸 글자와 같은 크기다(오늘의 목표 · 메모는 칸 이름과 같은 14)
  assert.equal(dayTextSlot('landscape', listPoint(1, 'text')).fontSize, 13)
  assert.equal(dayTextSlot('landscape', { x: 300, y: 125 }).fontSize, 14) // 오늘의 목표 · 메모는 칸 이름(14)과 같다
  assert.equal(dayTextSlot('landscape', { x: 100, y: 600 }).fontSize, 14)
  assert.match(dayPlannerOverlaySvg('landscape', setDayRow(null, 0, { color: null, start: at(9), dur: 90 }), []), /scale\(0\.013 -0\.013\)/)
  const svg = dayPlannerOverlaySvg('landscape', setDayRow(null, 0, { color: YELLOW, start: at(9), dur: 60 }), [title(0, '공부')])
  assert.match(svg, /font-family="MaruBuri(Bold)?, serif"/)
  assert.doesNotMatch(svg, /sans-serif/)
})

test('시간표 현재 시각 줄은 지금이 든 열의 그 시각 높이에 놓이고, 다른 날짜면 없다', () => {
  const t = dayPlannerLayout('landscape').time
  const noon = new Date(2026, 9, 31, 15, 30, 0)
  const line = dayNowLine('landscape', null, noon) // 날짜를 안 골랐으면 오늘로 본다
  const want = gridPoint(at(15, 30))
  assert.equal(line.half, 1)
  assert.ok(Math.abs(line.y - want.y) < 0.01)
  assert.ok(line.x > t.x + t.w / 2 && line.x + line.w <= t.x + t.w)
  assert.equal(dayNowLine('landscape', null, new Date(2026, 9, 31, 8, 0)).half, 0)
  assert.ok(dayNowLine('portrait', null, noon))
  assert.ok(dayNowLine('landscape', setDayDate(null, { y: 2026, m: 10, d: 31 }), noon))
  assert.equal(dayNowLine('landscape', setDayDate(null, { y: 2026, m: 10, d: 30 }), noon), null)
  assert.equal(plannerFor('study-planner-landscape').nowLine(null, noon), null)
  // 화면 표시 전용: 속지 SVG(내보내기 포함)에는 들어가지 않는다
  assert.doesNotMatch(dayPlannerSvg('landscape', null, []), /EF476F/i)
})

test('진행 시간 휠은 일정 최대 길이(24시간)까지 있어 긴 일정도 휠에 맞는 값이 있다', () => {
  assert.equal(DURATION_HOURS[DURATION_HOURS.length - 1], DURATION_RANGE.max / 60)
  // 시간표를 길게 그은 일정(자정 넘김 포함)의 시간이 휠 값으로 표현된다
  const long = applyDayStroke(null, 'landscape', [gridPoint(at(1)), gridPoint(at(23, 50))], HL)
  const row = normalizeDayPlanner(long.planner).rows[0]
  assert.ok(DURATION_HOURS.includes(Math.floor(row.dur / 60)))
  // 24시간은 그대로 기록되고, 분이 더해져 넘치는 값은 기록에서 버려지므로 창이 24시간으로 자른다(DayTimePicker.pickDuration)
  assert.deepEqual(normalizeDayPlanner(setDayRow(null, 0, { color: null, start: 0, dur: DURATION_RANGE.max })).rows[0], { color: null, start: 0, dur: DURATION_RANGE.max })
  assert.equal(normalizeDayPlanner(setDayRow(null, 0, { color: null, start: 0, dur: DURATION_RANGE.max + 5 })).rows[0], undefined)
})

test('현재 시각 줄: 펜 · 형광펜으로 톡 누르거나 줄을 따라 칠하면 그 색, 줄을 따라 지우면 기본 빨강', () => {
  for (const o of ['landscape', 'portrait']) {
    const now = new Date(2026, 10, 10, 10, 0), line = dayNowLine(o, null, now)
    assert.equal(line.color, NOW_LINE_COLOR)
    const mid = { x: line.x + line.w / 2, y: line.y }
    // 펜 톡 → 펜 색, 잉크 · 일정 없음
    const pen = applyDayStroke(null, o, [mid], PEN, [], now).planner
    assert.equal(pen.nowColor, PEN.color)
    assert.equal(Object.keys(pen.rows).length, 0)
    assert.equal(dayNowLine(o, pen, now).color, PEN.color)
    // 형광펜으로 줄을 따라 칠함 → 형광펜 색(일정을 만들지 않는다)
    const along = [{ x: line.x + 10, y: line.y + 2 }, { x: line.x + 60, y: line.y - 3 }, { x: line.x + 110, y: line.y + 1 }]
    const hl = applyDayStroke(pen, o, along, HL, [], now).planner
    assert.equal(hl.nowColor, HL.color)
    assert.equal(Object.values(hl.rows).filter(isScheduled).length, 0)
    // 같은 색을 다시 → 받기만
    assert.deepEqual(applyDayStroke(hl, o, [mid], HL, [], now), {})
    // 줄에서 떨어진 톡 · 줄을 세로로 가로지르는 칠은 예전처럼 일정
    assert.equal(applyDayStroke(null, o, [{ x: mid.x, y: line.y + 20 }], HL, [], now).planner.nowColor, undefined)
    const cross = applyDayStroke(null, o, [{ x: mid.x, y: line.y - 30 }, { x: mid.x, y: line.y + 30 }], HL, [], now).planner
    assert.equal(cross.nowColor, undefined)
    assert.equal(Object.values(cross.rows).filter(isScheduled).length, 1)
    // 줄을 따라 지우면 기본 빨강으로(밑 일정은 그대로), 바꾼 색이 없으면 지우개는 예전대로
    const reset = eraseDayPlanner(hl, o, along, now)
    assert.equal(reset.nowColor, undefined)
    assert.equal(dayNowLine(o, reset, now).color, NOW_LINE_COLOR)
    // 지금 시각을 안 주면(테스트 · 내보내기) 줄을 보지 않는다
    assert.equal(applyDayStroke(null, o, [mid], PEN, []), null)
  }
  // 저장 값 정리: 잘못된 색은 버린다
  assert.equal(normalizeDayPlanner({ nowColor: 'red' }).nowColor, undefined)
  assert.equal(normalizeDayPlanner({ nowColor: '#3a86ff' }).nowColor, '#3A86FF')
})
