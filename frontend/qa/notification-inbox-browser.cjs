const { chromium } = require('playwright-core');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100vh"></div><script src="/tests/fixtures/notification-inbox.entry.bundle?platform=web&dev=false&minify=false&lazy=false&hot=false"></script>'); return;
  }
  http.get(`http://127.0.0.1:${process.env.EXPO_QA_PORT || 8081}${req.url}`, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); })
    .on('error', () => { res.writeHead(502); res.end('Metro is unavailable'); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
    const out = path.join(__dirname, '../.expo/notification-inbox-results'); fs.mkdirSync(out, { recursive: true });
    for (const [width, height] of [[1280, 800], [1024, 768], [390, 844], [844, 390], [320, 740]]) {
      const context = await browser.newContext({ viewport: { width, height } }), page = await context.newPage(), errors = [];
      page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR:', error.message); });
      const button = name => page.getByRole('button', { name, exact: true });
      const open = async (query = '') => { await page.goto(`http://127.0.0.1:${server.address().port}/${query}`, { timeout: 120000 }); await button('알림 닫기').waitFor(); };
      await open(); await button('초대 확인 4').waitFor();
      assert.equal(await button('초대 확인 4').innerText(), '초대 확인');
      await page.screenshot({ path: path.join(out, `${width}x${height}.png`) });
      for (const name of ['알림 닫기', '알림 새로고침', '모두 읽음']) {
        const box = await button(name).boundingBox(); assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, name);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await button('초대 확인 3').click(); await page.getByTestId('notification-detail').waitFor();
      await page.getByText('이 초대로는 참여할 수 없어요.', { exact: true }).waitFor();
      await page.getByRole('progressbar', { name: '초대 상세 불러오는 중이에요.' }).waitFor({ state: 'detached' });
      await page.waitForTimeout(200);
      await page.getByText('이 초대로는 참여할 수 없어요.', { exact: true }).waitFor();
      assert.equal(await page.getByTestId('notification-panel').count(), 0);
      await page.screenshot({ path: path.join(out, `${width}x${height}-detail.png`) });
      await button('초대 상세 닫기').click(); await page.getByTestId('notification-panel').waitFor();
      await button('모두 읽음').click(); await page.getByText('새 초대 0개', { exact: true }).waitFor();
      await button('알림 더 보기').click(); await button('초대 확인 1').waitFor();
      await button('알림 삭제 4').click(); await button('초대 확인 4').waitFor({ state: 'detached' });
      await button('초대 확인 1').click(); await page.getByText('초대 이동: A-invite-1', { exact: true }).waitFor();
      await button('알림 열기').click(); await button('알림 닫기').click(); await button('알림 닫기').waitFor({ state: 'detached' });
      await open('?empty'); await page.getByTestId('notification-empty').waitFor();
      await page.screenshot({ path: path.join(out, `${width}x${height}-empty.png`) });
      await open('?error'); await page.getByRole('alert').first().waitFor(); await button('알림 목록 다시 시도').waitFor();
      await page.screenshot({ path: path.join(out, `${width}x${height}-error.png`) });
      await open('?loading'); await page.getByRole('progressbar', { name: '알림 목록 불러오는 중이에요.' }).waitFor();
      await open('?navigation-error'); await button('초대 확인 4').waitFor();
      const notice = page.waitForEvent('dialog');
      const failedMove = button('초대 확인 4').click();
      const dialog = await notice; assert.ok(dialog.message().includes('초대 화면을 열지 못했어요')); await dialog.accept(); await failedMove;
      assert.equal(await button('초대 확인 4').isEnabled(), true);
      assert.equal(await button('알림 삭제 4').isEnabled(), true);
      await open('?flow'); await button('초대 확인 4').waitFor();
      await page.evaluate(() => {
        window.flowRoot = document.querySelector('[data-testid="home-notification-modal-content"]');
        window.flowFrames = []; window.trackFlow = true;
        const record = () => {
          const root = document.querySelector('[data-testid="home-notification-modal-content"]');
          window.flowFrames.push({ sameRoot: root === window.flowRoot, homeDetail: !!document.querySelector('[data-testid="notification-detail"]'), sharedList: !!root?.innerText.includes('받은 초대') });
          if (window.trackFlow) requestAnimationFrame(record);
        }; requestAnimationFrame(record);
      });
      await button('초대 확인 4').click(); await button('참여 프로필 설정').waitFor();
      await page.screenshot({ path: path.join(out, `${width}x${height}-flow.png`) });
      await button('참여 프로필 설정').click(); await page.getByRole('textbox', { name: '다이어리 닉네임', exact: true }).waitFor();
      await button('이전 공유 화면').click(); await button('참여 프로필 설정').waitFor();
      await page.evaluate(() => globalThis.__notificationInboxQa.setInvitationStatus('A-invite-4', 'ACCEPTED'));
      await button('이전 공유 화면').click(); await button('초대 확인 4').waitFor();
      await page.getByText('이미 수락한 초대', { exact: true }).waitFor();
      const frames = await page.evaluate(() => { window.trackFlow = false; return window.flowFrames; });
      assert.ok(frames.length > 0);
      assert.ok(frames.every(frame => frame.sameRoot && !frame.homeDetail && !frame.sharedList), JSON.stringify(frames));
      fs.writeFileSync(path.join(out, `${width}x${height}-flow-frames.json`), JSON.stringify(frames, null, 2));
      assert.deepEqual(errors, []); await context.close(); console.log(`PASS ${width}x${height}: 목록·읽음·삭제·더보기·초대 이동·닫기·빈 목록·오류·로딩`);
    }
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
