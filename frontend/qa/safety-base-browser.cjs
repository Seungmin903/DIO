// Run against the normal application, without EXPO_PUBLIC_DIARY_SOURCE.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--no-proxy-server', '--disable-gpu'] });
  try {
    fs.mkdirSync('qa/.out/safety', { recursive: true });
    for (const viewport of [{ width: 412, height: 892 }, { width: 1280, height: 800 }]) {
      const context = await browser.newContext({ viewport });
      const p = await context.newPage(); const errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await p.goto(process.env.DIO_SAFETY_BASE_QA_URL || 'http://172.30.1.97:8096', { timeout: 180000 });
      await p.getByRole('heading', { name: '내 다이어리', exact: true }).waitFor({ timeout: 180000 });
      assert.equal(await p.getByRole('button', { name: '게스트로 시작하기', exact: true }).count(), 0);
      assert.equal(await p.getByRole('textbox', { name: '이메일', exact: true }).count(), 0);
      if (viewport.width === 412) {
        await p.getByRole('tab', { name: '내 다이어리', exact: true }).waitFor();
        const bottom = p.getByRole('tablist').filter({ has: p.getByRole('tab', { name: '꾸미기 공방', exact: true }) });
        assert.equal(await bottom.getByRole('tab').count(), 5);
      }
      await p.screenshot({ path: `qa/.out/safety/current-library-${viewport.width}.png` });
      assert.deepEqual(errors, []);
      await context.close(); console.log(`Current develop guest/library preserved: ${viewport.width}x${viewport.height}`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
