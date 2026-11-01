const { chromium } = require('playwright-core')
const http = require('node:http'), assert = require('node:assert/strict')
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html')
    return res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root" style="display:flex;height:100dvh"></div><script src="/tests/fixtures/handwriting-input.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>')
  }
  const upstream = http.get(`http://${process.env.EXPO_QA_HOST || '127.0.0.1'}:${process.env.EXPO_QA_PORT || '8082'}${req.url}`, response => {
    res.writeHead(response.statusCode, response.headers); response.pipe(res)
  })
  upstream.on('error', error => { res.writeHead(502); res.end(error.message) })
})
async function main() {
  await new Promise(resolve => server.listen(54844, '127.0.0.1', resolve))
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  try {
    for (const [width, height] of [[390, 844], [1024, 768]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true })
      const page = await context.newPage(), errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:54844')
      const pad = page.getByLabel('값 손글씨 입력칸', { exact: true }), scroll = page.getByTestId('handwriting-input-scroll')
      await pad.waitFor({ timeout: 180000 }); await pad.scrollIntoViewIfNeeded()
      const cdp = await context.newCDPSession(page)
      const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
      const scrollTop = () => scroll.evaluate(node => node.scrollTop)
      const unlocked = () => scroll.evaluate(node => getComputedStyle(node).overflowY !== 'hidden')
      const count = () => page.evaluate(() => {
        const raw = Object.entries(localStorage).find(([key]) => key.endsWith('dio-handwriting-draft-v1'))?.[1]
        return raw ? JSON.parse(raw).samples['값']?.strokes.length ?? 0 : 0
      })
      // A swipe starting on ordinary content must work before any handwriting.
      const description = page.getByText('평소 글씨처럼 써 주세요. 연한 안내 글자는 원본과 모델 입력에 포함되지 않아요.', { exact: true })
      await description.scrollIntoViewIfNeeded()
      const textBox = await description.boundingBox(), idleTop = await scrollTop()
      assert.equal(await unlocked(), true)
      await touch('touchStart', [{ x: textBox.x + textBox.width / 2, y: textBox.y + textBox.height - 2, id: 3 }])
      for (let i = 1; i <= 4; i++) {
        await touch('touchMove', [{ x: textBox.x + textBox.width / 2, y: textBox.y + textBox.height - 2 - i * 20, id: 3 }])
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      await touch('touchEnd', [])
      assert.ok(await scrollTop() > idleTop + 15, 'Idle swipes starting on text still scroll')
      assert.equal(await count(), 0)
      await new Promise(resolve => setTimeout(resolve, 250))
      async function start() {
        await pad.scrollIntoViewIfNeeded()
        const box = await pad.boundingBox(), x = box.x + box.width * .4, y = box.y + box.height * .3
        await touch('touchStart', [{ x, y, id: 1 }])
        assert.equal(await unlocked(), false, 'Writing touch disables parent scrolling')
        return { x, y, box }
      }
      // Vertical movement inside the pad writes a stroke while keeping scroll fixed.
      let { x, y, box } = await start(), top = await scrollTop()
      for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: x + i * 2, y: y + box.height * .4 * i / 8, id: 1 }])
      assert.equal(await scrollTop(), top)
      await touch('touchEnd', [])
      await page.waitForFunction(() => {
        const raw = Object.entries(localStorage).find(([key]) => key.endsWith('dio-handwriting-draft-v1'))?.[1]
        return raw && JSON.parse(raw).samples['값']?.strokes.length === 1
      })
      assert.equal(await unlocked(), true)
      await start(); await touch('touchCancel', [])
      assert.equal(await unlocked(), true); assert.equal(await count(), 1)
      // A pen pointer follows the responder route as well, and preserves the first stroke.
      box = await pad.boundingBox(); x = box.x + box.width * .3; y = box.y + box.height * .4
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: .5 })
      assert.equal(await unlocked(), false)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 80, y: y + 50, buttons: 1, pointerType: 'pen', force: .5 })
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 80, y: y + 50, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' })
      await page.waitForFunction(() => {
        const raw = Object.entries(localStorage).find(([key]) => key.endsWith('dio-handwriting-draft-v1'))?.[1]
        return raw && JSON.parse(raw).samples['값']?.strokes.length === 2
      })
      assert.equal(await unlocked(), true)
      top = await scrollTop()
      await touch('touchStart', [{ x: width - 4, y: height * .8, id: 2 }])
      for (let i = 1; i <= 8; i++) {
        await touch('touchMove', [{ x: width - 4, y: height * .8 - i * 20, id: 2 }])
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      await touch('touchEnd', [])
      assert.ok(await scrollTop() > top + 20, 'Swiping outside the pad still scrolls the screen')
      assert.equal(await count(), 2)
      await page.reload(); await pad.waitFor(); await pad.scrollIntoViewIfNeeded()
      assert.equal(await count(), 2, 'Completed strokes survive reopening')
      assert.deepEqual(errors, [])
      await cdp.detach(); await context.close()
      console.log(`PASS ${width}x${height}: idle text swipe, touch/pen ink, locked scroll, cancel unlock, outside swipe, saved strokes`)
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1 })
