// Start normal Expo with EXPO_PUBLIC_API_BASE_URL=https://qa-auth.invalid/api.
// All QA API requests are intercepted; this does not log in to a real account.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--no-proxy-server', '--disable-gpu'] });
  try {
    fs.mkdirSync('qa/.out/auth-recovery', { recursive: true });
    for (const width of [412, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 892 } });
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      let mode = 'normal', logins = 0;
      await page.route('https://qa-auth.invalid/**', async route => {
        const path = new URL(route.request().url()).pathname;
        const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) {
          if (mode === 'network' && path.endsWith('/refresh')) return route.abort('connectionfailed');
          if (mode === 'expired' && path.endsWith('/refresh')) return respond({ code: 'INVALID_TOKEN' }, 401);
          if (path.endsWith('/login')) logins++;
          return respond({ user: { userId: '101', email: 'qa-recovery@example.com', nickname: 'QA회원', profilePhotoUrl: null }, accessToken: 'qa-access', refreshToken: 'qa-refresh', expiresIn: 900 });
        }
        if (path.endsWith('/member/diaries') && mode !== 'normal') return respond({ code: 'INVALID_TOKEN' }, 401);
        if (path.endsWith('/unread-count')) return respond({ unreadCount: 0 });
        if (path.endsWith('/me')) return respond({ userId: '101', email: 'qa-recovery@example.com', nickname: 'QA회원', profilePhotoUrl: null });
        return respond({ items: [], nextCursor: null, hasNext: false });
      });
      const button = name => page.getByRole('button', { name, exact: true });
      try {
        await page.goto(process.env.DIO_AUTH_RECOVERY_QA_URL || 'http://[::1]:8098', { timeout: 180000 });
        await page.getByRole('heading', { name: '내 다이어리', exact: true }).waitFor({ timeout: 180000 });
        if (width === 412) {
          await page.getByRole('tab', { name: '내 공간', exact: true }).click();
          await button('로그인 · 회원가입').click();
        } else await button('로그인 하기').click();
        await page.getByRole('textbox', { name: '이메일', exact: true }).fill('qa-recovery@example.com');
        await page.getByLabel('비밀번호', { exact: true }).fill('QaPassword123!');
        await button('로그인').click();
        await page.getByRole('heading', { name: '내 다이어리', exact: true }).waitFor();
        // The next GET rejects the access token; refresh then fails at the network layer.
        mode = 'network';
        await page.getByText('즐겨찾기', { exact: true }).click();
        await page.getByText(/서버에 연결하지 못했어요/).first().waitFor();
        assert.equal(await button('다시 로그인').count(), 0);
        assert.equal(logins, 1);
        await page.screenshot({ path: `qa/.out/auth-recovery/network-${width}.png` });
        mode = 'normal'; await button('회원 조회 다시 시도').click();
        await page.getByText(/서버에 연결하지 못했어요/).waitFor({ state: 'hidden' });
        mode = 'expired';
        await page.getByText('전체 기록', { exact: true }).click();
        await page.getByText('로그인이 만료됐어요. 다시 로그인해 주세요.', { exact: true }).first().waitFor();
        assert.equal(await page.getByRole('textbox', { name: '이메일', exact: true }).inputValue(), 'qa-recovery@example.com');
        assert.equal(await page.getByLabel('비밀번호', { exact: true }).inputValue(), '');
        await page.screenshot({ path: `qa/.out/auth-recovery/expired-${width}.png` });
        assert.deepEqual(errors, []);
        console.log(`Auth recovery browser QA passed: ${width}`);
      } catch (error) { console.error((await page.locator('body').innerText()).slice(-3000)); throw error; }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
