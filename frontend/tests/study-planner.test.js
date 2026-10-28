import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyPlannerStroke, erasePlanner, normalizePlanner, plannerBaseSvg, plannerLayout, plannerOverlaySvg, plannerStrokeCells, plannerTextSlot, plannerTotals, setPlannerOptions,
  studyPlannerSvg, studyPlannerId, wholePercents,
} from '../src/editor/templates/studyPlanner.js'
import { getTemplate, reusableTemplates } from '../src/editor/templates/catalog.js'
import { editorReducer, createInitialState } from '../src/editor/state/editorReducer.js'

const HL = { kind: 'highlighter', color: '#FFE066' }
const PEN = { kind: 'fountain', color: '#EF476F' }
// 시간표 칸 가운데 (머리줄 없이 24줄)
const cell = (r, c, o = 'landscape') => {
  const L = plannerLayout(o), t = L.time, cw = (t.w - t.hc) / 6, rh = t.h / 24
  return { x: t.x + t.hc + (c + 0.5) * cw, y: t.y + (r + 0.5) * rh }
}
// 할 일 r 번째 줄 가운데 높이 (머리줄 30)
const todoY = (r, o = 'landscape') => { const T = plannerLayout(o).todo; return T.y + 30 + (r + 0.5) * (T.h - 30) / T.rows }

test('스터디 플래너 속지가 메뉴와 카탈로그에 가로 · 세로로 있다', () => {
  for (const o of ['landscape', 'portrait']) {
    const item = reusableTemplates(o).find(t => t.type === 'study')
    assert.equal(item.assetId, studyPlannerId(o))
    assert.equal(getTemplate(item.assetId).orientation, o)
  }
})

test('형광펜으로 시간표를 쓸면 지나간 10분 칸이 그 색으로 채워지고 합계가 바뀐다', () => {
  const planner = applyPlannerStroke(null, 'landscape', [cell(3, 0), cell(3, 5)], HL)
  assert.deepEqual(Object.keys(planner.cells).sort(), ['3,0', '3,1', '3,2', '3,3', '3,4', '3,5'])
  assert.equal(plannerTotals(planner).study, 60)
  assert.equal(plannerTotals(planner).range, '09:00 ~ 10:00')
})

test('줄 가장자리만 스친 옆 줄은 칠하지 않는다 (중심선 판정)', () => {
  const a = cell(3, 0), b = cell(3, 2)
  assert.deepEqual(plannerStrokeCells('landscape', [{ ...a, y: a.y + 10 }, { ...b, y: b.y + 10 }]).sort(), ['3,0', '3,1', '3,2'])
})

test('다른 색으로 다시 칠하면 색만 바뀌고 시간은 그대로', () => {
  let p = applyPlannerStroke(null, 'landscape', [cell(3, 0), cell(3, 5)], HL)
  p = applyPlannerStroke(p, 'landscape', [cell(3, 1), cell(3, 2)], { kind: 'highlighter', color: '#FFB3C7' })
  assert.equal(plannerTotals(p).study, 60)
  assert.equal(p.cells['3,1'], '#FFB3C7')
  assert.deepEqual(p.colorOrder, ['#FFE066', '#FFB3C7'])
})

test('쉬는 시간 색은 합계에서 빠지고 따로 센다', () => {
  let p = applyPlannerStroke(null, 'landscape', [cell(3, 0), cell(3, 5)], HL)
  p = applyPlannerStroke(p, 'landscape', [cell(4, 0), cell(4, 2)], { kind: 'highlighter', color: '#B5EAD7' })
  p = { ...p, options: { ...p.options, restColor: '#B5EAD7' } }
  const totals = plannerTotals(p)
  assert.equal(totals.study, 60)
  assert.equal(totals.rest, 30)
  assert.equal(totals.colors.at(-1).rest, true)
  assert.match(studyPlannerSvg('landscape', p), /aria-label="쉬는 시간 30분"/)
  assert.equal(totals.colors.at(-1).percent, null)
})

test('색별 기록은 처음 칠한 순서를 지킨다', () => {
  let p = applyPlannerStroke(null, 'landscape', [cell(3, 0)], { kind: 'highlighter', color: '#A0C4FF' })
  p = applyPlannerStroke(p, 'landscape', [cell(5, 0), cell(5, 5)], HL)
  assert.deepEqual(plannerTotals(p).colors.map(c => c.color), ['#A0C4FF', '#FFE066'])
})

