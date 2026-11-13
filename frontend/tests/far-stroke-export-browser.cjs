// 전용 QA Metro 서버만 이용한다. node tests/far-stroke-export-browser.cjs [http://127.0.0.1:8095]
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const UPNG = require('upng-js')
const { PDFDocument, PDFName, decodePDFRawStream } = require('pdf-lib')
const out = path.resolve(__dirname, '../.expo/far-stroke-export')
const base = new URL(process.argv[2] || 'http://127.0.0.1:8095')
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw Error('Use a dedicated loopback QA server')
;(async () => {
  const browserServer = await chromium.launchServer({ channel: 'msedge', headless: true })
  const browser = await chromium.connect(browserServer.wsEndpoint())
  const report = {results: [], error: null}
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/far-stroke-qa.html*', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"><div id="root"></div><script src="/tests/fixtures/far-stroke-export.entry.bundle?platform=web&dev=true&hot=false"></script></body></html>' }))
    for (let index = 0; index < 4; index++) {
      const address = new URL('/far-stroke-qa.html', base); address.searchParams.set('case', index)
      await page.goto(address.href, { waitUntil: 'domcontentloaded', timeout: 90000 })
      try { await page.waitForFunction(() => globalThis.__farStrokeExports?.error || globalThis.__farStrokeExports?.results.length === 1, {}, { timeout: 60000 }) }
      catch(error) { console.log(await page.evaluate(() => ({state:globalThis.__farStrokeExports,body:document.body.innerText.slice(0,500)}))); throw error }
      const result = await page.evaluate(() => globalThis.__farStrokeExports)
      assert.equal(result.error, null)
      assert.deepEqual(errors, [])
      report.results.push(result.results[0])
      console.log('PNG captured: ' + result.results[0].name)
    }
  } finally { await browserServer.kill() }
  fs.mkdirSync(out, { recursive: true })
  const rasters = new Map(), results = []
  const probes = {
    'legacy-left': [[16, 48], [112, 48]], 'legacy-right': [[112, 48], [16, 48]],
    'legacy-top': [[64, 16], [64, 80]], 'bounded-diagonal': [[90, 74], [16, 16]],
  }
  for (const item of report.results) {
    const bytes = new Uint8Array(Buffer.from(item.png.split(',')[1], 'base64'))
    rasters.set(item.name, bytes)
    fs.writeFileSync(path.join(out, item.name + '.png'), bytes)
    const png = UPNG.decode(bytes.buffer), rgba = new Uint8Array(UPNG.toRGBA8(png)[0])
    assert.deepEqual([png.width, png.height], [256, 192])
    const darkAt = ([x, y]) => { const i = ((y * 2) * png.width + x * 2) * 4; return rgba[i] < 100 && rgba[i + 1] < 100 && rgba[i + 2] < 100 && rgba[i + 3] > 200 }
    assert.equal(darkAt(probes[item.name][0]), true, item.name + ': visible line')
    assert.equal(darkAt(probes[item.name][1]), false, item.name + ': unpainted area')
    results.push({ name: item.name, width: png.width, height: png.height, bytes: bytes.length })
  }
  const { createPdfExportSnapshot } = await import('../src/editor/utils/pdfSnapshot.js')
  const { generatePdf } = await import('../src/editor/utils/pdfGenerator.js')
  const doc = { title: '먼 좌표 내보내기 QA', pages: report.results.map(item => ({ id: item.name, canvasWidth: 128, canvasHeight: 96, objects: [] })) }
  const snapshot = createPdfExportSnapshot(doc, { scope: 'pages', selectedPageIds: doc.pages.map(page => page.id), width: 128, height: 96 })
  const output = await generatePdf(snapshot, { renderPageImage: async page => ({ bytes: rasters.get(page.pageId), dispose() {} }), readImage: async result => result.bytes, createResult: async bytes => ({ bytes, dispose() {} }) })
  fs.writeFileSync(path.join(out, 'far-strokes.pdf'), output.bytes)
  const pdf = await PDFDocument.load(output.bytes)
  assert.equal(pdf.getPageCount(), 4)
  for (const page of pdf.getPages()) {
    const objects = page.node.Resources().lookup(PDFName.of('XObject')), stream = objects.lookup(objects.keys()[0])
    assert.equal(stream.dict.lookup(PDFName.of('Width')).asNumber(), 256)
    assert.equal(stream.dict.lookup(PDFName.of('Height')).asNumber(), 192)
    const rgb = decodePDFRawStream(stream).decode()
    assert.equal(rgb.length, 256 * 192 * 3)
    let dark = 0
    for (let i = 0; i < rgb.length; i += 3) if (rgb[i] < 100 && rgb[i + 1] < 100 && rgb[i + 2] < 100) dark++
    assert.ok(dark > 50 && dark < 5000)
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ results, pdfPages: 4, pdfBytes: output.bytes.length }, null, 2))
  console.log(JSON.stringify({ results, pdfPages: 4, status: 'passed' }))
})().catch(error => { console.error(error); process.exitCode = 1 })


