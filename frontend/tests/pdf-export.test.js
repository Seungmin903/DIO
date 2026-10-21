import test from 'node:test'
import assert from 'node:assert/strict'
import UPNG from 'upng-js'
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { createPdfExportSnapshot, pdfSelectAllPolicy, PDF_LIMITS, A4_LANDSCAPE, A4_PORTRAIT } from '../src/editor/utils/pdfSnapshot.js'
import { opaquePdfPng } from '../src/editor/utils/pdfRaster.js'
import { generatePdf } from '../src/editor/utils/pdfGenerator.js'
import { generatePdf as generateWeb } from '../src/editor/utils/pdfExport.web.js'
import { registerHooks } from 'node:module'

const document = (n = 3) => ({ title: '테스트 / 다이어리', pages: Array.from({ length: n }, (_, i) => ({ id: String(i + 1), objects: [] })) })
const options = { scope: 'pages', selectedPageIds: ['3', '1'], width: 10, height: 8, now: new Date('2026-10-20T10:00:00+09:00') }
const snapshot = (doc = document(), extra = {}) => createPdfExportSnapshot(doc, { ...options, ...extra })
function image(page, color = [255,0,0,255]) {
  const bytes = new Uint8Array(page.pixelWidth * page.pixelHeight * 4)
  for (let i = 0; i < bytes.length; i += 4) bytes.set(color, i)
  return new Uint8Array(UPNG.encode([bytes.buffer], page.pixelWidth, page.pixelHeight, 0))
}
const io = { readImage: async (result) => result.bytes, createResult: async (bytes) => ({ bytes, dispose() {} }) }
const wait = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }

test('current/pages/range를 검증하고 문서 순서·파일명·깊은 스냅샷을 고정한다', () => {
  const doc = document()
  const s = snapshot(doc)
  doc.pages[0].objects.push({ type: 'text' })
  assert.deepEqual(s.pages.map((p) => p.documentPageNumber), [1,3])
  assert.equal(s.pages[0].objects.length, 0)
  assert.match(s.fileName, /_selected02_.*\.pdf$/)
  assert.match(snapshot(document(), { scope: 'current', currentPageId: '2' }).fileName, /_p02_/)
  assert.match(snapshot(document(), { scope: 'range', range: { start: 2, end: 3 } }).fileName, /_p02-p03_/)
  assert.match(snapshot(document(), { selectedPageIds: ['3','2','1'] }).fileName, /_all_/)
  for (const patch of [{ scope: 'all' },{ scope: 'current', currentPageId: 'x' },{ selectedPageIds: [] },{ selectedPageIds: ['1','1'] },{ selectedPageIds: ['x'] },{ scope: 'range', range: { start: 3, end: 2 } },{ scope: 'range', range: { start: 1.5, end: 2 } },{ scope: 'range', range: { start: 1, end: 4 } }]) assert.throws(() => snapshot(document(), patch), { code: 'EXPORT_PDF_INPUT_INVALID' })
})

test('21장 문서의 전체 선택은 막고 일부 선택은 허용하며 픽셀 예산도 적용한다', () => {
  const doc = document(21)
  assert.equal(pdfSelectAllPolicy(doc, { width: 10, height: 8 }).enabled, false)
  assert.equal(snapshot(doc).pages.length, 2)
  assert.throws(() => snapshot(doc, { selectedPageIds: doc.pages.map((p) => p.id) }), { code: 'EXPORT_PDF_LIMIT_EXCEEDED' })
  assert.equal(pdfSelectAllPolicy(document(20), { width: 1188, height: 840 }).enabled, true)
  assert.equal(pdfSelectAllPolicy(document(20), { width: 1280, height: 800 }).enabled, false)
  assert.equal(pdfSelectAllPolicy(document(19), { width: 1280, height: 800 }).enabled, true)
  // 안내용 최대 면 수는 픽셀 예산을 반영한 실제 값이다.
  assert.equal(pdfSelectAllPolicy(document(19), { width: 1280, height: 800 }).maxPages, 19)
  assert.equal(pdfSelectAllPolicy(document(20), { width: 1280, height: 800 }).maxPages, 19)
  assert.equal(pdfSelectAllPolicy(document(20), { width: 1188, height: 840 }).maxPages, 20)
  assert.throws(() => snapshot(document(20), { selectedPageIds: document(20).pages.map((p) => p.id), width: 1280, height: 800 }), { code: 'EXPORT_PDF_LIMIT_EXCEEDED' })
})

