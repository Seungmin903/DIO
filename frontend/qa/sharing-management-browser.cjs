const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const port = process.env.DIO_SHARING_BROWSER_PORT || '8081';
const out = path.join(__dirname, '../.expo/sharing-management-results');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100vh"></div><script src="/tests/fixtures/diary-sharing.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>');
    return;
  }
  http.get(`http://127.0.0.1:${port}${req.url}`, upstream => {
    res.writeHead(upstream.statusCode, upstream.headers);
    upstream.pipe(res);
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
      await button('소유자 공유 열기').click({ timeout: 120000 });
      await page.getByText('1/4명', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, `sharing-compact-${width}x${height}.png`) });
      assert.equal(await page.getByRole('textbox', { name: '초대할 이메일', exact: true }).count(), 0);
      await button('이메일로 초대').click();
      const email = page.getByRole('textbox', { name: '초대할 이메일', exact: true });
      await email.fill('invalid');
      assert.equal(await button('이메일 초대 보내기').isDisabled(), true);
      await email.fill('Friend@Example.com');
      await button('이메일 초대 보내기').click();
      await page.getByText('가입된 이메일이라면 초대가 전달됩니다.', { exact: true }).waitFor();
      await button('friend@example.com 초대 취소').click();
      await button('초대 취소').click();
      await page.getByText('취소됨', { exact: true }).waitFor();
      assert.equal(await email.inputValue(), '');
      await email.scrollIntoViewIfNeeded();
      const emailBounds = await email.boundingBox();
      assert.ok(emailBounds.x >= 0 && emailBounds.x + emailBounds.width <= width + 1);
      await page.screenshot({ path: path.join(out, `sharing-email-${width}x${height}.png`) });
      await button('이전 공유 화면').click();
      await button('초대 링크 만들기').click();
      await button('초대 링크 다시 만들기').waitFor();
      for (let i = 0; i < 2; i++) {
        await button('초대 링크 다시 만들기').click();
        await page.waitForTimeout(350);
      }
      await button('초대 링크 다시 만들기').click();
      await page.getByText('링크는 5분에 3번까지 만들 수 있어요. 잠시 후 다시 시도해 주세요.', { exact: true }).waitFor();
      for (const name of ['공유 창 닫기', '초대 링크 다시 만들기', '완료']) {
        await button(name).scrollIntoViewIfNeeded();
        const bounds = await button(name).boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${name}: ${width}`);
        assert.ok(bounds.height >= 44, `${name}: touch height`);
      }
      await page.screenshot({ path: path.join(out, `sharing-${width}x${height}.png`) });
      await button('공유 창 닫기').click();
      await button('소유자 공유 열기').click();
      await button('이메일로 초대').click();
      await page.getByText('취소됨', { exact: true }).waitFor();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: 4 viewports, email validation/send/cancel/reopen, link rate limit, touch bounds; no page errors');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
