import test from 'node:test'
import assert from 'node:assert/strict'
import { centeredOffset, clampOffset, panView } from '../src/editor/utils/viewport.js'

const padding = { top: 84, bottom: 76, side: 28 }
const page = { width: 1188, height: 840 }
const fit = (stage) => Math.min((stage.width - 2 * padding.side) / page.width, (stage.height - padding.top - padding.bottom) / page.height)

for (const stage of [{ width: 700, height: 700 }, { width: 1000, height: 700 }]) {
  test(`연속 이동 이벤트를 렌더링 없이 누적한다 (편집 영역 ${stage.width}px)`, () => {
    const zoom = fit(stage)
    const initial = { scale: 1, x: null, y: null }
    const start = centeredOffset(stage, zoom, page.width, page.height, padding)
    const steps = Array.from({ length: 30 }, () => ({ dx: 3, dy: -2 }))
    const actual = steps.reduce((view, { dx, dy }) => panView(view, dx, dy, zoom, stage, page.width, page.height, padding), initial)
    // 두 손가락 이동처럼 절대 좌표로 계산해도 같은 최종 위치여야 한다.
    const expected = clampOffset({ x: start.x + 90, y: start.y - 60 }, zoom, stage, page.width, page.height)
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9)
    assert.ok(Math.abs(actual.y - expected.y) < 1e-9)
    assert.equal(actual.scale, 1)
  })
}

test('패널 크기 변경 후 최신 배율과 위치에서 이동하고 화면 가장자리 제한을 유지한다', () => {
  const stage = { width: 650, height: 700 }
  const zoom = fit(stage)
  const previous = { scale: 2, x: 120, y: 140 }
  assert.deepEqual(panView(previous, 10, -5, zoom, stage, page.width, page.height, padding), { scale: 2, x: 130, y: 135 })
  const right = panView(previous, 10000, 10000, zoom, stage, page.width, page.height, padding)
  assert.deepEqual(right, { scale: 2, x: stage.width - 80, y: stage.height - 80 })
  const left = panView(right, -10000, -10000, zoom, stage, page.width, page.height, padding)
  assert.equal(left.x, 80 - page.width * zoom * 2)
  assert.equal(left.y, 80 - page.height * zoom * 2)
})

test('제스처 중 배율은 마지막 렌더링 배율보다 우선하고 Viewport 결과를 연속 누적한다', () => {
  const stage = { width: 700, height: 700 }
  let view = { scale: 2, zoom: 1.5, x: 100, y: 120 }
  for (let i = 0; i < 30; i += 1) view = { ...view, ...panView(view, -3, 2, 0.4, stage, page.width, page.height, padding) }
  assert.deepEqual(view, { scale: 2, zoom: 1.5, x: 10, y: 180 })
  const edge = panView(view, -10000, -10000, 0.4, stage, page.width, page.height, padding)
  assert.equal(edge.x, 80 - page.width * 1.5)
  assert.equal(edge.y, 80 - page.height * 1.5)
})