test('펜으로 체크칸을 그으면 그 펜 색 체크, 칸 밖에서 시작한 획은 보통 획', () => {
  const L = plannerLayout('landscape')
  const box = { x: L.todo.x + 17, y: todoY(1) }
  const p = applyPlannerStroke(null, 'landscape', [box, { x: box.x + 6, y: box.y + 5 }, { x: box.x + 14, y: box.y - 9 }], PEN)
  assert.equal(p.checks['1'], '#EF476F')
  assert.equal(applyPlannerStroke(null, 'landscape', [{ x: 10, y: 10 }, { x: 50, y: 50 }], PEN), null)
  // 펜으로 시간표에 쓰는 건 자유 필기
  assert.equal(applyPlannerStroke(null, 'landscape', [cell(3, 0), cell(3, 3)], PEN), null)
})

test('칸 맞춤을 끄면 형광펜도 보통 획으로 남는다', () => {
  assert.equal(applyPlannerStroke({ options: { snap: false } }, 'landscape', [cell(3, 0), cell(3, 5)], HL), null)
})

test('영역 지우개는 지나간 칸 하나만 비운다', () => {
  const p = applyPlannerStroke(null, 'portrait', [cell(3, 0, 'portrait'), cell(3, 5, 'portrait')], HL)
  const erased = erasePlanner(p, 'portrait', [cell(3, 5, 'portrait')], 'area')
  assert.equal(plannerTotals(erased).study, 50)
  assert.equal(erasePlanner(p, 'portrait', [{ x: 5, y: 5 }], 'area'), null)
})

test('획 지우개는 닿은 칸이 속한 막대(같은 줄 · 이어진 같은 색) 전체를 지운다', () => {
  let p = applyPlannerStroke(null, 'landscape', [cell(3, 0), cell(3, 3)], HL)
  p = applyPlannerStroke(p, 'landscape', [cell(3, 4), cell(3, 5)], { kind: 'highlighter', color: '#FFB3C7' })
  p = applyPlannerStroke(p, 'landscape', [cell(4, 0), cell(4, 2)], HL)
  const erased = erasePlanner(p, 'landscape', [cell(3, 1)], 'stroke')
  assert.deepEqual(Object.keys(erased.cells).sort(), ['3,4', '3,5', '4,0', '4,1', '4,2'])
})

test('지우개를 구간씩 나눠 불러도 한 번에 부른 것과 같다', () => {
  const p = applyPlannerStroke(null, 'landscape', [cell(3, 0), cell(3, 5)], HL)
  const path = [cell(2, 2), cell(3, 2), cell(5, 2)]
  for (const mode of ['stroke', 'area']) {
    const once = erasePlanner(p, 'landscape', path, mode)
    const steps = erasePlanner(erasePlanner(p, 'landscape', path.slice(0, 2), mode), 'landscape', path.slice(1), mode) ?? erasePlanner(p, 'landscape', path.slice(0, 2), mode)
    assert.deepEqual(steps.cells, once.cells)
  }
})

test('둥근 끝 형광펜이면 막대 끝이 반원이고, 가운데를 지워 나뉜 조각도 반원 끝을 유지한다', () => {
  const ROUND = { ...HL, lineCap: 'round' }
  const p = applyPlannerStroke(null, 'landscape', [cell(3, 0), cell(3, 5)], ROUND)
  // 시간표 막대의 rx 값들 (반원 끝 = 막대 높이의 절반)
  const half = Math.round((plannerLayout('landscape').time.h / 24 - 5) / 2 * 100) / 100
  const bars = planner => [...plannerOverlaySvg('landscape', planner).matchAll(/height="([\d.]+)" rx="([\d.]+)" fill="#FFE066"/g)].filter(m => Number(m[1]) > 6).map(m => Number(m[2]))
  assert.deepEqual(bars(p), [half])
  const cut = erasePlanner(p, 'landscape', [cell(3, 2)], 'area')
  assert.deepEqual(Object.keys(cut.caps).sort(), ['3,0', '3,1', '3,3', '3,4', '3,5'])
  assert.deepEqual(bars(cut), [half, half])
  // 네모 끝으로 덧칠한 칸은 네모 끝, 둥근 막대와는 따로 그린다
  const mixed = applyPlannerStroke(p, 'landscape', [cell(3, 5)], HL)
  assert.equal(mixed.caps['3,5'], undefined)
  assert.deepEqual(Object.keys(erasePlanner(mixed, 'landscape', [cell(3, 0)], 'stroke').cells), ['3,5'])
  // 시작 시각을 바꾸면 끝 모양도 같이 옮긴다
  assert.equal(setPlannerOptions(p, { startHour: 7 }).caps['2,0'], 'round')
})

