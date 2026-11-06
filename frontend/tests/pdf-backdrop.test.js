import test from 'node:test'
import assert from 'node:assert/strict'
import { pdfDocPage, pdfPageCanvasSize, withPdfPages } from '../src/diary/utils/pdfImport.js'
import { fitBackdropToPage, isBackdrop, keepBackdropBottom } from '../src/editor/utils/backdrop.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'
import { lassoHitIds } from '../src/editor/utils/lassoGeometry.js'
import { createDefaultDoc } from '../src/editor/state/defaultDoc.js'
import { editorReducer, createInitialState } from '../src/editor/state/editorReducer.js'

const page = (aspect, n = 1) => ({ src: `media:m${n}`, mediaFileId: `m${n}`, aspect, name: `문서 ${n}쪽` })

test('PDF 쪽의 페이지 크기는 쪽 비율을 따르고 긴 변은 1024다', () => {
  assert.deepEqual(pdfPageCanvasSize(0.75, 'landscape'), { width: 768, height: 1024 })
  assert.deepEqual(pdfPageCanvasSize(595 / 842, 'portrait'), { width: 724, height: 1024 })
  assert.deepEqual(pdfPageCanvasSize(842 / 595, 'portrait'), { width: 1024, height: 724 })
  assert.deepEqual(pdfPageCanvasSize(1, 'portrait'), { width: 1024, height: 1024 })
  // 너무 길쭉한 쪽은 3 : 1 까지만 따른다
  assert.deepEqual(pdfPageCanvasSize(0.1, 'portrait'), { width: 341, height: 1024 })
  assert.deepEqual(pdfPageCanvasSize(10, 'portrait'), { width: 1024, height: 341 })
  assert.deepEqual(pdfPageCanvasSize(0, 'portrait'), { width: 768, height: 1024 })
})

test('PDF 쪽은 페이지를 꽉 채우는 바탕 요소 하나이고, 비율이 다른 쪽도 각자 크기를 가진다', () => {
  const a4 = pdfDocPage(page(595 / 842), 'portrait', {})
  const [image] = a4.objects
  assert.equal(isBackdrop(image), true); assert.equal(image.locked, true)
  assert.deepEqual([image.x, image.y, Math.round(image.w), Math.round(image.h)], [0, 0, a4.canvasWidth, a4.canvasHeight])
  const doc = withPdfPages(createDefaultDoc({ title: '시험', pageSize: 'portrait' }), [page(0.7, 1), page(1.5, 2)], 'portrait', {})
  assert.deepEqual(doc.pages.map(p => [p.canvasWidth, p.canvasHeight]), [[717, 1024], [1024, 683]])
})

test('기존 PDF 바탕은 현재 페이지 영역에 맞추고 저장된 좌표와 일반 스티커는 유지한다', () => {
  const background = { ...pdfDocPage(page(0.75), 'portrait', {}).objects[0], x: 10, y: 20, w: 384, h: 512 }
  const sticker = { ...background, id: 'regular', backdrop: false }
  const resized = { id: 'page', canvasWidth: 1000, canvasHeight: 800, objects: [background, sticker] }
  const fit = fitBackdropToPage(background, resized.canvasWidth, resized.canvasHeight)
  assert.deepEqual([fit.x, fit.y, fit.w, fit.h], [200, 0, 600, 800])
  assert.equal(fitBackdropToPage(fit, 1000, 800), fit)
  assert.equal(fitBackdropToPage(sticker, 1000, 800), sticker)
  assert.deepEqual(createExportSnapshot(resized).objects, [fit, sticker])
  assert.deepEqual([background.x, background.y, background.w, background.h], [10, 20, 384, 512])
})

test('바탕 요소는 항상 맨 아래에 있고, 그 아래로 다른 요소가 내려가지 않는다', () => {
  const back = { id: 'bg', backdrop: true }, a = { id: 'a' }, b = { id: 'b' }
  const ordered = [back, a, b]
  assert.equal(keepBackdropBottom(ordered), ordered, '이미 맞으면 같은 배열을 돌려준다')
  assert.deepEqual(keepBackdropBottom([a, back, b]).map(o => o.id), ['bg', 'a', 'b'])
  assert.equal(keepBackdropBottom([a, b]).length, 2)
})

test('바탕 요소는 올가미 · 전체 선택 대상이 아니다', () => {
  const doc = createDefaultDoc({ title: '시험', pageSize: 'portrait' })
  const withPdf = withPdfPages(doc, [page(0.75)], 'portrait', {})
  const pdfPage = withPdf.pages[0]
  const text = { id: 't', type: 'text', x: 100, y: 100, w: 100, h: 40, rotation: 0 }
  pdfPage.objects.push(text)
  assert.deepEqual(lassoHitIds(pdfPage.objects, [{ x: 0, y: 0 }, { x: 760, y: 0 }, { x: 760, y: 1000 }, { x: 0, y: 1000 }]), ['t'])
  const state = { ...createInitialState(withPdf), selectedIds: [] }
  const all = editorReducer(state, { type: 'selectAll' })
  assert.deepEqual(all.selectedIds, ['t'])
  // 맨 뒤로 보내도 바탕 아래로 내려가지 않는다
  const back = editorReducer(editorReducer(state, { type: 'select', ids: ['t'] }), { type: 'reorder', ids: ['t'], mode: 'back' })
  assert.equal(back.doc.pages[0].objects[0].backdrop, true)
})
