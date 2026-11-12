// 잉크펜(glass) 무늬 자리와 번진 자리. 2026-11-13 에 고친 두 가지를 못 박는다.
//  ① 무늬가 **획 자기 좌표**에 붙어 있어 어디에 긋든 같은 도장이 찍혔다(inkOrigin · glassOrigin).
//  ② 획 밖으로 번진 자리를 상자 · 지우개가 안 봐서, 보이는 잉크에 지우개를 대도 안 지워졌다(GLASS_BLEED).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createStroke, glassOrigin, GLASS_BLEED, penSweeps } from '../src/editor/utils/strokes.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'

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
