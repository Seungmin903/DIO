// 잉크펜(glass) 무늬 자리와 번진 자리. 2026-11-13 에 고친 두 가지를 못 박는다.
//  ① 무늬가 **획 자기 좌표**에 붙어 있어 어디에 긋든 같은 도장이 찍혔다(inkOrigin · glassOrigin).
//  ② 획 밖으로 번진 자리를 상자 · 지우개가 안 봐서, 보이는 잉크에 지우개를 대도 안 지워졌다(GLASS_BLEED).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createStroke, glassOrigin, GLASS_BLEED, penSweeps } from '../src/editor/utils/strokes.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createInitialState, editorReducer, getCurrentPage } from '../src/editor/state/editorReducer.js'

const points = [{ x: 100, y: 100 }, { x: 300, y: 100 }]
const glass = (over = {}) => createStroke(points, { id: 'g', width: 4, kind: 'glass', ...over })
const ball = (over = {}) => createStroke(points, { id: 'b', width: 4, kind: 'ball', ...over })

test('잉크펜 획은 그은 자리(inkOrigin)를 적어 두고, 다른 펜은 적지 않는다', () => {
  const one = glass()
  assert.deepEqual(one.inkOrigin, { x: one.x, y: one.y }, '상자 왼쪽 위가 곧 페이지 자리다')
  assert.equal(ball().inkOrigin, undefined, '무늬를 쓰지 않는 펜에는 붙이지 않는다')
})

test('glassOrigin 은 적어 둔 자리를 먼저 쓰고, 없으면 지금 자리를 쓴다', () => {
  // 옮긴 뒤에도 무늬가 획을 따라가야 하므로 **적어 둔 값**이 이긴다
  const moved = { ...glass(), x: 999, y: 888 }
  assert.deepEqual(glassOrigin(moved), moved.inkOrigin)
  assert.notDeepEqual(glassOrigin(moved), { x: 999, y: 888 })
  // 옛 획(적어 둔 값 없음)은 지금 자리로 대신한다 — 적어도 자리마다 무늬가 달라진다
  const old = { ...glass(), x: 40, y: 70 }
  delete old.inkOrigin
  assert.deepEqual(glassOrigin(old), { x: 40, y: 70 })
  // 아무것도 없으면 0
  assert.deepEqual(glassOrigin(undefined), { x: 0, y: 0 })
})

test('자리가 다르면 밀어주기도 달라야 한다 — 같은 손놀림이라도', () => {
  const here = createStroke(points, { id: 'a', width: 4, kind: 'glass' })
  const there = createStroke(points.map(p => ({ x: p.x + 500, y: p.y + 300 })), { id: 'b', width: 4, kind: 'glass' })
  assert.notDeepEqual(glassOrigin(here), glassOrigin(there))
})

test('잉크펜 상자는 번진 자리(GLASS_BLEED)만큼 양옆으로 넓다', () => {
  // 상자에는 최소 20 바닥값이 있어 짧은 쪽은 비교가 안 된다 → 가로 · 세로 다 긴 획으로 본다
  const slanted = [{ x: 100, y: 100 }, { x: 300, y: 260 }]
  const g = createStroke(slanted, { id: 'g', width: 4, kind: 'glass' })
  const b = createStroke(slanted, { id: 'b', width: 4, kind: 'ball' })
  assert.ok(Math.abs((g.w - b.w) - 2 * GLASS_BLEED) < 1e-9, `${g.w} vs ${b.w}`)
  assert.ok(Math.abs((g.h - b.h) - 2 * GLASS_BLEED) < 1e-9, `${g.h} vs ${b.h}`)
})

test('지우개는 잉크펜의 번진 자리에 닿아도 지운다 — 다른 펜은 그 자리에서 안 지워진다', () => {
  // 획은 y = 100, 굵기 4 → 실루엣은 y 98~102. 지우개 반지름 1 로 실루엣 **밖**만 스친다.
  const radius = 1
  const just = 100 + 2 + GLASS_BLEED - 0.2    // 번진 자리 안(실루엣 밖)
  const beyond = 100 + 2 + GLASS_BLEED + 1.5  // 번진 자리 밖
  const touch = (object, y) => createEraserSession([object], radius).move({ x: 200, y })
  assert.deepEqual(touch(glass(), just), ['g'], '보이는 잉크에 닿으면 지워진다')
  assert.deepEqual(touch(ball(), just), [], '번지지 않는 펜은 그 자리에 잉크가 없다')
  assert.deepEqual(touch(glass(), beyond), [], '번진 자리 밖까지 넓어지지는 않는다')
})