test('반투명 PNG를 배경에 합성하고 실제 RGB PNG로 변환한다', () => {
  const page = snapshot().pages[0]
  const png = opaquePdfPng(image(page, [255,0,0,128]), page)
  assert.equal(png[25], 2)
  const result = new Uint8Array(UPNG.toRGBA8(UPNG.decode(png.buffer))[0])
  assert.deepEqual([...result.slice(0,4)], [255,127,127,255])
  assert.throws(() => opaquePdfPng(new Uint8Array(64), page), { code: 'EXPORT_PDF_RASTER_INVALID' })
  assert.throws(() => opaquePdfPng(image(page), { ...page, pixelWidth: 1 }), { code: 'EXPORT_PDF_RASTER_INVALID' })
})

test('실제 PDF의 면 수·A4·RGB·그림 순서·메타데이터와 페이지별 즉시 해제를 확인한다', async () => {
  const s = snapshot(), events = []
  let disposed = 0
  const result = await generatePdf(s, { ...io, onProgress: (e) => events.push(e), renderPageImage: async (page) => {
    assert.equal(disposed, page.documentPageNumber === 1 ? 0 : 1)
    return { bytes: image(page, page.documentPageNumber === 1 ? [255,0,0,255] : [0,0,255,255]), dispose: () => disposed++ }
  } })
  assert.equal(disposed, 2)
  const pdf = await PDFDocument.load(result.bytes, { updateMetadata: false })
  assert.equal(pdf.getPageCount(), 2)
  assert.equal(pdf.getTitle(), s.title); assert.equal(pdf.getAuthor(), '')
  assert.equal(pdf.getCreator(), 'DIO'); assert.equal(pdf.getProducer(), 'DIO')
  assert.equal(pdf.getCreationDate().toISOString(), s.createdAt)
  assert.equal(pdf.getModificationDate().toISOString(), s.createdAt)
  const pixels = []
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - A4_LANDSCAPE[0]) < .001)
    assert.ok(Math.abs(page.getHeight() - A4_LANDSCAPE[1]) < .001)
    const xobjects = page.node.Resources().lookup(PDFName.of('XObject'))
    const stream = xobjects.lookup(xobjects.keys()[0], PDFRawStream)
    assert.equal(stream.dict.get(PDFName.of('SMask')), undefined)
    assert.equal(stream.dict.get(PDFName.of('ColorSpace')).toString(), '/DeviceRGB')
    pixels.push([...decodePDFRawStream(stream).decode().slice(0,3)])
  }
  assert.deepEqual(pixels, [[255,0,0],[0,0,255]])
  assert.equal(events.at(-1).completedPages, 2)
  result.dispose(); result.dispose()
})

test('세로형과 혼합 PDF는 각 페이지 방향에 맞는 A4 용지와 결과 정보를 사용한다', async () => {
  for (const sizes of [[[8, 10]], [[10, 8], [8, 10]]]) {
    const doc = { pages: sizes.map(([canvasWidth, canvasHeight], index) => ({ id: String(index), canvasWidth, canvasHeight, objects: [] })) }
    const s = snapshot(doc, { selectedPageIds: doc.pages.map(page => page.id) })
    const result = await generatePdf(s, { ...io, renderPageImage: async page => ({ bytes: image(page), dispose() {} }) })
    try {
      assert.equal(result.paperOrientation, sizes.length === 1 ? 'portrait' : 'mixed')
      const pdf = await PDFDocument.load(result.bytes)
      pdf.getPages().forEach((page, index) => {
        const expected = sizes[index][1] > sizes[index][0] ? A4_PORTRAIT : A4_LANDSCAPE
        assert.ok(Math.abs(page.getWidth() - expected[0]) < .001)
        assert.ok(Math.abs(page.getHeight() - expected[1]) < .001)
      })
    } finally { result.dispose() }
  }
})

test('20개의 빈 페이지도 생략하지 않고 PDF 한 파일로 만든다', async () => {
  const doc = document(20), s = snapshot(doc, { selectedPageIds: doc.pages.map((p) => p.id) })
  const result = await generatePdf(s, { ...io, renderPageImage: async (p) => ({ bytes: image(p), dispose() {} }) })
  assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 20)
  result.dispose()
})

test('중간 페이지 실패는 문서 페이지 번호를 보존하고 부분 파일을 만들지 않는다', async () => {
  let disposed = 0, outputs = 0
  await assert.rejects(generatePdf(snapshot(), { ...io, createResult: async () => { outputs++; }, renderPageImage: async (p) => {
    if (p.documentPageNumber === 3) throw Object.assign(new Error('missing'), { code: 'EXPORT_MEDIA_FAILED' })
    return { bytes: image(p), dispose: () => disposed++ }
  } }), (e) => e.code === 'EXPORT_MEDIA_FAILED' && e.documentPageNumber === 3 && e.phase === 'rendering')
  assert.equal(disposed, 1); assert.equal(outputs, 0)
})

