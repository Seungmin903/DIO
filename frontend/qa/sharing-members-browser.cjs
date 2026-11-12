const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const port = process.env.DIO_SHARING_BROWSER_PORT || '8081';
const out = path.join(__dirname, '../.expo/sharing-members-results');
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
      await button('참여자 관리').click();
      await button('모아 참여 해제').click();
      await page.getByText('모아님을 내보낼까요?', { exact: true }).waitFor();
      await button('취소').click();
      await button('모아 참여 해제').waitFor();
      await page.screenshot({ path: path.join(out, `members-${width}.png`) });
      await button('모아 참여 해제').click();
      await button('내보내기').click();
      await button('모아 참여 해제').waitFor({ state: 'hidden' });
      await button('하루 소유권 양도').click();
      await button('취소').click();
      await button('하루 소유권 양도').click();
      await page.screenshot({ path: path.join(out, `transfer-${width}.png`) });
      await button('양도').click();
      await button('다이어리 참여 해제').waitFor();
      assert.equal(await button('참여자 관리').count(), 0);
      await button('다이어리 참여 해제').click();
      await button('취소').click();
      assert.equal(await page.getByTestId('joined').innerText(), '1');
      await button('다이어리 참여 해제').click();
      await button('참여 해제').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="joined"]')?.textContent === '0');
      await button('공유 창 닫기').click();
      await button('소유자 공유 열기').click();
      assert.equal(await button('참여자 관리').count(), 0);
      assert.equal(await button('다이어리 참여 해제').count(), 0);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: 4 viewports, remove/transfer/leave cancel and confirm, role changes, sole owner safety; no page errors');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
