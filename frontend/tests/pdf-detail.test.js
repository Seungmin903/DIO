import test from 'node:test'
import assert from 'node:assert/strict'
import { DETAIL_MARGIN, normalizePdfSource, planPdfDetail } from '../src/diary/utils/pdfSource.js'
import { pdfDocPage } from '../src/diary/utils/pdfImport.js'
import { normalizeMyPapers } from '../src/diary/utils/myLibrary.js'

const source = { sourceId: 'abc-123', pageIndex: 2, edge: 3000 }
// 768 × 1024 캔버스에 꽉 찬 세로 쪽(기본 그림 긴 변 3000px → 논리 1 당 약 2.93px)
const object = { x: 0, y: 0, w: 768, h: 1024, rotation: 0, pdfSource: source }
const visible = { x: 100, y: 200, width: 200, height: 300 }

test('pdfSource 는 파일 이름으로 쓸 수 있는 id 와 쪽 번호만 받는다', () => {
  assert.deepEqual(normalizePdfSource({ sourceId: ' abc-123 ', pageIndex: 0, edge: 2999.6 }), { sourceId: 'abc-123', pageIndex: 0, edge: 3000 })
  assert.equal(normalizePdfSource({ sourceId: '../evil', pageIndex: 0 }), null)
  assert.equal(normalizePdfSource({ sourceId: 'a/b', pageIndex: 0 }), null)
  assert.equal(normalizePdfSource({ sourceId: 'a', pageIndex: -1 }), null)
  assert.equal(normalizePdfSource({ sourceId: 'a', pageIndex: 1.5 }), null)
  assert.equal(normalizePdfSource(null), null)
  assert.equal(normalizePdfSource({ sourceId: 'a', pageIndex: 0 }).edge, null)
})

test('기본 그림으로 충분한 배율에서는 영역 그림을 그리지 않는다', () => {
  // 논리 1 당 필요한 픽셀(zoom × 기기 비율)이 기본 그림 해상도(2.93)와 비슷하다(줄여 보는 폭이 1.25배 이내)
  assert.equal(planPdfDetail({ object, visible, zoom: 1.2, pixelRatio: 2, current: null }), null)
  assert.equal(planPdfDetail({ object, visible, zoom: 2.9, pixelRatio: 1, current: null }), null)
})

test('기본 그림을 많이 줄여 보는 화면(쪽 전체 보기)에서는 그 화면 해상도로 원본에서 바로 그린다', () => {
  const whole = { x: 0, y: 0, width: 768, height: 1024 }
  // 태블릿에서 한 쪽을 맞춰 보는 크기: 논리 1 당 1.4 픽셀 → 기본 그림(2.93)을 2배 넘게 줄인다
  const plan = planPdfDetail({ object, visible: whole, zoom: 0.7, pixelRatio: 2, current: null })
  assert.ok(plan && !plan.keep)
  assert.deepEqual(plan.rect, { x: 0, y: 0, width: 1, height: 1 })
  assert.equal(plan.density, 1.4)
  assert.equal(plan.outWidth, Math.round(768 * 1.4)); assert.equal(plan.outHeight, Math.round(1024 * 1.4))
  // 같은 배율이면 다시 그리지 않고, 배율이 크게 바뀌면(1.3배 넘게) 다시 그린다
  const current = { rect: plan.rect, density: plan.density }
  assert.deepEqual(planPdfDetail({ object, visible: whole, zoom: 0.7, pixelRatio: 2, current }), { keep: true })
  assert.deepEqual(planPdfDetail({ object, visible: whole, zoom: 0.75, pixelRatio: 2, current }), { keep: true })
  const smaller = planPdfDetail({ object, visible: whole, zoom: 0.4, pixelRatio: 2, current })
  assert.ok(smaller && !smaller.keep && smaller.density === 0.8)
})

test('확대하면 보이는 영역과 둘레 여백만 필요한 해상도로 그린다', () => {
  const plan = planPdfDetail({ object, visible, zoom: 4, pixelRatio: 2, current: null })
  assert.ok(plan && !plan.keep)
  // 보이는 영역 + 사방 여백(0.25배)이며 쪽 밖으로 나가지 않는다
  const left = (100 - 200 * DETAIL_MARGIN) / 768, top = (200 - 300 * DETAIL_MARGIN) / 1024
  assert.ok(Math.abs(plan.rect.x - left) < 1e-9 && Math.abs(plan.rect.y - top) < 1e-9)
  assert.ok(Math.abs(plan.rect.width - 300 / 768) < 1e-9 && Math.abs(plan.rect.height - 450 / 1024) < 1e-9)
  // 화면 해상도(8px/논리)까지 올리되 픽셀 예산 안이다
  assert.equal(plan.density, 8)
  assert.equal(plan.outWidth, 300 * 8); assert.equal(plan.outHeight, 450 * 8)
  assert.ok(plan.outWidth * plan.outHeight <= 9_000_000)
})