test('만족도 하트는 획 · 영역 지우개 모두 닿은 하트 하나씩만 지운다', () => {
  const M = plannerLayout('landscape').mood
  const heart = i => { const s = 20, gap = 8, x0 = M.x + M.w - 12 - 5 * s - 4 * gap; return { x: x0 + s / 2 + i * (s + gap), y: M.y + M.h / 2 } }
  const p = applyPlannerStroke(null, 'landscape', [heart(3)], PEN)
  const filled = planner => normalizePlanner(planner).mood?.hearts.map(h => h ? h.color : null) ?? null
  assert.deepEqual(filled(p), ['#EF476F', '#EF476F', '#EF476F', '#EF476F', null])
  for (const mode of ['stroke', 'area']) {
    const one = erasePlanner(p, 'landscape', [heart(3)], mode)
    assert.deepEqual(filled(one), ['#EF476F', '#EF476F', '#EF476F', null, null])
    assert.equal(erasePlanner(one, 'landscape', [heart(3)], mode), null)
    assert.deepEqual(filled(erasePlanner(one, 'landscape', [heart(1)], mode)), ['#EF476F', null, '#EF476F', null, null])
  }
  let all = p
  for (const i of [0, 1, 2, 3]) all = erasePlanner(all, 'landscape', [heart(i)], 'area')
  assert.equal(normalizePlanner(all).mood, null)
  // 다시 톡 하면 처음부터 채운다
  assert.deepEqual(filled(applyPlannerStroke(erasePlanner(p, 'landscape', [heart(1)]), 'landscape', [heart(2)], PEN)), ['#EF476F', '#EF476F', '#EF476F', null, null])
  // 예전 기록 { i, color, off } 도 읽는다
  assert.deepEqual(filled({ mood: { i: 2, color: '#ef476f', off: [1] } }), ['#EF476F', null, '#EF476F', null, null])
})

test('텍스트 도구로 칸을 누르면 그 칸 · 줄에 맞춘 글상자 자리를 준다', () => {
  for (const o of ['landscape', 'portrait']) {
    const L = plannerLayout(o), T = L.todo
    // 할 일: 누른 줄 칸, 체크칸 · 색 칸 사이 폭, 줄 높이 = 칸 높이
    const todo = plannerTextSlot(o, { x: T.x + 120, y: todoY(4, o) + 6 })
    assert.equal(todo.y, T.y + 30 + 4 * 28)
    assert.equal(todo.fontSize * todo.lineSpacing, 28)
    assert.ok(todo.x > T.x + 34 && todo.x + todo.width < T.x + T.w - 36)
    // 체크칸 · 색 칸은 글상자가 아니다
    assert.equal(plannerTextSlot(o, { x: T.x + 10, y: todoY(4, o) }), null)
    // 오늘 돌아보기: 누른 줄 위 칸, 여러 줄도 밑줄 간격 그대로
    const R = L.review, review = plannerTextSlot(o, { x: R.x + 50, y: R.y + 62 })
    assert.equal(review.y, R.y + 30 + 28 + 3)
    assert.equal(review.width, R.w - 24)
    // 날짜 · D-day · 목표: 밑줄 폭
    assert.deepEqual([plannerTextSlot(o, { x: L.date.x + 2, y: 66 }).x, plannerTextSlot(o, { x: L.date.x + 2, y: 66 }).width], [L.date.line[0], L.date.line[1] - L.date.line[0]])
    assert.equal(plannerTextSlot(o, { x: L.dday.line[1] - 2, y: 66 }).x, L.dday.line[0])
    assert.equal(plannerTextSlot(o, { x: 300, y: 125 }).width, L.right - 124)
    // 시간표 · 요일 위는 아니다
    assert.equal(plannerTextSlot(o, { x: L.time.x + 100, y: L.time.y + 100 }), null)
    assert.equal(plannerTextSlot(o, { x: L.week.x, y: 63 }), null)
  }
  assert.ok(plannerTextSlot('landscape', { x: 100, y: 600 }))
})