test('둥근 캡의 호는 반지름이 커질수록 잘게 나뉜다 — 굵은 획에서 다각형으로 보이던 것', () => {
  // 전에는 15도 고정이라 반원 캡이 늘 12조각(= 24각형)이었다. 이제는 현 오차(ARC_SAG)를 지키느라
  // 반지름이 클수록 조각이 늘어난다. 가는 획은 15도 상한에 걸려 전과 같다(점이 괜히 늘지 않는다).
  const count = width => {
    const d = penSweeps([{ x: 100, y: 100 }, { x: 160, y: 100 }], width, 'ball').map(part => part.path).join('')
    return (d.match(/L/g) ?? []).length
  }
  const thin = count(2)
  assert.equal(count(8), thin, '가는 · 보통 굵기는 15도 상한 그대로다')
  assert.ok(count(80) > thin, `굵어지면 늘어야 한다 — ${thin} → ${count(80)}`)
  assert.ok(count(160) > count(80), `더 굵으면 더 늘어야 한다 — ${count(80)} → ${count(160)}`)
})

test('옛 획의 대신 값은 끌어 옮기는 동안 흔들리지 않는다', () => {
  // 그때그때 지금 자리를 읽으면 매 프레임 무늬가 바뀌고 그림 열쇠도 달라져 비싼 셰이더를
  // 다시 녹화한다(코드리뷰 2026-11-13). 점 배열이 같으면 같은 값이어야 한다.
  const old = glass()
  delete old.inkOrigin
  const first = glassOrigin(old)
  for (const step of [5, 50, 500]) {
    const dragging = { ...old, x: old.x + step, y: old.y + step }
    assert.deepEqual(glassOrigin(dragging), first, `${step} 만큼 끄는 동안`)
    assert.equal(glassOrigin(dragging), first, '같은 객체를 돌려줘 열쇠가 흔들리지 않는다')
  }
  // 호환 정책: 점 배열이 **새것**이면(다시 불러오기 · 복제) 그때 자리가 새 기준이 된다.
  // 이 판 이전 획은 어차피 다 같은 무늬였으므로 감수한다 — strokes.js 주석에 적어 두었다.
  const reloaded = { ...old, points: old.points.map(point => ({ ...point })), x: old.x + 500 }
  assert.deepEqual(glassOrigin(reloaded), { x: reloaded.x, y: reloaded.y })
})

test('확대한 잉크펜 획도 번진 자리가 페이지 좌표로 1.5 — 두 지우개 길이 같은 답을 낸다', () => {
  // strokePolygons 는 요소 좌표에서 재고 투영에서 늘어난다. 영역 지우개는 페이지 좌표에서 더한다.
  // 미리 나눠 두지 않으면 확대한 획에서 둘이 어긋난다(코드리뷰 2026-11-13).
  const base = glass()
  const grown = { ...base, w: base.w * 3, h: base.h * 3 }
  // 늘인 획의 실루엣 가장자리(페이지 좌표)
  const edge = grown.y + grown.h / 2 + (grown.h / base.h) * (base.strokeWidth / 2)
  const at = (object, y, mode) => createEraserSession([object], 1, mode).move({ x: grown.x + grown.w / 2, y })
  for (const mode of ['stroke', 'area']) {
    assert.ok(at(grown, edge + GLASS_BLEED - 0.3, mode).length > 0, `${mode}: 번진 자리 안은 닿는다`)
    assert.equal(at(grown, edge + GLASS_BLEED * 4, mode).length, 0, `${mode}: 요소 크기만큼 늘어나지 않는다`)
  }
})

test('영역 지우개로 자른 조각은 자르기 전과 같은 무늬를 쓴다', () => {
  // 옮긴 뒤 지우면 조각이 제 자리로 밀어주기를 새로 적어 무늬가 튀었다(코드리뷰 2026-11-13).
  const base = glass()
  const source = { ...base, x: base.x + 400, y: base.y + 250 }
  const session = createEraserSession([source], 6, 'area')
  const middle = { x: source.x + source.w / 2, y: source.y + source.h / 2 }
  assert.deepEqual(session.move(middle), ['g'], '가운데를 지운다')
  const action = session.finish()
  assert.equal(action.type, 'replaceObjects')
  const pieces = action.replacements.g
  assert.ok(pieces.length >= 2, `가운데를 지웠으니 조각이 둘 이상이어야 한다 — ${pieces.length}`)
  // 무늬 좌표 = (페이지 − 상자) + 밀어주기 → 상자가 달라진 만큼 밀어주기도 옮겨져야 같은 무늬다
  const want = source.inkOrigin.x - source.x
  for (const piece of pieces) {
    assert.ok(piece.inkOrigin, `조각 ${piece.id} 에 밀어주기가 있어야 한다`)
    assert.ok(Math.abs((piece.inkOrigin.x - piece.x) - want) < 1e-6,
      `조각 ${piece.id}: ${piece.inkOrigin.x - piece.x} vs ${want}`)
    assert.ok(Math.abs((piece.inkOrigin.y - piece.y) - (source.inkOrigin.y - source.y)) < 1e-6)
  }
})

