const { chromium } = require('playwright-core')
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const output = path.join(__dirname, '../.expo/page-settings-results')
fs.mkdirSync(output, { recursive: true })
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100dvh"></div><script src="/tests/fixtures/page-settings.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script>')
  } else http.get(`http://localhost:${process.env.EXPO_QA_PORT || 8081}${req.url}`, upstream => {
    res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res)
  }).on('error', () => { res.writeHead(502); res.end('Metro connection failed') })
})
;(async () => {
  let browser
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'msedge' }) })
    for (const [width, height] of [[1280,800], [1024,768], [390,844], [844,390], [320,740]]) {
      const context = await browser.newContext({ viewport: { width, height } }), page = await context.newPage(), errors = []
      page.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR:', e.message) }); page.setDefaultTimeout(30000)
      page.on('response', response => { if (response.status() >= 400) console.error('HTTP:', response.status(), new URL(response.url()).pathname) })
      const button = name => page.getByRole('button', { name, exact: true })
      await page.goto(`http://127.0.0.1:${server.address().port}`, { timeout: 120000 })
      const title = page.getByRole('textbox', { name: '페이지 이름', exact: true })
      await title.waitFor(); await title.fill('새 페이지')
      await page.getByRole('switch', { name: '페이지 격자 표시', exact: true }).click()
      await page.getByRole('textbox', { name: '페이지 격자 색', exact: true }).fill('#818AC3')
      await button('저장').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, `${width}x${height}.png`) })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await button('저장').click(); await button('설정 다시 열기').click()
      await title.waitFor(); assert.equal(await title.inputValue(), '새 페이지')
      await title.fill('취소할 이름'); await button('취소').click(); await button('설정 다시 열기').click()
      await title.waitFor(); assert.equal(await title.inputValue(), '새 페이지')
      await button('취소').click(); await button('저장 실패 전환').click(); await button('설정 다시 열기').click()
      await title.waitFor(); await title.fill('재시도할 이름'); await button('저장').click()
      await page.getByText('저장 실패 테스트', { exact: true }).waitFor(); assert.equal(await title.inputValue(), '재시도할 이름')
      await button('취소').click(); await button('저장 실패 전환').click(); await button('설정 다시 열기').click()
      await title.waitFor(); assert.equal(await title.inputValue(), '새 페이지')
      assert.equal(await button('속지 변경').count(), 0)
      assert.deepEqual(errors, []); console.log(`PASS ${width}x${height}: save/reopen/cancel/failure, no unsafe template change`)
      await context.close()
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
})().catch(error => { console.error(error); process.exitCode = 1 })
