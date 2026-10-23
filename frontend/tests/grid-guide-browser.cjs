const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const metro = Number(process.env.GRID_METRO_PORT || 8094);
const out = path.join(__dirname, '../.expo/grid-guide-results');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body style="margin:0"><div id="root" style="display:flex"></div><script src="/tests/fixtures/grid-guide.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>');
    return;
  }
  const proxy = http.get(`http://127.0.0.1:${metro}${req.url}`, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
  proxy.on('error', e => { res.writeHead(502); res.end(e.message); });
});
function pixels(buffer) {
  const decoded = UPNG.decode(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  return new Uint8Array(UPNG.toRGBA8(decoded)[0]);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 1100 }, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], results = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.__setGridFixture, null, { timeout: 120000 });
    const canvas = page.getByTestId('grid-page');
    for (const config of [
      { portrait: false, zoom: 0.75, cream: false },
      { portrait: true, zoom: 0.5, cream: true },
    ]) {
      const capture = async mode => {
        await page.evaluate(value => window.__setGridFixture(value), { ...config, mode });
        const svg = canvas.locator(`svg[id="2026-monthly-01-${config.portrait ? 'portrait' : 'landscape'}"]`);
        await svg.waitFor();
        await page.waitForFunction(({ id, transparent }) => {
          const rect = document.querySelector(`svg[id="${id}"] > rect`);
          return rect && (rect.getAttribute('fill') === 'none') === transparent;
        }, { id: `2026-monthly-01-${config.portrait ? 'portrait' : 'landscape'}`, transparent: mode === 'fixed' });
        return pixels(await canvas.screenshot({ path: path.join(out, `${config.portrait ? 'portrait' : 'landscape'}-${mode}.png`) }));
      };
      const base = await capture('none'), old = await capture('old'), fixed = await capture('fixed');
      assert.equal(base.length, fixed.length);
      let oldCoveredInk = 0, fixedCoveredInk = 0, gridPixels = 0;
      for (let i = 0; i < base.length; i += 4) {
        const opaqueInk = base[i] === 41 && base[i + 1] === 41 && base[i + 2] === 41;
        if (opaqueInk && old[i] > 60) oldCoveredInk++;
        if (opaqueInk && fixed[i] > 60) fixedCoveredInk++;
        // 소수 배율의 1px 선은 안티앨리어싱되므로 원색 일치 대신 파란 선의 색차를 확인한다.
        if (fixed[i + 2] - fixed[i] > 8 && fixed[i + 1] - fixed[i] > 3) gridPixels++;
      }
      assert.ok(oldCoveredInk > 0, '기존 순서에서 글씨를 덮는 격자 픽셀 재현');
      assert.equal(fixedCoveredInk, 0, '수정 후 불투명 글씨를 덮는 픽셀 없음');
      assert.ok(gridPixels > 0, '수정 후에도 격자 표시');
      results.push({ ...config, oldCoveredInk, fixedCoveredInk, gridPixels });
    }
    await page.evaluate(() => window.__setGridFixture({ mode: 'fixed', blank: true, cream: true, zoom: 0.75 }));
    await canvas.locator('svg').first().waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-testid="grid-page"] svg[id^="2026-monthly"]'));
    const blank = pixels(await canvas.screenshot({ path: path.join(out, 'blank-cream-grid.png') }));
    let cream = 0, grid = 0;
    for (let i = 0; i < blank.length; i += 4) {
      if (blank[i] === 255 && blank[i + 1] === 248 && blank[i + 2] === 231) cream++;
      if (blank[i + 2] - blank[i] > 8 && blank[i + 1] - blank[i] > 3) grid++;
    }
    assert.ok(cream > 0 && grid > 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, blank: { cream, grid }, errors }, null, 2));
    console.log(JSON.stringify({ results, blank: { cream, grid }, errors }));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
