import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bakeWindow, coversPage, keepWindow, reachOf, reachTouches, removedBetween, sameObjects, stepUpScale } from '../src/editor/skia/bakeDelta.js'

const o = id => ({ id, x: 0, y: 0, w: 10, h: 10 })

test('지우개로 획이 빠진 같은 순서의 목록만 빠진 획을 돌려준다', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(o)
  assert.deepEqual(removedBetween([a, b, c, d], [a, c]), [b, d])
  assert.deepEqual(removedBetween([a, b, c, d], [b, c, d]), [a])
  assert.equal(removedBetween([a, b, c], [a, b, c]), null, '바뀐 것이 없으면 null')
  assert.equal(removedBetween([a, b, c], [a, b, c, d]), null, '추가는 다시 굽는다')
  assert.equal(removedBetween([a, b, c], [a, { ...b }, c]), null, '교체는 다시 굽는다')
  assert.equal(removedBetween([a, b, c], [c, b]), null, '순서가 바뀌면 다시 굽는다')
  assert.deepEqual(removedBetween([a, b], []), [a, b])
})

test('획이 칠한 범위는 회전해도 벗어나지 않는 원이고 겹치지 않는 먼 획은 건드리지 않는다', () => {
  const near = reachOf({ x: 0, y: 0, w: 40, h: 30 }), far = reachOf({ x: 500, y: 500, w: 40, h: 30 })
  assert.equal(near.x, 20)
  assert.ok(near.r >= Math.hypot(40, 30) / 2)
  assert.equal(reachTouches(near, reachOf({ x: 30, y: 10, w: 40, h: 30 })), true)
  assert.equal(reachTouches(near, far), false)
})

test('같은 참조의 목록만 같다고 본다', () => {
  const [a, b] = [o('a'), o('b')]
  assert.equal(sameObjects([a, b], [a, b]), true)
  assert.equal(sameObjects([a, b], [a, { ...b }]), false)
  assert.equal(sameObjects([a], [a, b]), false)
})

test('굽는 창은 보이는 범위에 여유를 두고 격자에 맞추며, 조금 밀어서는 안 바뀐다', () => {
  const page = { width: 2000, height: 3000 }
  // 보이는 범위가 없으면(썸네일 · 내보내기) 페이지 전체
  assert.deepEqual(bakeWindow(null, page.width, page.height), { x: 0, y: 0, w: 2000, h: 3000 })
  // 여유 30% 를 붙이고 격자 160 으로 넓힌다
  const win = bakeWindow({ x: 800, y: 1000, width: 400, height: 600 }, page.width, page.height)
  assert.deepEqual(win, { x: 640, y: 800, w: 800, h: 1120 })   // 680→640 · 1320→1440 · 820→800 · 1780→1920
  // 살짝 밀어도 같은 창이다 — 밀 때마다 다시 굽지 않는다
  assert.deepEqual(bakeWindow({ x: 820, y: 1010, width: 400, height: 600 }, page.width, page.height), win)
  // 많이 밀면 창이 바뀐다
  assert.notDeepEqual(bakeWindow({ x: 1200, y: 1010, width: 400, height: 600 }, page.width, page.height), win)
  // 페이지 밖으로는 안 나간다
  assert.deepEqual(bakeWindow({ x: -50, y: -50, width: 400, height: 600 }, page.width, page.height), { x: 0, y: 0, w: 480, h: 800 })
})

test('창이 페이지를 다 덮으면 창 밖 바탕을 굽지 않고, 확대해 창이 좁아지면 바탕을 깐다', () => {
  // 미는 중에는 Viewport 가 캔버스를 다시 그리지 않고 transform 으로만 옮기므로, 창 밖으로 밀면
  // 손을 뗄 때까지 그 자리가 빈다 - 낮은 해상도 전체 바탕을 창 밖에 깔아 그 빈자리를 메운다.
  assert.equal(coversPage(bakeWindow(null, 2000, 3000), 2000, 3000), true)         // 썸네일 · 내보내기
  assert.equal(coversPage(bakeWindow({ x: 0, y: 0, width: 2000, height: 3000 }, 2000, 3000), 2000, 3000), true)  // 화면에 맞춤
  assert.equal(coversPage(bakeWindow({ x: 800, y: 1000, width: 400, height: 600 }, 2000, 3000), 2000, 3000), false)  // 확대
})

