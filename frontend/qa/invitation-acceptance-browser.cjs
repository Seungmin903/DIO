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
      await page.screenshot({ path: path.join(out, `list-${width}.png`) });
      await button('새로 도착한 기록 초대 수락').click();
      const nickname = page.getByRole('textbox', { name: '다이어리 닉네임', exact: true });
      await nickname.fill('초대참여');
      await button('닉네임 설정 취소').click();
      assert.equal(await page.getByTestId('joined').innerText(), '0');
      await button('새로 도착한 기록 초대 수락').click();
      assert.equal(await nickname.inputValue(), '소연');
      await nickname.fill('초대참여');
      await button('수락하고 참여하기').click();
      // 수락하면 참여가 끝나고 바로 그 다이어리가 열린다(SharingHub: 프로필 경고가 없으면 onOpenDiary). 결과 화면의 '다이어리 열기'는 거치지 않는다.
      await page.waitForFunction(() => (document.querySelector('[data-testid=opened]')?.textContent ?? '').length > 0);
      assert.equal(await page.getByTestId('joined').innerText(), '1');
      await button('초대 목록 열기').click();
      // 끝난 초대(만료 · 취소)는 카드에 상태 칩만 있고 수락 · 더보기가 없다
      for (const title of ['함께하는 오후', '지난 초대']) {
        assert.equal(await button(`${title} 초대 수락`).count(), 0);
        assert.equal(await button(`${title} 초대 더보기`).count(), 0);
      }
      await button('공유 창 닫기').click();
      await button('정원 초과 초대 재현').click();
      await button('가득 찬 기록 초대 수락').click();
      await page.getByText('참여 인원이 가득 찼어요.', { exact: true }).waitFor();
      assert.equal(await button('참여 프로필 설정').count(), 0);
      await page.screenshot({ path: path.join(out, `full-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: 4 viewports, incoming badge/profile cancel/accept/open, revoked/expired without accept, full; no page errors');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
