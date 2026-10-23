const { chromium } = require('playwright-core');
const http = require('node:http');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const out = path.join(__dirname, '../.expo/text-font-results');
fs.mkdirSync(out, { recursive: true });
const metro = Number(process.env.TEXT_FONT_METRO_PORT || 8096);
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body style="margin:0"><div id="root"></div><script src="/tests/fixtures/text-font-styles.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>');
    return;
  }
  const proxy = http.get(`http://localhost:${metro}${req.url}`, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
  proxy.on('error', e => { res.writeHead(502); res.end(e.message); });
});
function ink(buffer) {
  const png = UPNG.decode(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const rgba = new Uint8Array(UPNG.toRGBA8(png)[0]);
  let value = 0;
  for (let i = 0; i < rgba.length; i += 4) value += (255 - (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3) * rgba[i + 3] / 255;
  return value;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1100 }, deviceScaleFactor: 1 });
    const errors = [], results = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.__fontFilesReady, null, { timeout: 120000 });
    const select = async label => {
      await page.getByRole('button', { name: '글꼴 선택', exact: true }).click();
      await page.getByRole('button', { name: label, exact: true }).click();
    };
    const sample = page.getByTestId('font-sample');
    for (const [label, family] of [['나눔고딕', 'NanumGothic'], ['나눔명조', 'NanumMyeongjo']]) {
      await select(label);
      await page.waitForFunction(f => getComputedStyle(document.querySelector('[data-testid="font-sample"]').firstElementChild).fontFamily.includes(f), family);
      const regular = await sample.screenshot({ path: path.join(out, `${family}-regular.png`) });
      const button = page.getByRole('button', { name: '굵게', exact: true });
      assert.equal(await button.isDisabled(), false);
      await button.click();
      await page.waitForFunction(f => getComputedStyle(document.querySelector('[data-testid="font-sample"]').firstElementChild).fontFamily.includes(f), family + 'Bold');
      const bold = await sample.screenshot({ path: path.join(out, `${family}-bold.png`) });
      assert.ok(ink(bold) > ink(regular), `${family}: 실제 Bold 글자의 먹 면적 증가`);
      assert.equal(await page.getByRole('button', { name: '기울임', exact: true }).isDisabled(), true);
      await button.click();
      await page.waitForFunction(() => window.__fontFixtureSettings?.bold === false);
      results.push({ font: family, regularInk: ink(regular), boldInk: ink(bold), italicDisabled: true });
    }
    // 지원 글꼴의 활성 서식을 가지고 미지원 글꼴로 이동해 실제 선택 경로의 정규화를 확인한다.
    await select('맑은 고딕');
    await page.getByRole('button', { name: '굵게', exact: true }).click();
    await page.getByRole('button', { name: '기울임', exact: true }).click();
    for (const label of ['나눔손글씨 펜', '푸어스토리']) {
      await select(label);
      assert.equal(await page.getByRole('button', { name: '굵게', exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: '기울임', exact: true }).isDisabled(), true);
      assert.ok(await page.getByText('이 글꼴은 굵게·기울임을 지원하지 않아요.', { exact: true }).isVisible());
      const settings = await page.evaluate(() => window.__fontFixtureSettings);
      assert.equal(settings.bold, false); assert.equal(settings.italic, false);
      assert.equal(await page.getByRole('button', { name: '밑줄', exact: true }).isDisabled(), false);
      results.push({ font: label, boldDisabled: true, italicDisabled: true });
    }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(out, 'unsupported-styles.png') });
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
