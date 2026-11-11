import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRoutePath, flattenRoutePath, parseRoutePath, routeSegments } from '../src/editor/templates/routePath.js'
import { DEFAULT_ROUTE_OPTIONS, ROUTE_PAPER_TEMPLATES, assignRouteDays, isRoutePaperId, normalizeRoutePlanner, routeEditTap, routeLegend, routePaperBaseSvg, routePaperLayout, routePaperOverlaySvg, routePaperSketchSvg, routePaperSvg, routePathOf, routeTextSlot, routeTitleEnd, setRoutePlannerOptions } from '../src/editor/templates/routePaper.js'
import { appendPaper, countStepsOf } from '../src/diary/utils/paperChoice.js'
import { paperPrintsText } from '../src/editor/templates/paperFont.js'
import { editorReducer, createInitialState } from '../src/editor/state/editorReducer.js'
import { plannerFor } from '../src/editor/templates/planners.js'
import { getTemplate, reusableTemplates } from '../src/editor/templates/catalog.js'
import { SERVER_TEMPLATE_CATALOG, serverTemplateReference, localTemplateReference } from '../src/editor/templates/serverCatalog.js'
import { PAPERS, countAssetId } from '../src/diary/utils/paperChoice.js'
import { PAPER_SKETCHES } from '../src/diary/utils/paperSketches.js'
import { checkTemplateSvg } from '../scripts/template-svg-rules.mjs'

test('노선 경로는 M · H · C 절대 좌표를 꺾은선으로 펴고 길이 비율 t 로 좌표를 오간다', () => {
  const d = 'M 0 0 H 100 C 100 0 100 100 0 100'
  assert.deepEqual(parseRoutePath(d).map(c => c.c), ['M', 'H', 'C'])
  const segments = routeSegments(d, 4)
  assert.equal(segments[0].kind, 'line'); assert.deepEqual(segments[0].to, { x: 100, y: 0 })
  assert.equal(segments[1].kind, 'curve'); assert.equal(segments[1].points.length, 4); assert.deepEqual(segments[1].points.at(-1), { x: 0, y: 100 })
  assert.equal(flattenRoutePath(d, 4).length, 1 + 1 + 4)
  const route = createRoutePath(d, 32)
  assert.deepEqual(route.pointAt(0), { x: 0, y: 0 })
  const half = route.pointAt(100 / route.total)
  assert.ok(Math.abs(half.x - 100) < 1e-9 && Math.abs(half.y) < 1e-9, '첫 직선 끝이 길이 100')
  assert.deepEqual(route.pointAt(1), { x: 0, y: 100 }); assert.deepEqual(route.pointAt(2), { x: 0, y: 100 }, 't 는 0~1 로 자른다')
  const near = route.nearest({ x: 50, y: -30 })
  assert.ok(Math.abs(near.x - 50) < 1e-9 && Math.abs(near.y) < 1e-9 && Math.abs(near.distance - 30) < 1e-9)
  assert.ok(Math.abs(near.t - 50 / route.total) < 1e-9)
  const back = route.pointAt(near.t)
  assert.ok(Math.abs(back.x - near.x) < 1e-9 && Math.abs(back.y - near.y) < 1e-9, '가장 가까운 점의 t 로 같은 자리를 찾는다')
  assert.throws(() => parseRoutePath('m 0 0 l 10 10'), /노선 경로/)
  assert.throws(() => parseRoutePath('M 0 0 Q 1 1 2 2'), /노선 경로/)
})

