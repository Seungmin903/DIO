const { chromium } = require('playwright-core')
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(process.env.HANDWRITING_WEB_ROOT || path.resolve(__dirname, '../dist')), output = path.resolve(process.env.HANDWRITING_QA_OUTPUT || path.resolve(__dirname, '../qa/handwriting-output/browser'))
fs.mkdirSync(output, { recursive: true })
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost'), file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end() }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' })[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})
async function enterLocalSession(page) {
  const tab = page.getByRole('tab', { name: '내 공간', exact: true }).or(page.getByRole('button', { name: '내 공간', exact: true }))
  const guest = page.getByRole('button', { name: '개발자 모드로 시작', exact: true })
  await Promise.race([tab.waitFor(), guest.waitFor()])
  if (await guest.isVisible()) await guest.click()
  await tab.waitFor().catch(async error => { console.error('LOCAL_QA_BODY', await page.locator('body').innerText()); throw error })
}
async function openStudio(page) {
  await enterLocalSession(page)
  await page.getByRole('tab', { name: '내 공간', exact: true }).or(page.getByRole('button', { name: '내 공간', exact: true })).click()
  await page.getByRole('button', { name: /나만의 폰트 만들기/ }).click()
  await page.getByRole('button', { name: '+ 새로 만들기', exact: true }).waitFor()
}
// Read the committed v3 snapshot through the real browser IndexedDB adapter.
async function storedDraft(expectedStrokes) {
  const raw = Object.entries(localStorage).find(([key]) => key.endsWith('dio-handwriting-workflow-v3'))?.[1]
  if (!raw) return expectedStrokes == null ? null : false
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open('dio-handwriting-workflow', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
  try {
    const read = key => new Promise((resolve, reject) => { const tx = db.transaction('records', 'readonly'), request = tx.objectStore('records').get(key); let text; request.onsuccess = () => { text = request.result }; tx.oncomplete = () => resolve(JSON.parse(text)); tx.onerror = () => reject(tx.error) })
    const index = await read(JSON.parse(raw).index), item = index.records.find(r => r.value.status === 'draft')
    const draft = item ? (await read(item.payload)).draft : null
    return expectedStrokes == null ? draft : (draft?.samples['값']?.strokes.length ?? 0) === expectedStrokes
  } finally { db.close() }
}
async function stroke(page, points) {
  await page.getByLabel('값 손글씨 입력칸', { exact: true }).scrollIntoViewIfNeeded()
  const before = (await page.evaluate(storedDraft))?.samples['값']?.strokes.length ?? 0
  const box = await page.getByLabel('값 손글씨 입력칸', { exact: true }).boundingBox()
  assert(box && box.width > 20)
  await page.mouse.move(box.x + box.width * points[0][0], box.y + box.height * points[0][1]); await page.mouse.down()
  for (const [x, y] of points.slice(1)) await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 12 })
  await page.mouse.up()
  await page.waitForFunction(storedDraft, before + 1)
}
;(async () => {
  await new Promise(resolve => server.listen(54841, '127.0.0.1', resolve))
  const executablePath = process.env.BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined)
  const browser = await chromium.launch({ executablePath, headless: true })
  const errors = []
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    context.setDefaultTimeout(30000)
    await context.addInitScript(() => { window.showSaveFilePicker = undefined })
    const page = await context.newPage(); page.on('pageerror', e => { errors.push(e.message); console.error('LOCAL_QA_ERROR', e.message) })
    await page.goto('http://127.0.0.1:54841/'); await openStudio(page)
    await page.getByRole('button', { name: '+ 새로 만들기', exact: true }).click()
    await page.getByRole('button', { name: '샘플 확인', exact: true }).waitFor()
    assert(await page.getByRole('button', { name: '샘플 확인', exact: true }).isDisabled())
    await stroke(page, [[.25, .3], [.6, .32], [.55, .65]])
    await page.waitForFunction(storedDraft, 1)
    assert.equal(await page.getByRole('button', { name: '샘플 확인', exact: true }).isDisabled(), true)
    await page.screenshot({ path: path.join(output, 'phone-input.png'), fullPage: true })
    await page.getByRole('button', { name: '폰트 화면 뒤로가기', exact: true }).click()
    await page.reload(); await openStudio(page)
    await page.getByRole('button', { name: '나의 손글씨 작성 중', exact: true }).click()
    await page.waitForFunction(storedDraft, 1)
    const draft = await page.evaluate(storedDraft); assert.equal(draft.samples['값'].strokes.length, 1)
    await stroke(page, [[.3, .55], [.6, .72]])
    await page.getByRole('button', { name: '획 되돌리기', exact: true }).click()
    await page.getByText('이 기기에 저장됨', { exact: true }).waitFor()
    await page.waitForFunction(storedDraft, 1)
    assert.equal((await page.evaluate(storedDraft)).samples['값'].strokes.length, 1)
    const fontPath = process.env.HANDWRITING_TEST_TTF || path.resolve(__dirname, '../../../outputs/dio-handwriting-java-test/full-fixture.ttf')
    await page.getByRole('button', { name: '폰트 보조 메뉴', exact: true }).click()
    const fileChooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: '초안·폰트 가져오기', exact: true }).click()
    await (await fileChooser).setFiles(fontPath)
    await page.getByRole('button', { name: '폰트 화면 뒤로가기', exact: true }).click()
    await page.getByText(path.basename(fontPath).replace(/\.ttf$/, ''), { exact: true }).waitFor()
    let fonts = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => key.endsWith('dio-personal-fonts-v1'))[1]))
    assert.equal(fonts.length, 1)
    await page.waitForFunction(family => document.fonts.check(`16px ${family}`), fonts[0].family)
    assert(await page.evaluate(family => {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128
      const c = canvas.getContext('2d'); c.font = `96px ${family}`; c.fillText('한이민글', 0, 100)
      return c.getImageData(0, 0, 512, 128).data.filter((v, i) => i % 4 === 3 && v > 0).length > 100
    }, fonts[0].family), 'Loaded font draws real Hangul ink')
    let activeFont = fonts[0], spacing = null
    if (process.env.HANDWRITING_TEST_SPACING === '1') {
      const original = fonts[0]
      await page.getByRole('button', { name: `${original.label} 생성 완료`, exact: true }).click()
      await page.getByRole('button', { name: '폰트 보조 메뉴', exact: true }).click()
      await page.getByRole('button', { name: '글자 간격 보정', exact: true }).click()
      await page.waitForFunction(() => JSON.parse(Object.entries(localStorage).find(([key]) => key.endsWith('dio-personal-fonts-v1'))[1]).length === 2)
      fonts = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => key.endsWith('dio-personal-fonts-v1'))[1]))
      activeFont = fonts.find(font => font.sourceFontId === original.id)
      assert(activeFont); assert.equal(activeFont.spacingVersion, 'ink-bounds-v1')
      await page.waitForFunction(family => [...document.fonts].some(face => face.family.replace(/["']/g, '') === family && face.status === 'loaded'), activeFont.family)
      spacing = await page.evaluate(({ before, after }) => {
        const context = document.createElement('canvas').getContext('2d'), text = '이가횡핀한민글'
        context.font = `48px ${before}`; const originalWidth = context.measureText(text).width
        context.font = `48px ${after}`; return { originalWidth, correctedWidth: context.measureText(text).width }
      }, { before: original.family, after: activeFont.family })
      console.log('SPACING_WIDTHS', spacing)
      assert(spacing.correctedWidth < spacing.originalWidth * .8)
      assert.equal(fonts.find(font => font.id === original.id).uri, original.uri)
      await page.getByRole('button', { name: '폰트 화면 뒤로가기', exact: true }).click()
      await page.getByRole('button', { name: `${activeFont.label} 생성 완료`, exact: true }).click()
      await page.getByRole('button', { name: '폰트 보조 메뉴', exact: true }).click()
      assert(await page.getByRole('button', { name: '글자 간격 보정', exact: true }).isDisabled())
      await page.getByRole('button', { name: '폰트 화면 뒤로가기', exact: true }).click()
    }
    await page.reload(); await openStudio(page)
    await page.getByText(path.basename(fontPath).replace(/\.ttf$/, ''), { exact: true }).waitFor()
    await page.waitForFunction(family => document.fonts.check(`16px ${family}`), fonts[0].family)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.screenshot({ path: path.join(output, 'tablet-input.png'), fullPage: true })
    await page.getByRole('button', { name: `${path.basename(fontPath).replace(/\.ttf$/, '')} 생성 완료`, exact: true }).click()
    await page.getByText('안녕하세요 좋은 하루 되세요 나만의 손글씨', { exact: true }).scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: '폰트 보조 메뉴', exact: true }).click()
    await page.screenshot({ path: path.join(output, 'font-library.png') })
    const corrupted = Buffer.from(fs.readFileSync(fontPath)); corrupted[corrupted.length - 1] ^= 1
    const badChooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: '초안·폰트 가져오기', exact: true }).click()
    await (await badChooser).setFiles({ name: 'damaged.ttf', mimeType: 'font/ttf', buffer: corrupted })
    await page.getByText('폰트 파일 검증에 실패했어요. 원래 파일을 다시 가져와 주세요.', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => key.endsWith('dio-personal-fonts-v1'))[1]).length), fonts.length)
    await page.getByRole('button', { name: '폰트 화면 뒤로가기', exact: true }).click()
    await page.getByRole('button', { name: '폰트 화면 뒤로가기', exact: true }).click()
    const sentence = '한이민글 오늘의 기록'
    await page.evaluate(({ font, sentence, spacingTest }) => {
      const id = 'handwriting-browser-qa'
      localStorage.setItem('dio:diary:list:v1', JSON.stringify([{ id, title: '내 폰트 적용 QA', color: '#CED9EE' }]))
      const width = spacingTest ? 240 : 1050
      localStorage.setItem(`dio:editor:doc:v4:${id}`, JSON.stringify({ id, title: '내 폰트 적용 QA', pages: [{ id: 'page', canvasWidth: 1280, canvasHeight: 800, objects: [{ id: 'handwriting-text', type: 'text', x: 100, y: 180, w: width, baseWidth: width, h: 110, text: sentence, font: font.id, fontSize: 64, color: '#111111', rotation: 0 }] }] }))
    }, { font: activeFont, sentence, spacingTest: Boolean(spacing) })
    await page.reload()
    await enterLocalSession(page)
    await page.getByText('내 폰트 적용 QA', { exact: true }).first().click()
    await page.locator('[aria-label$=" 캔버스"]').waitFor()
    await page.waitForFunction(({ sentence, family }) => [...document.querySelectorAll('div')].some(el => el.textContent === sentence && getComputedStyle(el).fontFamily.includes(family)), { sentence, family: activeFont.family })
    const wrapping = spacing ? await page.evaluate(({ sentence, family }) => {
      const node = [...document.querySelectorAll('div')].find(el => el.textContent === sentence && getComputedStyle(el).fontFamily.includes(family))
      return { lines: Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)) }
    }, { sentence, family: activeFont.family }) : null
    if (wrapping) assert(wrapping.lines >= 2, 'Corrected font wraps in a narrow real editor text box')
    await page.screenshot({ path: path.join(output, 'diary-personal-font.png') })
    for (const format of ['PNG', 'PDF']) {
      await page.getByLabel('공유 및 내보내기', { exact: true }).click()
      if (format === 'PDF') await page.getByRole('button', { name: 'PDF', exact: true }).click()
      const download = page.waitForEvent('download', { timeout: 90000 })
      await page.getByRole('button', { name: `${format} 만들기`, exact: true }).click()
      await (await download).saveAs(path.join(output, `personal-font.${format.toLowerCase()}`))
    }
    const UPNG = require('upng-js'), pngBytes = fs.readFileSync(path.join(output, 'personal-font.png'))
    const decoded = UPNG.decode(pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength)), rgba = new Uint8Array(UPNG.toRGBA8(decoded)[0])
    assert.equal(decoded.width, 2560); assert.equal(decoded.height, 1600)
    let ink = 0
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i] < 100 && rgba[i + 1] < 100 && rgba[i + 2] < 100 && rgba[i + 3] > 0) ink++
    assert(ink > 200, 'Export contains rendered text')
    const { PDFDocument } = require('pdf-lib'), pdf = await PDFDocument.load(fs.readFileSync(path.join(output, 'personal-font.pdf')))
    assert.equal(pdf.getPageCount(), 1)
    await page.reload()
    await enterLocalSession(page)
    await page.getByText('내 폰트 적용 QA', { exact: true }).first().click()
    await page.waitForFunction(({ sentence, family }) => [...document.querySelectorAll('div')].some(el => el.textContent === sentence && getComputedStyle(el).fontFamily.includes(family)), { sentence, family: activeFont.family })
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ platform: 'headless Edge / React Native Web', phone_hardware_tested: false, native_module_absent: true, input_saved_and_reloaded: true, undo_preserves_earlier_stroke: true, native_generation_disabled: true, real_ttf_import_and_reload: true, damaged_font_preserves_library: true, diary_font_and_reload: true, spacing, wrapping, png_export: [decoded.width, decoded.height], pdf_pages: pdf.getPageCount(), font_source: path.basename(fontPath), page_errors: errors }, null, 2))
    console.log('Handwriting UI: input, persistence, undo, unavailable generator, actual TTF import/reload, damaged import, diary render, PNG/PDF passed.')
  } catch (error) {
    fs.writeFileSync(path.join(output, 'error.txt'), error.stack || String(error)); throw error
  } finally { await browser.close(); server.close() }
})()