test('이미지 바이트 읽기 실패에도 캡처를 해제한다', async () => {
  let disposed = 0
  await assert.rejects(generatePdf(snapshot(), { ...io, readImage: async () => { throw new Error('read') }, renderPageImage: async () => ({ dispose: () => disposed++ }) }), { code: 'EXPORT_PDF_ASSEMBLY_FAILED' })
  assert.equal(disposed, 1)
})

test('취소 중 늦게 도착한 캡처와 PDF 파일은 해제하고 반환하지 않는다', async () => {
  const controller = new AbortController(), entered = wait(), late = wait()
  let disposed = 0
  const pending = generatePdf(snapshot(), { ...io, signal: controller.signal, renderPageImage: async () => { entered.resolve(); return late.promise } })
  await entered.promise
  const checked = assert.rejects(pending, { code: 'EXPORT_CANCELLED' })
  controller.abort(); await checked
  late.resolve({ dispose: () => disposed++ }); await new Promise((r) => setImmediate(r))
  assert.equal(disposed, 1)
  const final = wait(), started = wait(), c = new AbortController()
  let removed = 0
  const run = generatePdf(snapshot(document(1), { selectedPageIds: ['1'] }), { ...io, signal: c.signal, renderPageImage: async (p) => ({ bytes: image(p), dispose() {} }), createResult: async () => { started.resolve(); return final.promise } })
  await started.promise
  const rejected = assert.rejects(run, { code: 'EXPORT_CANCELLED' }); c.abort(); await rejected
  final.resolve({ dispose: () => removed++ }); await new Promise((r) => setImmediate(r)); assert.equal(removed, 1)
})

test('전체 생성 제한 시간이 지나면 중단하고 늦은 결과를 정리한다', async () => {
  const late = wait(); let disposed = 0, entered = false
  // 면 사이 양보 뒤 렌더가 시작되도록 제한 시간에 여유를 둔다.
  await assert.rejects(generatePdf(snapshot(), { ...io, timeoutMs: 50, renderPageImage: () => { entered = true; return late.promise } }), { code: 'EXPORT_PDF_TIMEOUT' })
  assert.equal(entered, true)
  late.resolve({ dispose: () => disposed++ }); await new Promise((r) => setImmediate(r)); assert.equal(disposed, 1)
})

test('웹 실제 Blob 결과는 PDF MIME·크기를 유지하고 URL을 한 번만 해제한다', async () => {
  const result = await generateWeb(snapshot(), { renderPageImage: async (p) => ({ blob: new Blob([image(p)]), dispose() {} }) })
  assert.equal(result.blob.type, 'application/pdf')
  assert.equal(result.byteLength, result.blob.size)
  assert.equal((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount(), 2)
  result.dispose(); result.dispose()
})

test('네이티브 File 입출력은 PDF 캐시만 쓰고 실패/종료 시 정리한다', async (t) => {
  const files = new Map(); let fail = false
  class File {
    constructor(...parts) { this.uri = parts.join('/') }
    get exists() { return files.has(this.uri) }
    get size() { return files.get(this.uri)?.length ?? 0 }
    create() { files.set(this.uri, new Uint8Array()) }
    write(bytes) { if (fail) throw new Error('disk full'); files.set(this.uri, bytes) }
    bytes() { return Promise.resolve(files.get(this.uri)) }
    delete() { files.delete(this.uri) }
  }
  globalThis.__pdfIo = { File, Paths: { cache: 'file:///cache' } }
  const hooks = registerHooks({ resolve(s,c,next) { return ['expo-file-system','expo-crypto'].includes(s) ? { url: 'pdfmock:'+s, shortCircuit: true } : next(s,c) }, load(u,c,next) { if (u==='pdfmock:expo-file-system') return { format:'module',source:'export const {File,Paths}=globalThis.__pdfIo',shortCircuit:true }; if(u==='pdfmock:expo-crypto') return {format:'module',source:'export const randomUUID=()=>"test"',shortCircuit:true};return next(u,c) } })
  t.after(() => { hooks.deregister(); delete globalThis.__pdfIo })
  const native = await import('../src/editor/utils/pdfExport.native.js')
  files.set('file:///original.png', new Uint8Array([1,2,3]))
  assert.deepEqual(await native.readPdfImage({ uri:'file:///original.png' }), new Uint8Array([1,2,3]))
  const result = await native.createPdfResult(new Uint8Array([4,5])); assert.ok(result.uri.endsWith('.pdf')); result.dispose()
  assert.equal(files.size, 1)
  fail = true
  await assert.rejects(native.createPdfResult(new Uint8Array([1])), /disk full/)
  assert.equal(files.size, 1)
})