test('여행 노선 속지는 가로 1024×768 · 세로 768×1024 두 벌이고 바탕 · 덮개 · 한 장 SVG 가 속지 규격을 지킨다', () => {
  assert.deepEqual(ROUTE_PAPER_TEMPLATES.map(t => [t.id, t.orientation, t.type]), [['route-planner-landscape', 'landscape', 'route'], ['route-planner-portrait', 'portrait', 'route']])
  for (const { id, orientation } of ROUTE_PAPER_TEMPLATES) {
    assert.equal(isRoutePaperId(id), true)
    const L = routePaperLayout(orientation), [w, h] = orientation === 'portrait' ? [768, 1024] : [1024, 768]
    assert.deepEqual([L.w, L.h], [w, h])
    const base = routePaperBaseSvg(orientation)
    assert.ok(base.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`))
    assert.ok(base.includes('aria-label="지역"') && base.includes('aria-label="날짜"') && !base.includes('aria-label="DAY'), '바탕은 지역 · 날짜 칸만, DAY 제목은 덮개')
    assert.equal(checkTemplateSvg(base, orientation).length, 0, '바탕은 다른 속지와 같은 형식 규칙(흰 바탕 · 회색 6색 · 도형만)')
    assert.equal(base.includes(`d="${L.path}"`), false, '바탕에는 노선이 없다(반투명 노선 아래로 비치지 않게)')
    assert.ok(routePaperSketchSvg(orientation).includes(`<line x1="${routePathOf(orientation).points[0].x}"`), '대표 그림용 SVG 는 노선을 선으로 요약한다')
    const overlay = routePaperOverlaySvg(orientation, null)
    assert.ok(overlay.includes(`stroke="${DEFAULT_ROUTE_OPTIONS.color}"`) && overlay.includes('stroke-width="6"') && overlay.includes('data-preserve-paint="true"'), '기록이 없으면 기본 스타일')
    assert.ok(overlay.includes('aria-label="DAY 1"'), '기록이 없으면 DAY 1')
    assert.ok(routePaperOverlaySvg(orientation, { options: { day: 12 } }).includes('aria-label="DAY 12"'))
    assert.ok(routePaperSketchSvg(orientation).includes('aria-label="DAY 1"'), '대표 그림에도 제목 자리')
    const styled = routePaperOverlaySvg(orientation, { options: { color: '#a69acb', width: 10, opacity: 0.5 } })
    assert.ok(styled.includes('stroke="#A69ACB"') && styled.includes('stroke-width="10"') && styled.includes('stroke-opacity="0.5"'))
    assert.ok(routePaperSvg(orientation, null).includes(`d="${L.path}"`), '한 장 SVG 에 노선이 들어간다')
    // 노선은 머리줄(y ≤ 92) 아래를 지나고 종이 안에 있다
    for (const p of routePathOf(orientation).points) assert.ok(p.x >= 0 && p.x <= w && p.y > 92 && p.y <= h, `${orientation} ${p.x},${p.y}`)
  }
})

test('기록은 색 · 굵기 · 진하기만 검증해 담고 범위 밖 값은 범위 안으로 맞춘다', () => {
  assert.deepEqual(normalizeRoutePlanner(null), { options: { ...DEFAULT_ROUTE_OPTIONS } })
  assert.deepEqual(normalizeRoutePlanner({ options: { day: 250, color: 'red', width: 99, opacity: 0 }, junk: 1 }), { options: { day: 99, color: DEFAULT_ROUTE_OPTIONS.color, width: 16, opacity: 0.2 } })
  assert.deepEqual(setRoutePlannerOptions(null, { color: '#d99a8b', width: 3.44, day: 2.4 }).options, { day: 2, color: '#D99A8B', width: 3.4, opacity: 1 })
})

test('머리줄 칸(지역 · 날짜)을 누르면 밑줄 폭의 마루부리 글상자, 제목 · 그 밖은 null', () => {
  for (const orientation of ['landscape', 'portrait']) {
    const L = routePaperLayout(orientation)
    assert.equal(routeTextSlot(orientation, { x: 60, y: 60 }), null, 'DAY 제목 자리는 글상자가 아니다')
    for (const key of ['region', 'date']) {
      const slot = routeTextSlot(orientation, { x: L[key].x + 2, y: 60 })
      assert.deepEqual([slot.x, slot.width, slot.font, slot.fontSize], [L[key].line[0], L[key].line[1] - L[key].line[0], 'maruburi', 14])
    }
    assert.equal(L.date.line[1], L.right, '날짜 칸은 오른쪽 끝에 붙는다'); assert.ok(L.region.line[1] < L.sep && L.sep < L.date.x, '지역 | 날짜 구분선')
    // 부제목 칸: 제목 구분선 뒤부터 「지역」 앞까지. DAY 번호 자릿수가 늘면 시작이 뒤로 간다
    const subtitle = routeTextSlot(orientation, { x: routeTitleEnd(null) + 30, y: 60 })
    assert.deepEqual([subtitle.x, subtitle.x + subtitle.width, subtitle.fontSize], [routeTitleEnd(null) + 16, L.region.x - 24, 16])
    assert.ok(routeTitleEnd({ options: { day: 12 } }) > routeTitleEnd({ options: { day: 1 } }))
    assert.equal(routeTextSlot(orientation, { x: routeTitleEnd(null) - 30, y: 60 }), null, '제목 자리')
    assert.equal(routeTextSlot(orientation, { x: 100, y: 300 }), null)
  }
})

test('아래 범례(노선 견본 · 출발 · 방문 · 도착)는 노선 아래 종이 안에 인쇄되고, 선택 도구로 누르면 DAY 번호 · 노선 스타일 창이나 지점 추가가 된다', () => {
  for (const { id, orientation } of ROUTE_PAPER_TEMPLATES) {
    const L = routePaperLayout(orientation), legend = routeLegend(orientation)
    assert.deepEqual(legend.map(item => item.kind), ['line', 'start', 'stop', 'end'])
    const pathBottom = Math.max(...routePathOf(orientation).points.map(p => p.y))
    for (const item of legend) assert.ok(item.box.y > pathBottom + 8 && item.box.y + item.box.h <= L.h && item.box.x >= 0 && item.box.x + item.box.w <= L.w, `${orientation} ${item.kind} 범례는 노선 아래 종이 안`)
    const overlay = routePaperOverlaySvg(orientation, { options: { color: '#a69acb' } })
    for (const name of ['출발', '방문', '도착']) assert.ok(overlay.includes(`aria-label="${name}"`), `${name} 이름`)
    assert.ok((overlay.match(/<circle[^>]*stroke="#A69ACB"[^>]*data-preserve-paint="true"/g) ?? []).length >= 3, '표식은 노선 색이라 레이아웃 색 변경에서 보호')
    assert.ok(routePaperSvg(orientation, null).includes('aria-label="출발"'), '한 장 SVG(출력)에도 범례')
    assert.equal(routePaperSketchSvg(orientation).includes('aria-label="출발"'), false, '대표 그림에는 범례를 넣지 않는다')
    assert.deepEqual(routeEditTap(orientation, null, { x: 60, y: 60 }), { picker: { kind: 'routeDay' } }, 'DAY 제목')
    assert.deepEqual(routeEditTap(orientation, null, { x: legend[0].x1 + 10, y: legend[0].y }), { picker: { kind: 'routeStyle' } }, '노선 견본')
    assert.deepEqual(routeEditTap(orientation, null, { x: legend[2].cx, y: legend[2].cy }), { routeAdd: 'stop' }, '방문 표식')
    assert.deepEqual(routeEditTap(orientation, null, { x: legend[3].labelX + 4, y: legend[3].cy + 10 }), { routeAdd: 'end' }, '이름까지 누름 상자')
    assert.equal(routeEditTap(orientation, null, { x: routeTitleEnd(null) + 40, y: 60 }), null, '부제목 칸은 글상자 자리(텍스트 도구)')
    assert.equal(routeEditTap(orientation, null, { x: 400, y: 300 }), null)
    assert.deepEqual(plannerFor(id).editTap(null, { x: 60, y: 60 }, [], '#000000'), { picker: { kind: 'routeDay' } }, '어댑터가 이어 준다')
  }
})

test('플래너 어댑터 · 카탈로그 · 서버 코드 · 속지 고르기 · 대표 그림에 여행 노선이 등록된다', () => {
  for (const orientation of ['landscape', 'portrait']) {
    const id = `route-planner-${orientation}`
    const adapter = plannerFor(id)
    assert.equal(adapter.kind, 'route'); assert.equal(adapter.orientation, orientation)
    assert.ok(adapter.titles([]), '덮개를 늘 그리게 한다')
    assert.equal(adapter.stroke(null, [{ x: 1, y: 1 }], {}, []), null); assert.equal(adapter.erase(null, [], 'stroke'), null)
    assert.equal(adapter.svg(null, []).includes('data-preserve-paint'), true)
    assert.equal(getTemplate(id, '1.0.0').type, 'route')
    const ref = serverTemplateReference(id, '1.0.0', orientation)
    assert.equal(ref.templateCode, id)
    assert.equal(localTemplateReference(ref.templateCode, ref.templateVersion).backgroundAssetId, id)
    assert.ok(SERVER_TEMPLATE_CATALOG.some(row => row.templateCode === id && row.category === 'ROUTE'))
    assert.equal(countAssetId('route', orientation), id)
    assert.ok(PAPER_SKETCHES[`route-${orientation}`], '속지 고르기 대표 그림')
    assert.ok(reusableTemplates(orientation).some(item => item.type === 'route' && item.assetId === id), '페이지 추가 메뉴')
  }
  const routePaper = PAPERS.find(p => p.id === 'route')
  assert.deepEqual([routePaper.group, routePaper.name, routePaper.kind, routePaper.type, routePaper.defaultCount], ['planner', '여행 노선', 'count', 'route', 3])
})

// 플래그는 import 시점에 고정되므로 값을 0으로 둔 자식 프로세스에서 모듈을 새로 읽어 확인한다(V27 플래너 플래그 테스트와 같은 방식).
test('플래그 0 빌드는 여행 노선 선택·생성을 막고 이미 저장된 노선 페이지 해석은 유지한다', () => {
  const source = `
    import assert from 'node:assert/strict'
    import { reusableTemplates, getTemplate } from ${JSON.stringify(new URL('../src/editor/templates/catalog.js', import.meta.url).href)}
    import { SERVER_TEMPLATE_CATALOG, ROUTE_TEMPLATE_SELECTION_ENABLED, PLANNER_TEMPLATE_SELECTION_ENABLED, serverTemplateSelectable, serverTemplateReference, localTemplateReference } from ${JSON.stringify(new URL('../src/editor/templates/serverCatalog.js', import.meta.url).href)}
    import { plannerFor } from ${JSON.stringify(new URL('../src/editor/templates/planners.js', import.meta.url).href)}
    import { papersIn, paperById } from ${JSON.stringify(new URL('../src/diary/utils/paperChoice.js', import.meta.url).href)}
    assert.equal(ROUTE_TEMPLATE_SELECTION_ENABLED, false); assert.equal(PLANNER_TEMPLATE_SELECTION_ENABLED, true)
    assert.equal(papersIn('planner').some(paper => paper.type === 'route'), false, '다이어리 만들기 · 속지 고르기 목록에서도 빠진다')
    assert.equal(paperById('route').type, 'route', '이미 만든 노선 다이어리는 그대로 읽는다')
    const rows = SERVER_TEMPLATE_CATALOG.filter(row => /^route-planner-/.test(row.templateCode))
    assert.equal(rows.length, 2)
    for (const row of rows) {
      const orientation = row.orientation.toLowerCase()
      assert.equal(serverTemplateSelectable(row), false)
      assert.throws(() => serverTemplateReference(row.backgroundAssetId, row.templateVersion, orientation))
      assert.equal(localTemplateReference(row.templateCode, row.templateVersion).backgroundAssetId, row.backgroundAssetId)
      assert.equal(getTemplate(row.backgroundAssetId, row.templateVersion).type, 'route')
      assert.equal(plannerFor(row.backgroundAssetId).kind, 'route', '저장된 노선 페이지는 그대로 그린다')
      assert.equal(reusableTemplates(orientation).some(item => item.type === 'route'), false, '페이지 추가 메뉴에서 빠진다')
    }
    // 플래너 메뉴는 그대로(스터디 · 데일리 + 공용 속지)
    assert.equal(reusableTemplates('landscape').length, 10)
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, EXPO_PUBLIC_ROUTE_TEMPLATES_ENABLED: '0' }, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('노선 속지 페이지는 만들 때 DAY 1 · 2 · 3 으로 번호를 받고, 페이지 추가는 다음 번호를 받으며, 번호가 있는 페이지는 그대로 둔다', () => {
  const route = i => ({ id: `p${i}`, backgroundAssetId: 'route-planner-landscape', objects: [] })
  const numbered = assignRouteDays([route(1), { id: 'n', backgroundAssetId: '2026-reusable-note-plain-landscape', objects: [] }, route(2), { ...route(3), planner: { options: { day: 9 } } }])
  assert.deepEqual(numbered.map(p => p.planner?.options?.day), [1, undefined, 2, 9])
  assert.deepEqual(assignRouteDays([route(4)], numbered).map(p => p.planner.options.day), [10], '이미 있는 노선 페이지의 가장 큰 번호(9) 다음부터')
  assert.deepEqual(assignRouteDays([route(5)], [{ ...route(2), planner: { options: { day: 2 } } }, { ...route(3), planner: { options: { day: 3 } } }]).map(p => p.planner.options.day), [4], 'DAY 1 을 지운 뒤 추가해도 3 이 겹치지 않는다')
  assert.deepEqual(assignRouteDays([route(6), route(7)], [{ ...route(1), planner: { options: { day: 99 } } }]).map(p => p.planner.options.day), [99, 99], '최대 99')
  assert.deepEqual(assignRouteDays([{ ...route(8), planner: { options: { day: 5 } } }, route(9)]).map(p => p.planner.options.day), [5, 6], '번호 있는 페이지 뒤는 그 번호 다음을 잇는다')
  let state = createInitialState({ pages: [{ ...route(1), planner: { options: { day: 1 } } }, { ...route(2), planner: { options: { day: 2 } } }] })
  state = editorReducer(state, { type: 'addPage', backgroundAssetId: 'route-planner-landscape' })
  assert.equal(state.doc.pages.find(p => p.id !== 'p1' && p.id !== 'p2').planner.options.day, 3)
  assert.equal(editorReducer(state, { type: 'addPage', backgroundAssetId: '2026-reusable-note-plain-landscape' }).doc.pages.filter(p => p.planner).length, 3, '다른 속지는 기록을 만들지 않는다')
})

test('노선 속지의 장수는 여행 기간으로 고르고 기본 2박 3일, 글꼴도 다른 속지처럼 따른다', () => {
  assert.deepEqual(countStepsOf(PAPERS.find(p => p.id === 'route')).map(([n]) => n), [2, 3, 4, 5, 7, 14, 30])
  assert.deepEqual(countStepsOf(PAPERS.find(p => p.id === 'plain')), [10, 30, 50, 100], '다른 속지는 공통 장수')
  assert.equal(appendPaper([], 'route')[0].rows[0].count, 3)
  assert.equal(appendPaper([], 'plain')[0].rows[0].count, 10)
  // 2026-11-09 에는 글꼴 고르기를 두지 않았다. 그때는 노선 속지 글자(출 · 발 · 방 · 문 · 도 · 착 · DAY)가
  // 글꼴 표에 아예 없어 바꿔도 안 바뀌었다. 2026-11-11 에 표를 속지 전체로 넓혀 채웠으므로 이제 따른다
  // (글자는 plannerDraw.write 가 <g aria-label> + transform 으로 그려 교체 대상이 된다).
  assert.equal(paperPrintsText('route-planner-landscape'), true)
  assert.equal(paperPrintsText('study-planner-landscape'), true)
  assert.equal(paperPrintsText('2026-reusable-note-plain-portrait'), false, '인쇄 글자가 없는 노트는 그대로 둔다')
})