test('옛 획(적어 둔 자리 없음)을 잘라도 조각끼리 · 자르기 전과 무늬가 같다', () => {
  // 조각은 createStroke 로 새로 만들어져 제 자리로 밀어주기를 적는다. 옛 획에는 기준이 없어
  // 조각마다 달라졌다(코드리뷰 2026-11-13) — glassOrigin 의 대신 값을 기준으로 삼는다.
  const base = glass()
  const source = { ...base, x: base.x + 400, y: base.y + 250 }
  delete source.inkOrigin
  const want = glassOrigin(source).x - source.x
  const session = createEraserSession([source], 6, 'area')
  assert.deepEqual(session.move({ x: source.x + source.w / 2, y: source.y + source.h / 2 }), ['g'])
  const pieces = session.finish().replacements.g
  assert.ok(pieces.length >= 2, `조각이 둘 이상 — ${pieces.length}`)
  for (const piece of pieces) {
    assert.ok(piece.inkOrigin, `조각 ${piece.id} 에 밀어주기를 적어 줘야 한다`)
    assert.ok(Math.abs((piece.inkOrigin.x - piece.x) - want) < 1e-6,
      `조각 ${piece.id}: ${piece.inkOrigin.x - piece.x} vs ${want}`)
  }
})

test('늘렸다 줄여도 번진 자리 여유가 그때 크기를 따른다 — 도형 곳간이 묵지 않는다', () => {
  // 도형은 점 배열을 열쇠로 캐시한다. 열쇠에 지금 크기가 없으면 늘린 뒤에도 옛 여유를 써서
  // 4배로 늘린 획이 1.5 가 아니라 6 단위 밖에서도 지워진다(코드리뷰 2026-11-13).
  const base = glass()
  const far = y => createEraserSession([base], 1, 'stroke').move({ x: 200, y })
  const edgeSmall = 100 + base.strokeWidth / 2
  assert.deepEqual(far(edgeSmall + GLASS_BLEED - 0.3), ['g'], '먼저 작은 크기로 한 번 재 둔다')
  // 같은 점 배열 그대로 4배로 늘린다 → 여유도 그때 크기 기준이어야 한다
  const big = { ...base, w: base.w * 4, h: base.h * 4 }
  const edgeBig = big.y + big.h / 2 + 4 * (base.strokeWidth / 2)
  const hit = y => createEraserSession([big], 1, 'stroke').move({ x: big.x + big.w / 2, y })
  assert.deepEqual(hit(edgeBig + GLASS_BLEED - 0.3), ['g'], '번진 자리 안은 지워진다')
  assert.deepEqual(hit(edgeBig + GLASS_BLEED * 3), [], '옛 여유가 4배로 남아 있으면 안 된다')
})

test('돌린 · 늘인 옛 획을 잘라도 무늬가 그대로다', () => {
  // 돌리거나 늘인 획은 상자를 그대로 쓰는 가지(non-plain)로 간다 — 거기서도 밀어주기를 적어야 한다.
  const base = glass()
  const source = { ...base, rotation: 20, x: base.x + 300, y: base.y + 120 }
  delete source.inkOrigin
  const want = glassOrigin(source)
  const session = createEraserSession([source], 8, 'area')
  session.move({ x: source.x + source.w / 2, y: source.y + source.h / 2 })
  const action = session.finish()
  const pieces = action?.replacements?.g ?? []
  assert.ok(pieces.length >= 1, '조각이 나와야 한다')
  for (const piece of pieces) {
    assert.ok(piece.inkOrigin, `조각 ${piece.id} 에 밀어주기를 적어 줘야 한다`)
    assert.deepEqual(piece.inkOrigin, want, '상자를 그대로 쓰므로 밀어주기도 그대로다')
  }
})

