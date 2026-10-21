const { chromium } = require('playwright-core');
const http = require('node:http');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, '../.expo/text-box-height-results');
fs.mkdirSync(out, { recursive: true });
const metro = Number(process.env.TEXT_HEIGHT_METRO_PORT || 8096);
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body style="margin:0"><div id="root"></div><script src="/tests/fixtures/text-box-height.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>');
    return;
  }
  const proxy = http.get(`http://localhost:${metro}${req.url}`, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
  proxy.on('error', e => { res.writeHead(502); res.end(e.message); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1600 } });
    const errors = [], results = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.__setTextBoxConfig, null, { timeout: 120000 });
    const object = () => page.evaluate(() => window.__textBoxState.doc.pages[0].objects[0]);
    const drag = async (label, dy) => {
      await page.evaluate(() => window.getSelection()?.removeAllRanges());
      const target = page.getByLabel(label, { exact: true });
      const box = await target.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x, y + dy, { steps: 12 }); await page.mouse.up();
      await page.waitForTimeout(180);
    };
    for (const zoom of [0.5, 1, 2]) {
      await page.evaluate(config => window.__setTextBoxConfig(config), { zoom, width: 240, height: 10 });
      await page.waitForTimeout(250);
      await page.waitForFunction(() => window.__textBoxState.doc.pages[0].objects[0].h > 100);
      const before = await object();
      await drag('텍스트 높이 조절 아래쪽', 80 * zoom);
      const expanded = await object();
      assert.ok(expanded.h >= before.h + 79, JSON.stringify({ before, expanded }));
      await drag('텍스트 높이 조절 아래쪽', -200 * zoom);
      const bottom = await object();
      assert.ok(Math.abs(bottom.h - before.h) < 1.1, JSON.stringify({ before, bottom }));
      await drag('텍스트 높이 조절 위쪽', -80 * zoom);
      const expandedTop = await object();
      assert.ok(expandedTop.h >= bottom.h + 79, JSON.stringify({ zoom, before, bottom, expandedTop }));
      await drag('텍스트 높이 조절 위쪽', 200 * zoom);
      const top = await object();
      assert.ok(Math.abs(top.h - before.h) < 1.1);
      assert.ok(Math.abs(top.y + top.h - (expandedTop.y + expandedTop.h)) < 1.1);
      assert.equal(top.fontSize, before.fontSize); assert.equal(top.text, before.text);
      results.push({ zoom, min: before.h, expanded: expanded.h, bottom: bottom.h, top: top.h });
    }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(out, 'clamped.png') });
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
