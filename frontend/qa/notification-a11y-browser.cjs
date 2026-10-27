const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, process.env.DIO_NOTIFICATION_QA_ROOT || '../.expo/notification-web');
const out = path.resolve(__dirname, '.out/notification-a11y');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const target = file === root ? path.join(root, 'index.html') : file;
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' }[path.extname(target)] || 'application/octet-stream'); res.end(data);
  });
});
(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(process.env.DIO_NOTIFICATION_A11Y_PORT || 18152), '127.0.0.1', resolve); });
    browser = await chromium.launch({ channel: 'msedge', headless: true }); fs.mkdirSync(out, { recursive: true });
    for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 568, height: 320 }, { width: 412, height: 892 }, { width: 1280, height: 800 }]) {
      const context = await browser.newContext({ viewport }); const p = await context.newPage(); p.setDefaultTimeout(12000);
      const errors = []; p.on('pageerror', error => errors.push(error.message));
      const button = name => p.getByRole('button', { name, exact: true });
      await p.goto(`http://127.0.0.1:${server.address().port}`); await button('알림 연결 검증').click();
      const loading = p.getByRole('progressbar', { name: '알림 목록 불러오는 중이에요.', exact: true });
      await loading.waitFor(); assert.equal(await loading.getAttribute('aria-busy'), 'true');
      // 모달 전환 중 배경 보관함의 로딩까지 섞지 않고 알림 화면을 검사한다.
      const screen = p.getByTestId('notification-panel').locator('..');
      for (const progress of await screen.getByRole('progressbar').all()) assert.ok(await progress.getAttribute('aria-label'), await progress.evaluate(el => el.outerHTML));
      assert.equal(await p.getByTestId('notification-empty').count(), 0);
      await p.getByRole('heading', { name: '받은 알림', exact: true }).waitFor(); await button('초대 확인 4').waitFor();
      await button('알림 목 응답 설정').click();
      const panel = p.getByTestId('notification-panel'), controls = p.getByTestId('notification-mock-controls');
      const panelBox = await panel.boundingBox(); assert.ok(panelBox.height >= 90, JSON.stringify(panelBox));
      assert.ok(await controls.evaluate(el => el.scrollWidth <= el.clientWidth + 1), '설정 영역 가로 잘림');
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '문서 가로 넘침');
      await button('목록 빈 목록').click(); await button('알림 새로고침').click(); await loading.waitFor();
      assert.equal(await p.getByTestId('notification-empty').count(), 0);
      const empty = p.getByTestId('notification-empty'); await empty.waitFor(); assert.equal(await empty.getAttribute('aria-live'), 'polite');
      await empty.scrollIntoViewIfNeeded();
      const emptyBox = await empty.boundingBox(); assert.ok(emptyBox.y >= 0 && emptyBox.y + emptyBox.height <= viewport.height + 1);
      await p.screenshot({ path: path.join(out, `${viewport.width}x${viewport.height}-empty.png`) });
      await button('목록 한 번 실패').click(); await button('알림 새로고침').click();
      const alert = p.getByRole('alert').filter({ hasText: '서버 오류로 요청을 처리하지 못했어요.' });
      await alert.waitFor(); assert.equal(await alert.getAttribute('aria-live'), 'polite');
      await alert.scrollIntoViewIfNeeded();
      const alertBox = await alert.boundingBox(); assert.ok(alertBox.y >= 0 && alertBox.y + alertBox.height <= viewport.height + 1);
      await p.screenshot({ path: path.join(out, `${viewport.width}x${viewport.height}-error.png`) });
      const retry = button('알림 목록 다시 시도'); await button('알림 새로고침').focus();
      let reachedRetry = false;
      for (let i = 0; i < 12; i++) { await p.keyboard.press('Tab'); reachedRetry = await retry.evaluate(el => document.activeElement === el); if (reachedRetry) break; }
      assert.ok(reachedRetry, 'Tab으로 오류 재시도 버튼에 도달하지 못함');
      const retryBox = await retry.boundingBox(); assert.ok(retryBox.height >= 44 && retryBox.width >= 44);
      assert.ok(retryBox.y >= 0 && retryBox.y + retryBox.height <= viewport.height + 1);
      await p.keyboard.press('Enter'); await alert.waitFor({ state: 'hidden' }); await button('초대 확인 4').waitFor();
      const deletion = button('알림 삭제 4'); await deletion.scrollIntoViewIfNeeded();
      const target = await deletion.boundingBox(), bounds = await panel.boundingBox();
      assert.ok(target.y >= bounds.y - 1 && target.y + target.height <= bounds.y + bounds.height + 1, '행 버튼 스크롤 도달 불가');
      const disabled = button('알림 새로고침'); await disabled.click(); await loading.waitFor();
      assert.equal(await button('모두 읽음').getAttribute('aria-disabled'), 'true'); await loading.waitFor({ state: 'hidden' });
      await p.screenshot({ path: path.join(out, `${viewport.width}x${viewport.height}.png`) });
      assert.deepEqual(errors, []); console.log(JSON.stringify({ viewport, result: 'passed', checks: ['loading-name/busy', 'error-alert', 'empty-live', 'keyboard-retry', 'touch-size', 'scroll-reach', 'no-horizontal-overflow'], pageErrors: errors }));
      await context.close();
    }
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
