const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const port = process.env.DIO_SHARING_BROWSER_PORT || '8081';
const out = path.join(__dirname, '../.expo/sticker-cutout-results');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100vh"></div><script src="/tests/fixtures/sticker-cutout.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>');
    return;
  }
  http.get(`http://127.0.0.1:${port}${req.url}`, upstream => {
    res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
  }).on('error', error => { res.writeHead(502); res.end(error.message); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const photo = path.join(__dirname, '../../docs/images/reading-mode/tablet.png');
    async function pickPhoto(label) {
      const chooser = page.waitForEvent('filechooser');
      await button(label).click();
      await (await chooser).setFiles(photo);
      await button('선택 추가').waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].some(n => n.getAttribute('aria-label') === '선택 추가' && n.getAttribute('aria-disabled') !== 'true'));
    }
    async function draw(exclude = false) {
      const canvas = page.getByTestId('cutout-canvas');
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + box.width * (exclude ? .55 : .3), box.y + box.height * .5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * (exclude ? .6 : .7), box.y + box.height * .6, { steps: 12 });
      await page.mouse.up();
      await button('되돌리기').waitFor();
    }
    for (const [width, height] of [[1280, 800], [1024, 768], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`http://127.0.0.1:${server.address().port}`, { timeout: 120000 });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ timeout: 120000 });
      await button('새 폴더').click({ timeout: 120000 });
      await page.getByRole('textbox', { name: '폴더 이름', exact: true }).fill('오려만들기');
      await page.getByLabel('폴더 이름 확인', { exact: true }).click();
      await page.getByLabel('오려만들기에 스티커 추가', { exact: true }).click();
      await button('이미지 그대로 추가').waitFor();
      await button('이미지 분리해서 추가').waitFor();
      await button('사진 속 대상 오리기').click();
      await page.getByText('화면 미리보기 · AI 분리와 실제 저장은 아직 연결되지 않았어요.', { exact: true }).waitFor();
      assert.equal(await button('사진 선택').count(), 1);
      assert.equal(await button('다른 사진 선택').count(), 0);
      await page.waitForTimeout(300); // Modal 진입 fade가 끝난 상태를 캡처한다.
      await page.screenshot({ path: path.join(out, `empty-${width}.png`) });
      await pickPhoto('사진 선택');
      const sizeSlider = page.getByLabel('붓 크기', { exact: true });
      await sizeSlider.scrollIntoViewIfNeeded();
      const sliderBox = await sizeSlider.boundingBox();
      await page.mouse.move(sliderBox.x + sliderBox.width * .3, sliderBox.y + sliderBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(sliderBox.x + sliderBox.width * .65, sliderBox.y + sliderBox.height / 2, { steps: 5 });
      await page.mouse.up();
      const brushValue = Number(await sizeSlider.getAttribute('aria-valuenow'));
      assert.ok(brushValue > 24 && brushValue <= 80);
      assert.equal(await button('다음 · 스티커 확인').isDisabled(), true);
      await draw();
      assert.equal(await button('다음 · 스티커 확인').isDisabled(), false);
      await button('선택 제외').click(); await draw(true);
      await button('되돌리기').click();
      assert.equal(await button('다시 실행').isDisabled(), false);
      await button('다시 실행').click();
      await button('선택 초기화').click();
      await button('취소').click();
      assert.equal(await button('다음 · 스티커 확인').isDisabled(), false);
      await page.screenshot({ path: path.join(out, `select-${width}.png`) });
      await button('다음 · 스티커 확인').click();
      await button('저장 흐름 확인').waitFor();
      await page.screenshot({ path: path.join(out, `result-${width}.png`) });
      await button('선택 수정').click();
      await button('스티커 만들기 닫기').click();
      await button('취소').click();
      await button('다음 · 스티커 확인').click();
      await button('저장 흐름 확인').click(); await button('취소').click();
      await button('저장 흐름 확인').click(); await button('확인').click();
      await page.getByText('저장 화면 확인을 마쳤어요. 실제 파일과 스티커는 추가되지 않았어요.', { exact: true }).waitFor();
      await button('스티커 만들기 닫기').click();
      assert.equal(await page.getByTestId('added-stickers').innerText(), '0');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: 4 viewports, real drawer entry/photo/add/exclude/undo/redo/reset cancel/result/edit/close cancel/mock save; no real sticker writes or page errors');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
