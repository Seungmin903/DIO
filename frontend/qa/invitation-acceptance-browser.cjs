const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const port = process.env.DIO_SHARING_BROWSER_PORT || '8081';
const out = path.join(__dirname, '../.expo/invitation-acceptance-results');
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
      await button('새 초대 도착 재현').click({ timeout: 120000 });
      await page.getByRole('button', { name: /다이어리 공유, 새 초대 3개/ }).waitFor();
      await button('초대 목록 열기').click();
      await button('새로 도착한 기록 초대 상세').click();
      await page.getByText('하루님이 초대했어요.', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, `detail-${width}.png`) });
      await button('참여 프로필 설정').click();
      const nickname = page.getByRole('textbox', { name: '다이어리 닉네임', exact: true });
      await nickname.fill('초대참여');
      await button('닉네임 설정 취소').click();
      assert.equal(await page.getByTestId('joined').innerText(), '0');
      await button('새로 도착한 기록 초대 상세').click();
      await button('참여 프로필 설정').click();
      assert.equal(await nickname.inputValue(), '소연');
      await nickname.fill('초대참여');
      await button('수락하고 참여하기').click();
      await button('다이어리 열기').waitFor();
      assert.equal(await page.getByTestId('joined').innerText(), '1');
      await button('다이어리 열기').click();
      assert.ok((await page.getByTestId('opened').innerText()).length > 0);
      await button('초대 목록 열기').click();
      for (const [title, message] of [['함께하는 오후', '만료된 초대예요.'], ['지난 초대', '취소된 초대예요.']]) {
        await button(`${title} 초대 상세`).click();
        await page.getByText(message, { exact: true }).waitFor();
        assert.equal(await button('참여 프로필 설정').count(), 0);
        await button('이전 공유 화면').click();
      }
      await button('공유 창 닫기').click();
      await button('정원 초과 초대 재현').click();
      await button('가득 찬 기록 초대 상세').click();
      await page.getByText('참여 인원이 가득 찼어요.', { exact: true }).waitFor();
      assert.equal(await button('참여 프로필 설정').count(), 0);
      await page.screenshot({ path: path.join(out, `full-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: 4 viewports, incoming badge/detail/profile cancel/accept/open, revoked/expired/full; no page errors');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