test('영역이 너무 크면 픽셀 예산에 맞춰 해상도를 낮추고, 낮춘 값이 기본 그림보다 나아야 그린다', () => {
  const wide = { x: 0, y: 0, width: 768, height: 1024 }
  const plan = planPdfDetail({ object, visible: wide, zoom: 8, pixelRatio: 2, current: null })
  assert.ok(plan.outWidth * plan.outHeight <= 9_000_000)
  assert.ok(plan.density < 16 && plan.density > 3000 / 1024)
  // 예산이 기본 그림 해상도 아래로 떨어지면 그리지 않는다
  assert.equal(planPdfDetail({ object, visible: wide, zoom: 8, pixelRatio: 2, current: null, budget: 1_000_000 }), null)
})

test('이미 덮고 있고 충분히 선명하면 그대로 두고, 가장자리에 다가오거나 더 확대하면 다시 그린다', () => {
  const first = planPdfDetail({ object, visible, zoom: 4, pixelRatio: 2, current: null })
  const current = { rect: first.rect, density: first.density }
  assert.deepEqual(planPdfDetail({ object, visible, zoom: 4, pixelRatio: 2, current }), { keep: true })
  // 조금 옮겨도 여유 안이면 그대로
  assert.deepEqual(planPdfDetail({ object, visible: { ...visible, x: visible.x + 20 }, zoom: 4, pixelRatio: 2, current }), { keep: true })
  // 가장자리 여유를 넘게 옮기면 새로 그린다
  const moved = planPdfDetail({ object, visible: { ...visible, x: visible.x + 60 }, zoom: 4, pixelRatio: 2, current })
  assert.ok(moved && !moved.keep)
  // 더 확대해 해상도가 모자라면 새로 그린다
  const zoomed = planPdfDetail({ object, visible: { x: 150, y: 250, width: 100, height: 150 }, zoom: 8, pixelRatio: 2, current })
  assert.ok(zoomed && !zoomed.keep && zoomed.density === 16)
})

test('회전했거나 쪽 밖을 보고 있거나 보이는 범위를 모르면 그리지 않는다', () => {
  assert.equal(planPdfDetail({ object: { ...object, rotation: 15 }, visible, zoom: 4, pixelRatio: 2 }), null)
  assert.equal(planPdfDetail({ object: { ...object, flipX: true }, visible, zoom: 4, pixelRatio: 2 }), null)
  assert.equal(planPdfDetail({ object, visible: { x: 2000, y: 2000, width: 100, height: 100 }, zoom: 4, pixelRatio: 2 }), null)
  assert.equal(planPdfDetail({ object, visible: null, zoom: 4, pixelRatio: 2 }), null)
  assert.equal(planPdfDetail({ object: { ...object, pdfSource: null }, visible, zoom: 4, pixelRatio: 2 }), null)
})

test('쪽이 작게 놓여 있으면 그 위의 영역만 그린다', () => {
  const small = { ...object, x: 200, y: 300, w: 300, h: 400 }
  const plan = planPdfDetail({ object: small, visible: { x: 0, y: 0, width: 768, height: 1024 }, zoom: 12, pixelRatio: 2, current: null })
  assert.ok(plan)
  assert.ok(plan.rect.x >= 0 && plan.rect.y >= 0 && plan.rect.x + plan.rect.width <= 1 + 1e-9 && plan.rect.y + plan.rect.height <= 1 + 1e-9)
})

test('PDF 쪽 문서 요소와 나의 속지는 원본 위치(pdfSource)를 이어 간다', () => {
  const page = { src: 'media:m1', mediaFileId: 'm1', aspect: 0.75, name: '문서 3쪽', pdfSource: source }
  const [image] = pdfDocPage(page, 'portrait', {}).objects
  assert.deepEqual(image.pdfSource, source)
  assert.equal('pdfSource' in pdfDocPage({ ...page, pdfSource: undefined }, 'portrait', {}).objects[0], false)
  const [paper] = normalizeMyPapers([{ id: 'p', name: '시험', orientation: 'portrait', pages: [page, { ...page, mediaFileId: 'm2', src: 'media:m2', pdfSource: { sourceId: '../x', pageIndex: 0 } }] }])
  assert.deepEqual(paper.pages[0].pdfSource, source)
  assert.equal('pdfSource' in paper.pages[1], false)
})
