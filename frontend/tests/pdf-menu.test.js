import test from 'node:test'
import assert from 'node:assert/strict'
import { createMenuPdfSnapshot, menuPdfPolicy, pdfMenuFailure } from '../src/editor/utils/pdfMenu.js'
import { pageImageQuality } from '../src/editor/utils/pageImageQuality.js'
const dimensions = {
  width: 1280,
  height: 800
}
const doc = {
  title: '기록',
  pages: [{
    id: 'a',
    objects: []
  }, {
    id: 'b',
    objects: []
  }, {
    id: 'c',
    objects: []
  }]
}
const now = new Date('2026-10-20T05:00:00Z')
test('menu connects current, picked and range selections to PDF snapshots in document order', () => {
  const current = createMenuPdfSnapshot(doc, {
    mode: 'current',
    currentId: 'b'
  }, {
    ...dimensions,
    now
  })
  assert.equal(current.scope, 'current')
  assert.equal(current.pages[0].documentPageNumber, 2)
  assert.equal(current.pages[0].pixelWidth, 2560)
  const picked = createMenuPdfSnapshot(doc, {
    mode: 'pages',
    selectedIds: ['c', 'a']
  }, {
    ...dimensions,
    now
  })
  assert.deepEqual(picked.pages.map(p => p.documentPageNumber), [1, 3])
  const range = createMenuPdfSnapshot(doc, {
    mode: 'range',
    from: '2',
    to: '3'
  }, {
    ...dimensions,
    now
  })
  assert.deepEqual(range.pages.map(p => p.documentPageNumber), [2, 3])
  assert.match(range.fileName, /_p02-p03_/)
  doc.title = '수정'
  doc.pages.reverse()
  assert.deepEqual(range.pages.map(p => p.documentPageNumber), [2, 3])
  assert.equal(range.title, '기록')
})
test('actual 2x canvas allows 19 pages and disables selecting all of 20', () => {
  const many = {
    pages: Array.from({
      length: 20
    }, (_, i) => ({
      id: String(i),
      objects: []
    }))
  }
  const policy = menuPdfPolicy(many, dimensions)
  assert.equal(policy.maxPages, 19)
  assert.equal(policy.enabled, false)
  assert.throws(() => createMenuPdfSnapshot(many, {
    mode: 'pages',
    selectedIds: many.pages.map(p => p.id)
  }, dimensions), {
    code: 'EXPORT_PDF_LIMIT_EXCEEDED'
  })
  assert.equal(menuPdfPolicy({
    pages: many.pages.slice(0, 19)
  }, dimensions).enabled, true)
})
test('cancel is distinct from partial-page failure and retains document page number', () => {
  assert.deepEqual(pdfMenuFailure({
    code: 'EXPORT_CANCELLED'
  }), {
    status: 'cancelled'
  })
  const failure = pdfMenuFailure({
    message: '이미지 오류',
    documentPageNumber: 7
  })
  assert.equal(failure.status, 'error')
  assert.match(failure.message, /7페이지/)
})
test('native quality diagnostics warn on insufficient physical pixels, web stays requested size', () => {
  const page = {
    width: 1280,
    height: 800,
    pixelWidth: 2560,
    pixelHeight: 1600
  }
  const native = pageImageQuality(page, {
    platform: 'android',
    scale: 0.5,
    pixelRatio: 2
  })
  assert.equal(native.upscaled, true)
  assert.equal(native.physicalWidth, 1280)
  assert.equal(pageImageQuality(page, {
    platform: 'ios',
    scale: 1,
    pixelRatio: 2
  }).upscaled, false)
  assert.equal(pageImageQuality(page, {
    platform: 'web',
    scale: 1,
    pixelRatio: 1
  }).upscaled, false)
})
