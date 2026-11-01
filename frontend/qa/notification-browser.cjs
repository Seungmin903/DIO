// 독립 origin/profile: 사용자 브라우저나 실제 서버에 접근하지 않는다.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, process.env.DIO_NOTIFICATION_QA_ROOT || '../.expo/notification-web');
const out = path.resolve(__dirname, '.out/notifications');
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
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(process.env.DIO_NOTIFICATION_QA_PORT || 0), '127.0.0.1', resolve); });
    browser = await chromium.launch({ headless: true, ...(process.env.DIO_QA_BROWSER_CHANNEL ? { channel: process.env.DIO_QA_BROWSER_CHANNEL } : {}) });
    fs.mkdirSync(out, { recursive: true });
    for (const viewport of [{ width: 1280, height: 800 }, { width: 412, height: 892 }]) {
      const context = await browser.newContext({ viewport });
      const p = await context.newPage(); p.setDefaultTimeout(15000);
      const errors = []; p.on('pageerror', error => errors.push(error.message));
      await p.goto(`http://127.0.0.1:${server.address().port}`);
      await p.evaluate(() => localStorage.setItem('dio:notification-qa-sentinel', 'keep'));
      const button = name => p.getByRole('button', { name, exact: true });
      await button('목 응답 설정').click();
      await p.getByTestId('library-mock-controls').waitFor();
      await button('목 응답 설정 닫기').click();
      await p.getByTestId('library-mock-controls').waitFor({ state: 'hidden' });
      await button('알림 연결 검증').click();
      await button('알림 · 새 초대 2개').waitFor();
      await button('알림 더 보기').click(); await button('초대 확인 1').waitFor();
      await button('알림 목 응답 설정').click();
      await button('공유 버튼 연결 검증 · 새 초대 2개').waitFor();
      await button('알림 목 응답 설정').click();
      await button('알림 샘플 계정 변경').waitFor({ state: 'hidden' });
      await button('알림 목 응답 설정').click();
      await button('알림 샘플 계정 변경').waitFor();
      await button('목록 한 번 실패').click(); await button('알림 새로고침').click();
      await button('알림 목록 다시 시도').waitFor();
      await p.getByText('서버 오류로 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.', { exact: true }).waitFor();
      await button('초대 확인 1').waitFor(); // 더 보기로 받은 항목도 조회 실패 동안 보존
      assert.equal(await button('알림 더 보기').count(), 0);
      await button('알림 목록 다시 시도').click(); await button('초대 확인 4').waitFor();
      await button('목록 빈 목록').click(); await button('알림 새로고침').click();
      await p.getByText('받은 알림이 없어요.', { exact: true }).waitFor();
      await button('목록 정상').click(); await button('알림 새로고침').click(); await button('초대 확인 4').waitFor();
      // 초대 확인은 열 수 있는 초대면 안쪽 카드 없이 곧장 공유 화면(수락)으로 넘긴다. 읽음 처리 실패는 알림 창에 남는다.
      await button('읽음·삭제 한 번 실패').click(); await button('초대 확인 4').click();
      await p.getByText(/공유 화면 전달 확인: A-invite-4/).waitFor();
      await button('알림으로 돌아가기').click();
      assert.equal(await button('초대 화면으로 이동').count(), 0);
      await button('알림 처리 다시 시도').click(); await button('알림 · 새 초대 1개').waitFor();
      await button('초대 만료').click(); await button('초대 확인 4').click();
      await p.getByText('만료된 초대', { exact: true }).waitFor();
      assert.equal(await button('초대 화면으로 이동').count(), 0);
      await button('초대 상세 닫기').click(); await button('초대 권한 없음').click(); await button('초대 확인 4').click();
      await p.getByText('이 초대를 확인할 권한이 없어요.', { exact: true }).waitFor();
      assert.equal(await button('초대 화면으로 이동').count(), 0);
      assert.equal(await button('초대 상세 다시 시도').count(), 0);
      await button('초대 정상').click(); await button('알림 새로고침').click(); await button('초대 화면으로 이동').waitFor();
      await button('초대 이동 불가').click(); await button('초대 화면으로 이동').click();
      await button('초대 화면으로 이동').waitFor({ state: 'hidden' });
      await button('초대 상태 다시 확인').waitFor();
      assert.equal(await p.getByText(/공유 화면 전달 확인:/).count(), 0);
      await button('초대 정상').click(); await button('초대 상태 다시 확인').click(); await button('초대 화면으로 이동').waitFor();
      await button('초대 상세 닫기').click();
      await button('읽음·삭제 응답 유실').click(); await button('알림 삭제 4').click();
      await button('알림 처리 다시 시도').click(); await button('알림 삭제 4').waitFor({ state: 'hidden' });
      await button('읽음·삭제 응답 유실').click(); await button('모두 읽음').click();
      await button('알림 처리 다시 시도').waitFor(); await button('새 초대 도착').click(); await button('알림 처리 다시 시도').click();
      await button('초대 확인 5').waitFor(); await button('알림 · 새 초대 1개').waitFor();
      await button('알림 수 한 번 실패').click(); await button('포그라운드 복귀 재조회').click();
      await button('알림 수 다시 시도').waitFor(); await button('알림 · 새 초대 1개').waitFor();
      await button('알림 수 다시 시도').click(); await button('알림 수 다시 시도').waitFor({ state: 'hidden' });
      for (const [mode, message] of [
        ['목록 로그인 필요', '로그인이 필요해요. 로그인 후 알림을 새로고침해 주세요.'],
        ['목록 권한 없음', '알림을 확인할 권한이 없어요.'],
        ['목록 없음', '알림을 찾을 수 없어요. 목록을 새로고침해 주세요.'],
      ]) {
        await button(mode).click(); await button('알림 새로고침').click(); await p.getByText(message, { exact: true }).waitFor();
        assert.equal(await button('알림 목록 다시 시도').count(), 0);
        if (mode !== '목록 없음') assert.equal(await button('초대 확인 5').isDisabled(), true);
        await button('목록 정상').click();
        if (mode === '목록 없음') await button('알림 목록 오류 후 목록 새로고침').click(); else await button('알림 새로고침').click();
        await p.getByText(message, { exact: true }).waitFor({ state: 'hidden' });
      }
      await button('목록 네트워크 오류').click(); await button('알림 새로고침').click();
      await p.getByText('연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.', { exact: true }).waitFor();
      await button('목록 정상').click(); await button('알림 목록 다시 시도').click();
      await button('알림 목록 다시 시도').waitFor({ state: 'hidden' });
      await button('일반 알림 도착').click(); await button('알 수 없는 종류 도착').click(); await button('알림 새로고침').click();
      await button('알림 읽음 6').waitFor(); await button('알림 읽음 7').waitFor();
      assert.equal(await button('초대 확인 6').count(), 0); assert.equal(await button('초대 확인 7').count(), 0);
      await button('알림 읽음 6').click(); await button('알림 읽음 6').waitFor({ state: 'hidden' });
      assert.equal(await p.getByText('초대 상세', { exact: true }).count(), 0);
      await button('알림 삭제 7').click(); await button('알림 삭제 7').waitFor({ state: 'hidden' });
      await button('알림 샘플 계정 변경').click(); await p.getByText('B 계정 초대 4', { exact: true }).waitFor();
      assert.equal(await p.getByText('A 계정 초대 5', { exact: true }).count(), 0);
      assert.equal(await p.evaluate(() => localStorage.getItem('dio:notification-qa-sentinel')), 'keep');
      await p.screenshot({ path: path.join(out, `${viewport.width}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ viewport, result: 'passed', pageErrors: errors }));
      await context.close();
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
