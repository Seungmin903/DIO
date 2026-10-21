const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const out = path.join(__dirname, '../.expo/pencil-texture-results');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body style="margin:0"><div id="root"></div><script src="/tests/fixtures/pencil-texture.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>');
  } else {
    const proxy = http.get(`http://127.0.0.1:8097${req.url}`, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
    proxy.on('error', e => { res.writeHead(502); res.end(e.message); });
  }
});
function image(buffer) {
  const decoded = UPNG.decode(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  return { width: decoded.width, height: decoded.height, data: new Uint8Array(UPNG.toRGBA8(decoded)[0]) };
}
function inkStats(buffer, paper) {
  const { width, height, data } = image(buffer), levels = [], columns = new Set();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = data[(y * width + x) * 4];
    if (value < paper - 15) { levels.push(value); columns.add(x); }
  }
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  return { ink: levels.length, columns: [...columns].sort((a,b) => a-b), deviation: Math.sqrt(levels.reduce((a,b) => a + (b - mean) ** 2, 0) / levels.length) };
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1400 }, deviceScaleFactor: 2 });
    const errors = [], results = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.__setPencilFixture, null, { timeout: 120000 });
    async function configure(config) {
      await page.evaluate(value => window.__setPencilFixture(value), config);
      await page.waitForFunction(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    }
    await page.getByTestId('pencil-comparison').screenshot({ path: path.join(out, 'before-after.png') });
    for (const zoom of [0.5, 1, 2.5]) for (const paper of ['#FFFFFF', '#FAF8F2']) {
      const config = { zoom, paper, count: 1, restored: false };
      await configure(config);
      for (const width of [1, 8, 16]) {
        const locator = page.getByTestId(`after-${width}`).locator('svg');
        const markup = await locator.evaluate(node => node.outerHTML);
        const before = await locator.screenshot();
        const stats = inkStats(before, parseInt(paper.slice(1, 3), 16));
        assert.ok(stats.ink > 0, `visible ink width=${width}, zoom=${zoom}`);
        assert.ok(stats.columns.length > 2);
        for (let i = 1; i < stats.columns.length; i++) assert.equal(stats.columns[i] - stats.columns[i-1], 1, 'no fully empty interior column');
        assert.equal(await locator.locator('pattern path').count(), 2, 'bounded SVG grain nodes');
        assert.ok((await locator.evaluate(node => [...node.querySelectorAll('pattern path')].reduce((sum, path) => sum + path.getAttribute('d').length, 0))) < 20000, 'per-stroke grain path stays compact');
        await configure({ ...config, restored: true });
        assert.equal(await locator.evaluate(node => node.outerHTML), markup, 'JSON restore preserves exact SVG geometry and grain');
        const restored = image(await locator.screenshot()).data, original = image(before).data;
        assert.equal(restored.length, original.length);
        let maxDelta = 0, sumDelta = 0;
        for (let i = 0; i < original.length; i++) {
          const delta = Math.abs(restored[i] - original[i]);
          maxDelta = Math.max(maxDelta, delta); sumDelta += delta;
        }
        // Edge may quantize composited alpha by a few 8-bit levels between frames.
        assert.ok(maxDelta <= 3 && sumDelta / original.length < 0.25, `restore pixel drift: max=${maxDelta}, mean=${sumDelta/original.length}`);
        results.push({ zoom, paper, width, ink: stats.ink, deviation: stats.deviation, restoreMaxDelta: maxDelta, restoreMeanDelta: sumDelta/original.length });
      }
    }
    await configure({ zoom: 2.5, paper: '#FFFFFF', count: 1 });
    const tones = [];
    for (const passes of [1, 3, 6]) {
      const sample = image(await page.getByTestId(`tone-${passes}`).screenshot());
      let sum = 0;
      for (let i = 0; i < sample.data.length; i += 4) sum += 255 - sample.data[i];
      tones.push(sum / (sample.data.length / 4));
    }
    assert.ok(tones[1] > tones[0] && tones[2] > tones[1], 'repeated passes build graphite tone');
    const dot = inkStats(await page.getByTestId('dot').locator('svg').screenshot(), 255);
    assert.ok(dot.ink > 0, 'single tap visible');
    // Quantify grain inside a thick straight stroke, excluding its antialiased edge.
    const sample = image(await page.getByTestId('solid-sample').locator('svg').screenshot());
    const values = [];
    for (let y = Math.floor(sample.height/2)-3; y <= Math.floor(sample.height/2)+3; y++)
      for (let x = 60; x < sample.width-60; x++) values.push(sample.data[(y*sample.width+x)*4]);
    assert.ok(Math.max(...values)-Math.min(...values) > 70, 'visible graphite tonal contrast');
    const start = performance.now();
    await configure({ zoom: 1, paper: '#FFFFFF', count: 500 });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="stress"] svg').length === 500);
    const stressMs = performance.now()-start;
    const ids = await page.locator('pattern').evaluateAll(nodes => nodes.map(n => n.id));
    assert.equal(new Set(ids).size, ids.length, 'unique pattern ids across accumulated strokes');
    assert.deepEqual(errors, []);
    const report = { results, buildupDarkness: tones, dotInk: dot.ink, tonalRange: Math.max(...values)-Math.min(...values), stress: { strokes: 500, elapsedMs: stressMs, environment: 'desktop Edge headless; fixture update only; not iPad input latency' }, errors };
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
