const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const screenshots = path.resolve(__dirname, '../.expo/png-region-layout')
;(async () => {
  const server = await chromium.launchServer({ headless: true, ...(process.env.DIO_QA_BROWSER_CHANNEL ? { channel: process.env.DIO_QA_BROWSER_CHANNEL } : {}) })
  try {
    const browser = await chromium.connect(server.wsEndpoint())
    fs.mkdirSync(screenshots, { recursive: true })
    for (const viewport of [{ width: 390, height: 844 }, { width: 640, height: 360 }, { width: 700, height: 1000 }, { width: 1100, height: 850 }].filter(v => !process.env.DIO_QA_WIDTH || v.width === Number(process.env.DIO_QA_WIDTH))) {
      const context = await browser.newContext({ viewport, hasTouch: true }), page = await context.newPage(), errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.route('**/region-layout-qa*', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div><script src="/tests/fixtures/png-region-layout.entry.bundle?platform=web&dev=true&hot=false"></script>' }))
      await page.goto('http://localhost:8095/region-layout-qa')
      const overlay = page.getByTestId('export-region-overlay'), frame = page.getByTestId('export-region-frame')
      await frame.waitFor({ timeout: 120000 })
      // 사용자가 바꾼 보기 확대 상태도 경고 전환에서 유지되어야 한다.
      const view = await page.getByTestId('region-viewport').boundingBox(), cx = view.x + view.width / 2, cy = view.y + view.height / 2
      const cdp = await context.newCDPSession(page)
      async function touches(type, points) {
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ id, x, y })) })
        await page.waitForTimeout(40)
      }
      await touches('touchStart', [[cx - 50, cy], [cx + 50, cy]])
      await touches('touchMove', [[cx - 40, cy], [cx + 40, cy]])
      await touches('touchEnd', []); await page.waitForTimeout(200)
      const paperBefore = await overlay.boundingBox(), viewBefore = await page.getByTestId('region-viewport').boundingBox()
      const steady = async () => {
        for (const [before, after] of [[paperBefore, await overlay.boundingBox()], [viewBefore, await page.getByTestId('region-viewport').boundingBox()]]) {
          for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - after[key]) < 1, `layout changed ${key}: ${before[key]} -> ${after[key]}`)
        }
      }
      async function drag(width, ratio) {
        const paper = await overlay.boundingBox(), box = await frame.boundingBox(), handle = await page.getByTestId('region-handle-se').boundingBox(), zoom = paper.width / 1280
        const old = (await page.locator('body').innerText()).match(/선택\s+(\d+)\s*×\s*(\d+)/)
        const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2
        const tx = x + (width - Number(old[1])) * zoom, ty = y + (width / ratio - Number(old[2])) * zoom
        const touchResize = viewport.width === 390
        if (touchResize) await touches('touchStart', [[x, y]])
        else { await page.mouse.move(x, y); await page.mouse.down() }
        for (let i = 1; i <= 12; i++) {
          const at = [x + (tx - x) * i / 12, y + (ty - y) * i / 12]
          if (touchResize) await touches('touchMove', [at])
          else await page.mouse.move(...at)
          await page.waitForTimeout(25)
          await steady()
        }
        if (touchResize) await touches('touchEnd', [])
        else await page.mouse.up()
        await page.waitForTimeout(160)
        const selected = (await page.locator('body').innerText()).match(/선택\s+(\d+)\s*×\s*(\d+)/)
        assert.ok(selected, 'selection dimensions missing')
        // 축소된 전체 페이지에서는 포인터 1px가 여러 논리 단위다. 입력 좌표의 픽셀 정밀도만 허용한다.
        const tolerance = Math.max(1, Math.ceil(1 / zoom))
        assert.ok(Math.abs(Number(selected[1]) - width) <= tolerance, `resize rolled back: ${JSON.stringify({ viewport, requested: width, selected: selected[1], paper, box, handle, zoom, dx: tx-x, dy: ty-y })}`)
        assert.ok(Math.abs(Number(selected[2]) - width / ratio) <= tolerance)
        await steady()
      }
      for (const [label, ratio, output] of [['정사각형 1:1', 1, [1080, 1080]], ['세로 피드 4:5', 0.8, [1080, 1350]], ['스토리 9:16', 9 / 16, [1080, 1920]]]) {
        await page.getByRole('button', { name: label, exact: true }).click(); await page.waitForTimeout(120); await steady()
        // 짧은 화면의 낮은 맞춤 배율에서도 기존 3px 드래그 시작 기준을 충분히 넘긴다.
        for (const width of viewport.height < 500 ? [500, 300, 100, 300, 500] : [400, 300, 150, 250, 400]) {
          await drag(width, ratio)
          const button = page.getByRole('button', { name: '선택 영역 확정', exact: true })
          if (width === 300 || width === 250) {
            await page.getByText('3배를 넘게 확대하면 사진·글씨가 흐릴 수 있어요.', { exact: true }).waitFor()
            assert.equal(await button.isDisabled(), true)
            await page.getByRole('button', { name: '화질 안내 확인 후 계속', exact: true }).click()
            assert.equal(await button.isDisabled(), false)
            await steady()
            if (width === 300 && ratio === 1) await page.screenshot({ path: path.join(screenshots, `${viewport.width}-warning.png`) })
          } else if (width === 150 || width === 100) {
            assert.equal(await button.isDisabled(), true)
            await page.getByText('확대가 6배를 넘어요. 더 넓게 고르거나 자유 비율로 바꿔 주세요.', { exact: true }).waitFor()
          } else assert.equal(await button.isDisabled(), false)
        }
        await page.getByRole('button', { name: '선택 영역 확정', exact: true }).click()
        const saved = await page.evaluate(() => globalThis.__regionLayoutQA.snapshot)
        assert.deepEqual([saved.pixelWidth, saved.pixelHeight], output)
      }
      await page.getByRole('button', { name: '자유', exact: true }).click(); await steady()
      await drag(64, 1)
      await page.getByRole('button', { name: '선택 영역 확정', exact: true }).click()
      const free = await page.evaluate(() => globalThis.__regionLayoutQA.confirmed)
      assert.equal(free.preset, 'free'); assert.ok(free.output.magnification <= 2)
      assert.equal(free.output.blocked, false); assert.equal(free.output.needsConfirmation, false)
      assert.deepEqual(errors, [])
      console.log(JSON.stringify({ viewport, status: 'passed', fixedPresets: 3, thresholdDrags: 15, viewZoomPreserved: true, outputPolicyPreserved: true }))
      await context.close()
    }
  } finally { await server.kill() }
})().catch(e => { console.error(e); process.exitCode = 1 })