test('펜 · 형광펜으로 하트를 여러 개 그으면 지나간 하트가 한 번에 찬다', () => {
  const M = plannerLayout('landscape').mood
  const heart = i => { const s = 20, gap = 8, x0 = M.x + M.w - 12 - 5 * s - 4 * gap; return { x: x0 + s / 2 + i * (s + gap), y: M.y + M.h / 2 } }
  const p = applyPlannerStroke(null, 'landscape', [heart(0), heart(2)], HL)
  const filled = planner => normalizePlanner(planner).mood?.hearts.map(h => h ? h.color : null) ?? null, Y = '#FFE066', P = '#FFB3C7'
  assert.deepEqual(filled(p), [Y, Y, Y, null, null])
  assert.equal(p.mood.hearts[0].hl, true)
  // 가운데부터 그으면 지나간 하트만
  assert.deepEqual(filled(applyPlannerStroke(null, 'landscape', [heart(2), heart(4)], HL)), [null, null, Y, Y, Y])
  // 이미 찬 하트에 누적한다: 1~2번째를 채운 뒤 4~5번째를 그으면 1 · 2 · 4 · 5번째
  const more = applyPlannerStroke(applyPlannerStroke(null, 'landscape', [heart(0), heart(1)], HL), 'landscape', [heart(3), heart(4)], HL)
  assert.deepEqual(filled(more), [Y, Y, null, Y, Y])
  // 가운데를 이어 그으면 빈 곳 없이 다 찬다
  assert.deepEqual(filled(applyPlannerStroke(more, 'landscape', [heart(2), heart(3)], HL)), [Y, Y, Y, Y, Y])
  // 다른 색으로 그으면 그은 하트만 그 색, 나머지는 원래 색
  const mixed = applyPlannerStroke(more, 'landscape', [heart(1), heart(2)], { kind: 'highlighter', color: P })
  assert.deepEqual(filled(mixed), [Y, P, P, Y, Y])
  const svg = plannerOverlaySvg('landscape', mixed)
  assert.equal(svg.match(/fill="#FFB3C7" fill-opacity="0.75"/g).length, 2)
  assert.equal(svg.match(/fill="#FFE066" fill-opacity="0.75"/g).length, 3)
  // 펜으로 그어도 지나간 하트가 그 펜 색으로 누적된다
  const R = '#EF476F'
  assert.deepEqual(filled(applyPlannerStroke(more, 'landscape', [heart(2), heart(3)], PEN)), [Y, Y, R, R, Y])
  assert.equal(applyPlannerStroke(more, 'landscape', [heart(2), heart(3)], PEN).mood.hearts[2].hl, false)
})

test('시작 시각 옵션이 시간 숫자와 시작–끝 표기에 반영된다', () => {
  const p = { ...applyPlannerStroke(null, 'landscape', [cell(0, 0)], HL), options: { startHour: 5 } }
  assert.equal(plannerTotals(p).range, '05:00 ~ 05:10')
  assert.equal(normalizePlanner({ options: { startHour: 9 } }).options.startHour, 6)
})

test('시작 시각을 바꿔도 칠한 칸은 같은 시각에 남는다', () => {
  const p = applyPlannerStroke(null, 'landscape', [cell(3, 0), cell(3, 5)], HL)
  const moved = setPlannerOptions(p, { startHour: 7 })
  assert.equal(plannerTotals(moved).range, '09:00 ~ 10:00')
  assert.ok(moved.cells['2,0'])
  assert.equal(plannerTotals(setPlannerOptions(moved, { startHour: 5 })).range, '09:00 ~ 10:00')
  assert.equal(setPlannerOptions(p, { restColor: '#ffe066' }).options.restColor, '#FFE066')
})

