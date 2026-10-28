// 실행: node qa/stroke-curve-integrity.mjs <검증 산출물 폴더>
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { createStroke } from '../src/editor/utils/strokes.js'
import { strokeInkLayers, inkLevels } from '../src/editor/utils/penInk.js'
import { feltStrokeLayers, FELT_LAYERS } from '../src/editor/utils/feltStroke.js'
import { feltMaterialLayers, FELT_MATERIAL_OPACITIES } from '../src/editor/utils/penMaterials.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { createPageImageRenderer } from '../src/editor/utils/pageImageRenderer.js'
import { createPdfExportSnapshot } from '../src/editor/utils/pdfSnapshot.js'
import { generatePdf } from '../src/editor/utils/pdfGenerator.js'
import { opaquePdfRgb } from '../src/editor/utils/pdfRaster.js'

assert.ok(process.argv[2], '산출물 폴더를 지정하세요')
const out = resolve(process.argv[2]); await mkdir(out, { recursive: true })
const paths = {
  corner: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }],
  circle: Array.from({ length: 9 }, (_, i) => ({ x: 100 + 6 * Math.cos(i * Math.PI / 4), y: 100 + 6 * Math.sin(i * Math.PI / 4) })),
  uneven: [{ x: 30, y: 30 }, { x: 30, y: 30 }, { x: 34, y: 180 }, { x: 260, y: 180 }],
}
const pages = []
for (const [kind, renderVersion] of [['fountain', 2], ['fountain', 3], ['brush', 2], ['felt', 2], ['felt', 3]]) for (const [name, points] of Object.entries(paths)) {
  const object = createStroke(points, { id: `${kind}-v${renderVersion}-${name}`, kind, width: 1, renderVersion, materialSeed: 101 })
  // 회전·비등방 리사이즈와 JSON 저장 복원까지 동일한 좌표계를 쓴다.
  object.rotation = 30; object.w *= 1.4; object.h *= 0.8
  pages.push({ id: object.id, canvasWidth: 512, canvasHeight: 512, objects: [object] })
}
const doc = JSON.parse(JSON.stringify({ id: 'curve-qa', pages }))
const before = JSON.stringify(doc), bounds = []
const browser = await chromium.launch({ headless: true, timeout: 15000 })
try {
  const tab = await browser.newPage()
  async function render(snapshot) {
    const object = snapshot.objects[0], parts = [{ points: object.points }]
    const felt = object.penKind === 'felt'
    const paths = felt ? object.renderVersion === 3 ? feltMaterialLayers(parts, object.strokeWidth, object.materialSeed)
      : feltStrokeLayers(parts, object.strokeWidth) : strokeInkLayers(parts, object.strokeWidth, object.penKind, object.renderVersion)
    const levels = felt ? [] : inkLevels(object.penKind, object.renderVersion)
    const alpha = felt ? object.renderVersion === 3 ? FELT_MATERIAL_OPACITIES : FELT_LAYERS.map(v => v.opacity)
      : levels.map((v, i) => i ? (v - levels[i - 1]) / (1 - levels[i - 1]) : v)
    const d = paths.join(''), markup = paths.map((d, i) => `<path d="${d}" fill="${object.color}" fill-rule="nonzero" fill-opacity="${alpha[i]}"/>`).join('')
    const xml = clipped => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#FFFFFF"/><g transform="rotate(${object.rotation} ${object.x + object.w / 2} ${object.y + object.h / 2})"><svg x="${object.x}" y="${object.y}" width="${object.w}" height="${object.h}" viewBox="0 0 ${object.baseWidth} ${object.baseHeight}" preserveAspectRatio="none" overflow="${clipped ? 'hidden' : 'visible'}">${markup}</svg></g></svg>`
    const result = await tab.evaluate(async ({ actual, expected, width, height, d, object }) => {
      document.body.innerHTML = `<svg><path d="${d}"/></svg>`
      const b = document.querySelector('path').getBBox()
      async function raster(svg) {
        const image = new Image(), uri = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
        try {
          image.src = uri; await image.decode()
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
          const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, width, height)
          return { png: canvas.toDataURL('image/png').split(',')[1], pixels: context.getImageData(0, 0, width, height).data }
        } finally { URL.revokeObjectURL(uri) }
      }
      const a = await raster(actual), e = await raster(expected)
      let maxDifference = 0, changedChannels = 0, interiorDifference = 0, inkPixels = 0
      const angle = object.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
      const cx = object.x + object.w / 2, cy = object.y + object.h / 2
      for (let i = 0; i < a.pixels.length; i++) {
        const diff = Math.abs(a.pixels[i] - e.pixels[i]); maxDifference = Math.max(maxDifference, diff)
        if (diff) {
          changedChannels++
          // 중첩 SVG의 viewport clip은 회전 시 경계 AA를 한 번 더 적용한다.
          // 1.5 출력 픽셀 경계띠만 구분하고 내부/바깥 곡선 누락은 그대로 실패시킨다.
          const pixel = Math.floor(i / 4), x = (pixel % width + 0.5) * 512 / width, y = (Math.floor(pixel / width) + 0.5) * 512 / height
          const ux = cx + cos * (x - cx) + sin * (y - cy), uy = cy - sin * (x - cx) + cos * (y - cy)
          const edge = Math.min(Math.abs(ux - object.x), Math.abs(ux - object.x - object.w), Math.abs(uy - object.y), Math.abs(uy - object.y - object.h)) * width / 512
          if (edge > 1.5) interiorDifference = Math.max(interiorDifference, diff)
        }
        if (i % 4 !== 3 && a.pixels[i] < 240) inkPixels++
      }
      return { png: a.png, bounds: { x: b.x, y: b.y, width: b.width, height: b.height }, maxDifference, changedChannels, interiorDifference, inkPixels }
    }, { actual: xml(true), expected: xml(false), width: snapshot.pixelWidth, height: snapshot.pixelHeight, d, object })
    const b = result.bounds
    assert.ok(b.x >= -1e-6 && b.y >= -1e-6 && b.x + b.width <= object.baseWidth + 1e-5 && b.y + b.height <= object.baseHeight + 1e-5, `${object.id}: SVG 경계`)
    // overflow clip 유무에 따른 래스터 AA 차이는 다중 반투명 재질 합성의 채널당 최대 16/255만 허용한다.
    // 경계의 1.5px 띠 밖에 본체가 누락되는 회귀는 SVG bounds 검사와 함께 차단한다.
    assert.ok(result.interiorDifference <= 16, `${object.id}: 기준 이미지의 내부 채널 차이 ${result.interiorDifference}`)
    assert.ok(result.inkPixels > 0)
    bounds.push({ id: object.id, pixelWidth: snapshot.pixelWidth, bounds: b, changedChannels: result.changedChannels, interiorDifference: result.interiorDifference, boundaryMaxDifference: result.maxDifference })
    return { bytes: new Uint8Array(Buffer.from(result.png, 'base64')), dispose() {} }
  }
  const renderer = createPageImageRenderer({ prepare: snapshot => prepareExportSnapshot(snapshot, null), render })
  for (const page of doc.pages) {
    const png = await renderer.renderPageImage(createExportSnapshot(page))
    await writeFile(resolve(out, `${page.id}.png`), png.bytes); png.dispose()
  }
  const snapshot = createPdfExportSnapshot(doc, { scope: 'pages', selectedPageIds: doc.pages.map(p => p.id), width: 512, height: 512 })
  const expectedRgb = []
  const pdf = await generatePdf(snapshot, {
    renderPageImage: async page => { const result = await renderer.renderPageImage(page); expectedRgb.push(opaquePdfRgb(result.bytes, page).rgb); return result },
    readImage: async result => result.bytes, createResult: async bytes => ({ bytes, dispose() {} }),
  })
  const parsed = await PDFDocument.load(pdf.bytes)
  assert.equal(parsed.getPageCount(), doc.pages.length)
  parsed.getPages().forEach((page, i) => {
    const images = page.node.Resources().lookup(PDFName.of('XObject'))
    const stream = images.lookup(images.keys()[0], PDFRawStream)
    assert.ok(Buffer.from(decodePDFRawStream(stream).decode()).equals(Buffer.from(expectedRgb[i])), `PDF ${i + 1}: PNG RGB 픽셀 보존`)
  })
  await writeFile(resolve(out, 'stroke-curves.pdf'), pdf.bytes); pdf.dispose()
  assert.equal(JSON.stringify(doc), before)
  await writeFile(resolve(out, 'result.json'), JSON.stringify({ passed: true, pngCases: doc.pages.length, pdfPages: doc.pages.length, originalDocumentUnchanged: true, interiorChannelTolerance: 16, boundaryAntialiasBandPixels: 1.5, bounds }, null, 2))
  console.log(JSON.stringify({ passed: true, pngCases: doc.pages.length, pdfPages: doc.pages.length, interiorChannelTolerance: 16, boundaryAntialiasBandPixels: 1.5 }))
} finally { await browser.close() }
