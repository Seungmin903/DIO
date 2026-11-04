const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const metro = process.env.METRO_PORT || '8133';
const out = path.join(__dirname, '../.expo/app-error-recovery-qa');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((request, response) => {
  if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root" style="display:flex;height:100dvh"></div><script src="/tests/fixtures/app-error-recovery.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>');
    return;
  }
  const proxy = http.get(`http://localhost:${metro}${request.url}`, upstream => {
    response.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(response);
  });
  proxy.on('error', () => { response.writeHead(502); response.end('Metro unavailable'); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage();
    for (const [width, height] of [[320, 568], [390, 844], [1024, 768]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole('heading', { name: '화면을 불러오지 못했어요', exact: true }).waitFor({ timeout: 120000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.evaluate(() => localStorage.setItem('qa:preserved-diary', 'preserved'));
      await page.getByRole('button', { name: '다시 시도', exact: true }).click();
      await page.getByRole('heading', { name: '화면을 불러오지 못했어요', exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, `error-${width}.png`) });
      await page.evaluate(() => { window.__stabilityQA.broken = false; });
      await page.getByRole('button', { name: '다시 시도', exact: true }).click();
      await page.getByRole('heading', { name: '정상 화면으로 돌아왔어요', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('qa:preserved-diary')), 'preserved');
      await page.evaluate(() => window.__stabilityQA.failModule());
      await page.getByRole('heading', { name: '화면을 불러오지 못했어요', exact: true }).waitFor();
      await page.addStyleTag({ content: '[role="heading"]{font-size:40px!important;line-height:60px!important}' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.evaluate(() => { window.__stabilityQA.loadBroken = false; });
      await page.getByRole('button', { name: '다시 시도', exact: true }).click();
      await page.getByRole('heading', { name: '정상 화면으로 돌아왔어요', exact: true }).waitFor();
      // Real browser event observation must not depend on a particular screen being mounted.
      await page.evaluate(() => { void Promise.reject(new Error('QA private rejection')); });
      await page.waitForTimeout(100);
      const rows = await page.evaluate(() => window.__stabilityQA.read());
      assert.ok(rows.some(row => row.source === 'render'));
      assert.ok(rows.some(row => row.source === 'unhandled_rejection'));
      assert.doesNotMatch(JSON.stringify(rows), /private|token=|do-not-store|stack|message/);
      console.log(`PASS ${width}x${height}: render/module error, retry, persistent fault, storage preservation, diagnostics`);
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
