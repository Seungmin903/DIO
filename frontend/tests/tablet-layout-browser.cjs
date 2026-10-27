const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '../.expo/tablet-layout-export');
const out = path.resolve(__dirname, '../.expo/tablet-layout-results');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (file === root) file = path.join(root, 'index.html');
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'msedge' }) });
  try {
    const results = [];
    for (const [width, height] of [[1280,800],[1366,1024],[2000,1200],[1920,800],[768,1024],[390,844],[844,390]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => {
        localStorage.setItem('dio:diary:list:v1', JSON.stringify([{ id: 'layout-qa', title: '배치 검증', type: '개인', color: '#9DABD8', pattern: 'linen', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }]));
        localStorage.setItem('dio:editor:doc:v4:layout-qa', JSON.stringify({ id: 'layout-qa', title: '배치 검증', pages: [{ id: 'layout-page', canvasWidth: 1200, canvasHeight: 800, objects: [] }] }));
      });
      const button = name => page.getByRole('button', { name, exact: true });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await button('게스트로 시작하기').click();
      await button('배치 검증 열기').waitFor();
      const phone = Math.min(width, height) < 600;
      if (!phone) {
        const rail = page.getByLabel('메뉴 펼치기', { exact: true }).locator('..').locator('..');
        const box = await rail.boundingBox();
        assert.ok(Math.abs(box.x) < 1, `rail outside gap at ${width}: ${box.x}`);
        assert.ok(Math.abs(box.height - height) < 1, `rail height at ${width}`);
        await button('메뉴 펼치기').click();
        await button('메뉴 접기').waitFor();
        await button('내 공간').click();
        await button('휴지통').click();
        await button('모든 다이어리').click();
        await button('메뉴 접기').click();
      } else {
        assert.equal(await button('메뉴 펼치기').count(), 0);
        assert.ok(await page.getByRole('tab').count() > 0);
      }
      await page.screenshot({ path: path.join(out, `library-${width}.png`) });
      await button('배치 검증 열기').click();
      const canvas = page.getByLabel('손바닥 캔버스', { exact: true });
      await canvas.waitFor();
      await page.waitForFunction(() => {
        const box = document.querySelector('[aria-label="손바닥 캔버스"]')?.getBoundingClientRect();
        return box && box.width > 10 && box.height > 10;
      });
      const box = await canvas.boundingBox();
      assert.ok(Math.abs(box.width / box.height - 1.5) < 0.002, `paper stretched at ${width}: ${box.width}/${box.height}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const doc = JSON.parse(await page.evaluate(() => localStorage.getItem('dio:editor:doc:v4:layout-qa')));
      assert.deepEqual([doc.pages[0].canvasWidth, doc.pages[0].canvasHeight], [1200,800]);
      await page.screenshot({ path: path.join(out, `editor-${width}.png`) });
      if (!phone) {
        await button('페이지 목록').click();
        await page.waitForTimeout(300); // 패널 전환 애니메이션 종료 후 실제 속지 측정
        let panelBox = await canvas.boundingBox();
        assert.ok(Math.abs(panelBox.width / panelBox.height - 1.5) < 0.002);
        await button('페이지 목록').click();
        await button('레이어').click();
        await page.waitForTimeout(300);
        panelBox = await canvas.boundingBox();
        assert.ok(Math.abs(panelBox.width / panelBox.height - 1.5) < 0.002);
        await button('레이어').click();
      }
      assert.deepEqual(errors, []);
      results.push({ width, height, phone, paperRatio: box.width / box.height });
      await page.close();
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log('PASS: 7 viewport sizes, rail edge and height, library navigation, phone tabs, unstretched paper and stored page dimensions, no browser errors');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