test('색깔별 공부 시간 퍼센트는 정수이고 합이 100', () => {
  assert.deepEqual(wholePercents([10, 10, 10]), [34, 33, 33])
  assert.deepEqual(wholePercents([100, 80, 50]), [43, 35, 22])
  assert.deepEqual(wholePercents([]), [])
  for (const values of [[10, 20, 70], [10, 10, 10, 10, 10, 10, 10], [130, 40, 20, 10], [10, 990]]) {
    const out = wholePercents(values)
    assert.equal(out.reduce((a, b) => a + b, 0), 100)
    assert.ok(out.every(Number.isInteger))
  }
  let p = applyPlannerStroke(null, 'landscape', [cell(3, 0), cell(3, 5)], HL)
  p = applyPlannerStroke(p, 'landscape', [cell(4, 0), cell(4, 2)], { kind: 'highlighter', color: '#FFB3C7' })
  assert.deepEqual(plannerTotals(p).colors.map(c => c.percent), [67, 33])
  assert.match(studyPlannerSvg('landscape', p), /aria-label="67%"/)
  assert.match(studyPlannerSvg('landscape', p), /aria-label="1시간"/)
})

test('할 일 줄을 형광펜으로 쓸면 오른쪽 색 칸이 그 색으로 찬다', () => {
  const L = plannerLayout('landscape'), T = L.todo
  const p = applyPlannerStroke(null, 'landscape', [{ x: T.x + 60, y: todoY(2) }, { x: T.x + 200, y: todoY(2) }], HL)
  assert.equal(p.bands['2'], '#FFE066')
  // 색 칸만 지운다(할 일 글자 위를 지나가도 남는다).
  assert.equal(erasePlanner(p, 'landscape', [{ x: T.x + 100, y: todoY(2) }]), null)
  assert.deepEqual(erasePlanner(p, 'landscape', [{ x: T.x + T.w - 18, y: todoY(2) }]).bands, {})
})

test('바탕에는 기록이 없고, 덮개에는 기록만 있다', () => {
  const p = applyPlannerStroke(null, 'landscape', [cell(3, 0)], HL)
  assert.doesNotMatch(plannerBaseSvg('landscape'), /#FFE066/)
  assert.match(plannerBaseSvg('landscape'), /aria-label="스터디 플래너"/)
  assert.match(plannerOverlaySvg('landscape', p), /fill="#FFE066"/)
  assert.doesNotMatch(plannerOverlaySvg('landscape', p), /스터디 플래너|fill="#FFFFFF"/)
  assert.match(plannerBaseSvg('landscape', 7), /aria-label="07"/)
})

test('SVG는 앱 좌표계 viewBox 와 종이 사각형을 가진다', () => {
  assert.match(studyPlannerSvg('landscape'), /viewBox="0 0 1024 768"/)
  assert.match(studyPlannerSvg('portrait'), /<rect x="0" y="0" width="768" height="1024" fill="#FFFFFF"\/>/)
})

test('setPlanner 는 되돌리기 한 번, after 와 함께면 같은 단위로 묶인다', () => {
  const page = { id: 'p1', backgroundAssetId: studyPlannerId('landscape'), templateVersion: '1.0.0', canvasWidth: 1024, canvasHeight: 768, objects: [{ id: 's1', type: 'stroke' }] }
  let state = createInitialState({ pages: [page] })
  const planner = applyPlannerStroke(null, 'landscape', [cell(3, 0)], HL)
  state = editorReducer(state, { type: 'setPlanner', planner, after: { type: 'removeObjects', ids: ['s1'] } })
  assert.equal(state.doc.pages[0].objects.length, 0)
  assert.equal(plannerTotals(state.doc.pages[0].planner).study, 10)
  state = editorReducer(state, { type: 'undo' })
  assert.equal(state.doc.pages[0].objects.length, 1)
  assert.equal(state.doc.pages[0].planner, undefined)
})

test('PNG · PDF 내보내기 속지에도 칠한 칸이 들어간다', async () => {
  const { createExportSnapshot, prepareExportSnapshot } = await import('../src/editor/utils/pageExport.js')
  const planner = applyPlannerStroke(null, 'portrait', [cell(3, 0, 'portrait'), cell(3, 5, 'portrait')], HL)
  const page = { id: 'p1', backgroundAssetId: studyPlannerId('portrait'), templateVersion: '1.0.0', canvasWidth: 768, canvasHeight: 1024, objects: [], planner }
  const prepared = await prepareExportSnapshot(createExportSnapshot(page), null, () => { throw new Error('파일 속지를 읽으면 안 된다') })
  assert.match(prepared.backgroundXml, /fill="#FFE066"/)
  assert.match(prepared.backgroundXml, /aria-label="1"><path[^]*?aria-label="시간 "><path[^]*?aria-label="00"><path[^]*?aria-label="분">/)
  prepared.dispose()
})