test('창 밖 바탕은 또렷한 그림 아래에 깔고 창 안쪽은 잘라 낸다', () => {
  // 겹쳐 그리면 반투명 잉크(형광펜)가 두 번 곱해져 그 자리만 진해진다 - 창 안쪽은 잘라 내야 한다.
  const src = readFileSync(new URL('../src/editor/components/canvas/CompletedStrokeLayer.native.js', import.meta.url), 'utf8')
  const backdrop = src.indexOf('wide && plan.tiles.length && covered ?')
  const sharp = src.indexOf('plan.tiles.map(tile =>')
  assert.ok(backdrop > 0 && sharp > backdrop, '바탕은 또렷한 그림보다 먼저(아래에) 그려야 한다')
  assert.match(src.slice(backdrop, sharp), /invertClip/, '덮이는 쪽을 잘라 내야 한다')
  // 창(160 격자)이 아니라 **타일이 덮는 네모**로 잘라야 한다. 타일은 256 칸이라 창 밖으로 최대 255
  // 더 뻗고, 창으로 자르면 그 띠에서 바탕과 타일이 둘 다 그려져 반투명 잉크가 진해진다.
  assert.match(src.slice(backdrop, sharp), /snapRect\(covered, snapDp\)/)
  // 자르는 자리 · 타일 자리 · 벡터 획을 자르는 자리는 **모두 같은 기기 픽셀 경계**여야 한다.
  // 하나라도 어긋나면 그 한 줄이 두 번 그려지거나(진해짐) 비어(옅어짐) 네모난 테두리로 보인다
  // (2026-11-13: dp 로만 반올림해서 PixelRatio 2.625 기기에서 경계가 픽셀 한가운데 떨어졌다).
  assert.match(src.slice(sharp), /tileScreenRect\(tile, zoom, PixelRatio\.get\(\)\)/, '타일도 같은 기기 픽셀 반올림을 쓴다')
  assert.match(src, /snapRect\(box, snapPage\)/, '벡터 획을 자르는 자리도 같은 반올림을 쓴다')
  assert.match(src, /const snapPage = v => Math\.round\(v \* screenScale\) \/ screenScale/, '배율 그룹 안은 페이지 좌표로 돌려준다')
  assert.match(src, /const snapDp = v => Math\.round\(v \* screenScale\) \/ PixelRatio\.get\(\)/, '배율 그룹 밖은 dp 로 돌려준다')
  // 양 끝을 각각 맞춰 폭을 빼야 이웃한 두 칸의 맞닿은 변이 같은 자리에 떨어진다
  assert.match(src, /snap\(box\.x \+ box\.w\) - snap\(box\.x\)/)
  assert.match(src, /tilesBounds\(win, width, height\)/)
  // 바탕 배율은 페이지 크기만 따른다 - 확대율이 들어가면 확대할 때마다 다시 구워진다
  assert.match(src, /const wideScale = Math\.sqrt\(WIDE_MAX_PX \/ Math\.max\(1, width \* height\)\)/)
})

test('확대해 보이는 범위가 좁아지면 쓰던 창을 그대로 쓰고, 너무 헐렁해지면 다시 잡는다', () => {
  // 창을 바꾸면 화면의 모든 획을 다시 래스터화한다(실측 195획 417ms) - 바꿀 일을 줄이는 게 핵심이다.
  const page = { width: 4000, height: 4000 }
  const wide = bakeWindow({ x: 1000, y: 1000, width: 800, height: 800 }, page.width, page.height)
  // 확대: 보이는 범위가 좁아져 쓰던 창 안에 들어온다 - 그대로 쓴다
  const zoomedIn = bakeWindow({ x: 1200, y: 1200, width: 500, height: 500 }, page.width, page.height)
  assert.equal(keepWindow(wide, zoomedIn), true)
  // 너무 좁아지면(쓰던 창이 필요한 넓이의 세 배를 넘으면) 다시 잡는다 - 안 그러면 쓸데없이 넓은 데를
  // 높은 배율로 굽다가 픽셀 상한에 걸려 오히려 흐려진다
  const tiny = bakeWindow({ x: 1300, y: 1300, width: 150, height: 150 }, page.width, page.height)
  assert.equal(keepWindow(wide, tiny), false)
  // 밀어서 창 밖으로 나가면 다시 잡는다
  const moved = bakeWindow({ x: 2600, y: 1000, width: 500, height: 500 }, page.width, page.height)
  assert.equal(keepWindow(wide, moved), false)
  assert.equal(keepWindow(null, zoomedIn), false)
})

test('굽는 배율은 화면 배율 이상으로 한 옥타브 네 칸에 맞춰 올린다', () => {
  // 올림이라 구운 그림이 늘 화면보다 촘촘하다 - 줄여 그려지므로 흐려지지 않는다
  for (const s of [0.3, 1, 1.05, 1.7, 2.96, 5.2]) assert.ok(stepUpScale(s) >= s, `${s}`)
  // 한 칸(약 19%) 안에서 움직이면 같은 값이라 다시 굽지 않는다
  assert.equal(stepUpScale(2.1), stepUpScale(2.3))
  // 칸을 넘으면 달라진다
  assert.notEqual(stepUpScale(2.1), stepUpScale(2.9))
  // 칸 경계는 2의 거듭제곱 - 낭비는 최대 2^(1/4) = 약 1.19배
  for (const s of [0.3, 1.05, 2.96]) assert.ok(stepUpScale(s) / s < Math.pow(2, 1 / 4) + 1e-9, `${s}`)
})
