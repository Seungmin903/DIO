const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const metro = process.env.METRO_PORT || '8097';
const out = path.join(__dirname, '../.expo/signup-consent-qa');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<html><body style="margin:0"><div id="root" style="display:flex;height:100vh"></div><script src="/tests/fixtures/auth-screens.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>');
    return;
  }
  const proxy = http.get(`http://localhost:${metro}${req.url}`, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
  proxy.on('error', () => { res.writeHead(502); res.end('Metro unavailable'); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [width, height] of [[390, 844], [320, 568], [1024, 768]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole('button', { name: '회원가입', exact: true }).click({ timeout: 120000 });
      const age = page.getByRole('radio', { name: '만 14세 이상입니다', exact: true });
      const underage = page.getByRole('radio', { name: '만 14세 미만입니다', exact: true });
      const next = page.getByRole('button', { name: '동의하고 계속', exact: true });
      assert.equal(await age.getAttribute('aria-checked'), 'false');
      assert.equal(await underage.getAttribute('aria-checked'), 'false');
      assert.equal(await page.getByRole('textbox', { name: '이메일', exact: true }).count(), 0);
      assert.equal(await page.getByText(/생년월일은 받지 않아요/).count(), 0);
      await page.getByRole('checkbox', { name: '필수 항목 전체 동의', exact: true }).click();
      assert.equal(await next.isDisabled(), true);
      await age.click();
      assert.equal(await age.getAttribute('aria-checked'), 'true');
      assert.equal(await next.isDisabled(), false);
      const bounds = await next.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      assert.equal(await page.getByRole('button', { name: '개인정보처리방침 보기', exact: true }).count(), 1);
      assert.equal(await page.getByRole('checkbox').count(), 7);
      await page.getByRole('checkbox', {name:'[선택] 광고성 이메일 수신 동의',exact:true}).click();
      for (const label of ['마케팅 목적 개인정보 수집·이용 동의', '광고성 이메일 수신 동의', '광고성 앱 푸시 수신 동의', '야간 광고성 앱 푸시 수신 동의']) {
        await page.getByRole('button', { name: `${label} 내용 보기`, exact: true }).click();
      }
      assert.equal(await page.evaluate(() => window.__openedLegalDocuments.length), 4);
      assert.equal(await next.isDisabled(), false);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.screenshot({ path: path.join(out, `eligibility-${width}.png`), fullPage: true });
      await next.click();
      await page.getByRole('textbox', { name: '이메일', exact: true }).waitFor();
      assert.equal(await page.getByText('생년월일', { exact: true }).count(), 0);
      await page.getByRole('button', { name: '이전 화면', exact: true }).click();
      await underage.click();
      await page.getByRole('heading', { name: '지금은 가입할 수 없어요', exact: true }).waitFor();
      assert.equal(await page.getByText(/서버에 보내거나 저장하지 않아요/).count(), 0);
      assert.equal(await page.getByRole('radio').count(), 0);
      assert.equal(await page.getByRole('textbox').count(), 0);
      assert.equal(await page.getByRole('button', { name: '구글로 로그인', exact: true }).count(), 0);
      await page.screenshot({ path: path.join(out, `underage-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: '시작 화면으로', exact: true }).click();
      await page.getByRole('button', { name: '구글로 로그인', exact: true }).click();
      assert.equal(await age.getAttribute('aria-checked'), 'false');
      await underage.click();
      await page.getByRole('heading', { name: '지금은 가입할 수 없어요', exact: true }).waitFor();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: 3 viewports, explicit age radios, underage stop for email/social, no email before confirmation, no DOB, no browser errors');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