test('번진 자리 여유는 확대율 1 기준 — 축소에서 모자라는 몫이 얼마인지 못 박는다', () => {
  // 번짐은 화면 3px(glassPooled 의 MARGIN)이라 페이지 단위로는 배율을 탄다.
  // 값을 키우면 늘 쓰는 배율에서 판정이 뚱뚱해지므로 **확대율 1** 을 맞추고 축소의 모자람은 감수한다.
  // 그 몫이 얼마인지 수치로 남겨 둔다(코드리뷰 2026-11-13).
  const MARGIN = 3, ZOOM_MIN = 0.5
  const pageBleed = (zoom, dpr) => MARGIN / (zoom * dpr)
  for (const dpr of [2, 2.625, 3]) {
    assert.ok(pageBleed(1, dpr) <= GLASS_BLEED + 1e-9, `확대율 1 · 픽셀비 ${dpr} 은 늘 덮는다`)
    assert.ok(pageBleed(2, dpr) <= GLASS_BLEED, '확대할수록 더 넉넉하다')
  }
  // 가장 나쁜 자리에서도 모자람은 **화면 1.5px** 을 넘지 않는다
  for (const dpr of [2, 2.625, 3]) {
    const short = Math.max(0, pageBleed(ZOOM_MIN, dpr) - GLASS_BLEED)
    assert.ok(short * ZOOM_MIN * dpr <= 1.5 + 1e-9, `픽셀비 ${dpr}: 화면 ${(short * ZOOM_MIN * dpr).toFixed(2)}px`)
  }
})

test('inkOrigin 은 저장 · 동기화를 타고 그대로 살아남는다', () => {
  // 문서는 필드를 고르지 않고 통째로 JSON 으로 오간다(services 의 JSON.parse(JSON.stringify)).
  // 값이 사라지면 다시 열 때마다 대신 값이 쓰여 무늬가 달라지므로 못 박아 둔다(코드리뷰 2026-11-13).
  const one = glass()
  const roundTrip = JSON.parse(JSON.stringify({ pages: [{ objects: [one] }] })).pages[0].objects[0]
  assert.deepEqual(roundTrip.inkOrigin, one.inkOrigin)
  assert.deepEqual(glassOrigin(roundTrip), one.inkOrigin, '다시 열어도 같은 밀어주기를 쓴다')
  // 옮긴 뒤 저장해도 **적어 둔 값**이 이긴다 — 무늬가 획을 따라간다
  const moved = JSON.parse(JSON.stringify({ ...one, x: one.x + 300, y: one.y + 200 }))
  assert.deepEqual(glassOrigin(moved), one.inkOrigin)
})

test('옛 획을 고치면 무늬 기준을 **고치기 전 자리**로 한 번 적어 둔다', () => {
  // 적어 두지 않으면 기기 · 세션마다 기준이 따로 잡혀 같은 획이 다른 무늬로 보인다(코드리뷰 2026-11-13).
  const legacy = glass()
  delete legacy.inkOrigin
  const before = { x: legacy.x, y: legacy.y }
  const doc = { id: 'doc', pages: [{ id: 'page', objects: [legacy] }] }
  let state = createInitialState(doc)
  assert.equal(getCurrentPage(state).objects[0].inkOrigin, undefined, '불러온 그대로는 아직 없다')
  // 아무 고침이나 한 번 — 여기서는 다른 획을 하나 더해 목록만 건드린다
  state = editorReducer(state, { type: 'addObjects', objects: [ball({ id: 'new' })], select: false })
  const after = getCurrentPage(state).objects.find(one => one.id === 'g')
  assert.ok(after, '획이 남아 있다')
  assert.deepEqual(after.inkOrigin, before, '고치기 전 자리로 적힌다')
  assert.deepEqual(glassOrigin(after), before, '그 값이 무늬 기준이 된다')
  // 저장 · 동기화를 타도 그대로 — 이제 기기가 달라도 같은 무늬다
  assert.deepEqual(JSON.parse(JSON.stringify(after)).inkOrigin, before)
})

test('옛 획을 베껴 붙여도 무늬가 튀지 않는다', () => {
  // 사본은 점 배열을 함께 쓰므로 처음에는 원본의 기억으로 그려지다가, 다음 고침에서 제 자리로
  // 적혀 무늬가 튀었다(코드리뷰 2026-11-13). 베낄 때 바로 못 박는다.
  const legacy = glass()
  delete legacy.inkOrigin
  const want = glassOrigin(legacy)
  const doc = { id: 'doc', pages: [{ id: 'page', objects: [legacy] }] }
  let state = createInitialState(doc)
  state = editorReducer(state, { type: 'duplicateObjects', ids: ['g'] })
  const copy = getCurrentPage(state).objects.find(one => one.id !== 'g')
  assert.ok(copy, '사본이 생겼다')
  assert.deepEqual(copy.inkOrigin, want, '베낄 때 바로 적힌다')
  // 그 뒤에 아무 고침이 와도 바뀌지 않는다
  state = editorReducer(state, { type: 'addObjects', objects: [ball({ id: 'new' })], select: false })
  const later = getCurrentPage(state).objects.find(one => one.id === copy.id)
  assert.deepEqual(later.inkOrigin, want, '다음 고침에도 그대로 — 무늬가 안 튄다')
})
