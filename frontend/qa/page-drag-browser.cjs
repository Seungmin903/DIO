const { chromium } = require('playwright-core')
const http = require('node:http'), assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs')
const output = path.join(__dirname, '../.expo/page-drag-results')
fs.mkdirSync(output, { recursive: true })
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100dvh"></div><script src="/tests/fixtures/page-drag.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script>')
  } else http.get(`http://localhost:${process.env.EXPO_QA_PORT || 8081}${req.url}`, upstream => {
    res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res)
  }).on('error', () => { res.writeHead(502); res.end('Metro connection failed') })
})
;(async () => {
  let browser
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'msedge' }) })
    for (const [width, height] of [[1280,800], [390,844]]) {
      const context = await browser.newContext({ viewport: { width, height } }), page = await context.newPage(), errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`http://127.0.0.1:${server.address().port}`, { timeout: 120000 })
      const second = page.getByRole('button', { name: '2페이지', exact: true })
      await second.waitFor()
      const panel = page.getByTestId('page-panel'), edit = page.getByRole('button', { name: '페이지 편집', exact: true })
      const beforePanel = await panel.boundingBox(), beforeEdit = await edit.boundingBox()
      assert.equal(beforeEdit.width, 140, 'edit button aligns with filter tabs')
      assert.equal(beforeEdit.height, 32, 'edit button keeps its compact height')
      await edit.click()
      const deleteBox = await page.getByRole('button', { name: '선택한 0개 삭제', exact: true }).boundingBox()
      assert.equal(deleteBox.width, beforeEdit.width, 'selection delete aligns with edit button')
      assert.equal(deleteBox.height, beforeEdit.height, 'selection delete keeps the same compact height')
      await page.getByRole('button', { name: '여러 페이지 선택 해제', exact: true }).click()
      assert.deepEqual(await edit.boundingBox(), beforeEdit, 'selection mode returns to the same edit button')
      const box = await second.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2
      await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(350)
      const preview = page.getByTestId('page-drag-preview')
      await preview.waitFor()
      const start = await preview.boundingBox()
      await page.mouse.move(x, y + 240, { steps: 15 }); await page.waitForTimeout(100)
      const moved = await preview.boundingBox()
      assert.ok(moved.y > start.y + 150, 'preview follows the pointer')
      assert.equal(await second.evaluate(node => getComputedStyle(node.parentElement).opacity), '0', 'original gesture target stays mounted but hidden')
      assert.deepEqual(await panel.boundingBox(), beforePanel, 'panel layout stays unchanged')
      assert.deepEqual(await edit.boundingBox(), beforeEdit, 'edit button layout stays unchanged')
      await page.screenshot({ path: path.join(output, `${width}x${height}.png`) })
      await page.mouse.up()
      await page.getByLabel('페이지 순서', { exact: true }).filter({ hasText: 'page-1,page-3,page-2,page-4,page-5' }).waitFor()
      await preview.waitFor({ state: 'detached' })
      assert.deepEqual(errors, [])
      console.log(`PASS ${width}x${height}: moving preview, unchanged panel/button, drop order`)
      await context.close()
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
})().catch(error => { console.error(error); process.exitCode = 1 })
