import test from 'node:test'
import assert from 'node:assert/strict'
import { automaticPageTurn, centeredOffset, clampOffset, isFitView, panView, shouldTurnToNextPage, shouldTurnToPreviousPage } from '../src/editor/utils/viewport.js'

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

test('페이지가 위로 거의 사라질 때만 다음 페이지 전환 조건을 만족한다', () => {
  const stage = { width: 700, height: 700 }
  const almostHidden = { zoom: 1, x: 0, y: 80 - page.height }
  const stillVisible = { zoom: 1, x: 0, y: 160 - page.height }
  assert.equal(shouldTurnToNextPage({ panY: -72 }, almostHidden, stage, page.height, padding.bottom), true)
  assert.equal(shouldTurnToNextPage({ panY: -72 }, stillVisible, stage, page.height, padding.bottom), false)
  assert.equal(shouldTurnToNextPage({ panY: -71 }, almostHidden, stage, page.height, padding.bottom), false)
  assert.equal(shouldTurnToNextPage({ panY: 100 }, almostHidden, stage, page.height, padding.bottom), false)
})

test('페이지가 아래로 거의 사라질 때만 이전 페이지 전환 조건을 만족한다', () => {
  const stage = { width: 700, height: 700 }
  const almostHidden = { zoom: 1, x: 0, y: stage.height - 80 }
  const stillVisible = { zoom: 1, x: 0, y: stage.height - 160 }
  assert.equal(shouldTurnToPreviousPage({ panY: 72 }, almostHidden, stage), true)
  assert.equal(shouldTurnToPreviousPage({ panY: 72 }, stillVisible, stage), false)
  assert.equal(shouldTurnToPreviousPage({ panY: 71 }, almostHidden, stage), false)
  assert.equal(shouldTurnToPreviousPage({ panY: -100 }, almostHidden, stage), false)
})

test('확대·취소된 제스처면 페이지를 넘기지 않는다', () => {
  const stage = { width: 700, height: 700 }
  const topEdge = { zoom: 1, x: 0, y: stage.height - 80 }
  const bottomEdge = { zoom: 1, x: 0, y: 80 - page.height }
  assert.equal(shouldTurnToNextPage({ panY: -100, zoomed: true }, bottomEdge, stage, page.height, padding.bottom), false)
  assert.equal(shouldTurnToNextPage({ panY: -100, cancelled: true }, bottomEdge, stage, page.height, padding.bottom), false)
  assert.equal(shouldTurnToPreviousPage({ panY: 100, zoomed: true }, topEdge, stage), false)
  assert.equal(shouldTurnToPreviousPage({ panY: 100, cancelled: true }, topEdge, stage), false)
})

test('기존 텍스트를 편집하며 포커스를 유지한 동안에는 이전·다음 페이지로 자동 전환하지 않는다', () => {
  const stage = { width: 700, height: 700 }
  const editing = { id: 'text-1', pageId: 'page-1', existing: true, text: '저장 전 수정 내용' }
  const common = { stage, pageHeight: page.height, bottomPadding: padding.bottom, hasPrevious: true, hasNext: true, textEditing: editing }
  assert.equal(automaticPageTurn({ ...common, motion: { panY: -100 }, view: { zoom: 1, y: 80 - page.height } }), null)
  assert.equal(automaticPageTurn({ ...common, motion: { panY: 100 }, view: { zoom: 1, y: stage.height - 80 } }), null)
  assert.equal(editing.text, '저장 전 수정 내용')
})

test('새 텍스트 입력 중에는 이전·다음 페이지로 자동 전환하지 않는다', () => {
  const stage = { width: 700, height: 700 }
  const editing = { id: 'draft-1', pageId: 'page-1', existing: false, text: '새 초안' }
  const common = { stage, pageHeight: page.height, bottomPadding: padding.bottom, hasPrevious: true, hasNext: true, textEditing: editing }
  assert.equal(automaticPageTurn({ ...common, motion: { panY: -100 }, view: { zoom: 1, y: 80 - page.height } }), null)
  assert.equal(automaticPageTurn({ ...common, motion: { panY: 100 }, view: { zoom: 1, y: stage.height - 80 } }), null)
  assert.equal(editing.text, '새 초안')
})

test('화면에 맞춰진 보기(배율 1, 가운데)에서만 맞춤 상태로 본다', () => {
  const stage = { width: 1000, height: 700 }
  const centered = centeredOffset(stage, fit(stage), page.width, page.height, padding)
  assert.equal(isFitView({ scale: 1, x: null, y: null }, centered), true)
  assert.equal(isFitView({ scale: 1, x: centered.x, y: centered.y }, centered), true)
  // 손으로 옮겨 둔 보기와 확대·축소한 보기는 맞춤이 아니다
  assert.equal(isFitView({ scale: 1, x: centered.x + 12, y: centered.y }, centered), false)
  assert.equal(isFitView({ scale: 1, x: centered.x, y: centered.y - 5 }, centered), false)
  assert.equal(isFitView({ scale: 1.5, x: null, y: null }, centered), false)
  assert.equal(isFitView({ scale: 0.5, x: null, y: null }, centered), false)
  // 확대했다가 같은 배율로 돌아오며 생긴 미세한 오차는 맞춤으로 본다
  assert.equal(isFitView({ scale: 1.0004, x: centered.x + 0.4, y: centered.y - 0.4 }, centered), true)
})
