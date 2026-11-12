const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const port = process.env.DIO_SHARING_BROWSER_PORT || '8081';
const out = path.join(__dirname, '../.expo/diary-copy-results');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100vh"></div><script src="/tests/fixtures/diary-sharing.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>');
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
    for (const [width, height] of [[1280, 800], [1024, 768], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await button('소유자 참여자 관리 재현').click({ timeout: 120000 });
      await button('개인 사본 만들기').click();
      const title = page.getByRole('textbox', { name: '개인 사본 이름', exact: true });
      assert.equal(await title.inputValue(), '참여자 관리 기록 사본');
      await title.fill('취소할 기록');
      await button('사본 만들기 취소').click();
      assert.equal(await page.getByTestId('personal-copies').innerText(), '');
      await button('개인 사본 만들기').click();
      assert.equal(await title.inputValue(), '참여자 관리 기록 사본');
      await title.fill('   ');
      assert.equal(await button('개인 사본 생성').isDisabled(), true);
      await title.fill('나만의 여행');
      await page.screenshot({ path: path.join(out, `copy-${width}.png`) });
      await button('개인 사본 생성').click();
      await button('개인 사본 열기').waitFor();
      assert.equal(await page.getByTestId('personal-copies').innerText(), '나만의 여행');
      await page.screenshot({ path: path.join(out, `created-${width}.png`) });
      await button('개인 사본 열기').click();
      assert.equal(await page.getByTestId('opened').innerText(), '나만의 여행');
      assert.equal(await button('공유 창 닫기').count(), 0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: 4 viewports, copy name/cancel/empty/create/open, no horizontal overflow or page errors');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
