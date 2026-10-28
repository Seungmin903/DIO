// 실행: node qa/study-planner-integrity.mjs <검증 산출물 폴더>
// 브라우저 SVG 래스터와 실제 PDF 이미지 스트림으로 기록색 보존을 확인한다.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'
import { normalizePlanner, studyPlannerId, plannerBaseSvg, plannerOverlaySvg } from '../src/editor/templates/studyPlanner.js'
import { colorTemplateXml } from '../src/editor/templates/appearance.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { createPdfExportSnapshot } from '../src/editor/utils/pdfSnapshot.js'
import { createPageImageRenderer } from '../src/editor/utils/pageImageRenderer.js'
import { generatePdf } from '../src/editor/utils/pdfGenerator.js'
import { opaquePdfRgb } from '../src/editor/utils/pdfRaster.js'

assert.ok(process.argv[2], '산출물 폴더를 지정하세요')
const out = resolve(process.argv[2])
await mkdir(out, { recursive: true })
console.log('브라우저 시작')
const browser = await chromium.launch({ headless: true, timeout: 15000 })
console.log('브라우저 준비')
const tab = await browser.newPage()
const results = []
try {
  async function raster(xml, width, height) {
    const base64 = await tab.evaluate(async ({ xml, width, height }) => {
      const image = new Image(), uri = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }))
      try {
        image.src = uri; await image.decode()
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(image, 0, 0, width, height)
        return canvas.toDataURL('image/png').split(',')[1]
      } finally { URL.revokeObjectURL(uri) }
    }, { xml, width, height })
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  for (const orientation of ['landscape', 'portrait']) {
    console.log(`${orientation}: 래스터 비교 시작`)
    const colors = ['#292929', '#666666', '#AEB3B8', '#BFC1C4', '#D7D9DC', '#E8E9EB', '#FFE066']
    const paperAppearance = { backgroundColor: '#FFF8E7', layoutColor: '#33476B' }
    const planner = normalizePlanner({ cells: Object.fromEntries(colors.map((c, i) => [`${i},0`, c])), checks: { 0: colors[0] }, bands: { 1: colors[1] }, day: { i: 2, color: colors[2], hl: false }, mood: { hearts: colors.slice(0, 5).map(color => ({ color, hl: false })) }, options: { startHour: 7 } })
    const original = { id: 'original', backgroundAssetId: studyPlannerId(orientation), templateVersion: '1.0.0', canvasWidth: orientation === 'portrait' ? 768 : 1024, canvasHeight: orientation === 'portrait' ? 1024 : 768, objects: [], planner, paperAppearance }
    const duplicated = editorReducer(createInitialState({ id: 'qa', pages: [original] }), { type: 'duplicatePage' })
    const redone = editorReducer(editorReducer(duplicated, { type: 'undo' }), { type: 'redo' })
    // 재시작 뒤 JSON 문서를 사용하는 출력 입력. 실제 저장 서비스 회귀는 unit test에서 검증한다.
    const doc = JSON.parse(JSON.stringify(redone.doc)), copy = doc.pages[1]
    assert.deepEqual(copy.planner, planner)
    // 기준 이미지는 기록 도형을 원색으로 두고 자동 글자 그룹만 별도로 배색한다.
    // data-preserve-paint 표식에 의존하지 않아 표식 누락도 픽셀 차이로 검출한다.
    const expectedOverlay = plannerOverlaySvg(orientation, planner).replace(/^<svg[^>]*>/, '').replace(/<g\b[^>]*>/g, tag => colorTemplateXml(tag, paperAppearance))
    const expectedXml = colorTemplateXml(plannerBaseSvg(orientation, 7), paperAppearance).replace('</svg>', expectedOverlay)
    const renderer = createPageImageRenderer({
      prepare: snapshot => prepareExportSnapshot(snapshot, null, () => { throw Error('내장 속지') }),
      render: async prepared => {
        const bytes = await raster(prepared.backgroundXml, prepared.pixelWidth, prepared.pixelHeight)
        const expected = await raster(expectedXml, prepared.pixelWidth, prepared.pixelHeight)
        assert.ok(Buffer.from(bytes).equals(Buffer.from(expected)), `${orientation}: 속지와 원색 기록을 따로 합성한 기준 이미지와 일치`)
        return { bytes, dispose() {} }
      },
    })
    const png = await renderer.renderPageImage(createExportSnapshot(copy))
    await writeFile(resolve(out, `${orientation}.png`), png.bytes)
    png.dispose()
    const snapshot = createPdfExportSnapshot(doc, { scope: 'current', currentPageId: copy.id, width: copy.canvasWidth, height: copy.canvasHeight })
    let pdfPng
    const pdf = await generatePdf(snapshot, {
      renderPageImage: async page => { const result = await renderer.renderPageImage(page); pdfPng = result.bytes; return result },
      readImage: async result => result.bytes,
      createResult: async bytes => ({ bytes, dispose() {} }),
    })
    await writeFile(resolve(out, `${orientation}.pdf`), pdf.bytes)
    const parsed = await PDFDocument.load(pdf.bytes)
    assert.equal(parsed.getPageCount(), 1)
    const xobjects = parsed.getPage(0).node.Resources().lookup(PDFName.of('XObject'))
    const stream = xobjects.lookup(xobjects.keys()[0], PDFRawStream)
    const rgb = decodePDFRawStream(stream).decode()
    assert.ok(Buffer.from(rgb).equals(Buffer.from(opaquePdfRgb(pdfPng, snapshot.pages[0]).rgb)), '실제 PDF의 내장 픽셀도 PNG 원색과 일치')
    pdf.dispose()
    results.push({ orientation, png: true, pdf: true, copyUndoRedoRestore: true, reservedGrayColors: 6 })
  }
  await writeFile(resolve(out, 'raster-results.json'), JSON.stringify({ passed: true, results }, null, 2))
  console.log(JSON.stringify({ passed: true, results, out }, null, 2))
} finally { await browser.close() }
