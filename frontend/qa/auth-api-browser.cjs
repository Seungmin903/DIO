// Used by AuthBrowserTests against a disposable H2-backed HTTP server.
const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const backend = process.argv[2];
const root = path.resolve(__dirname, '../.expo/auth-api-export');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + (req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(18081, '127.0.0.1', resolve); });
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    // The exported app retains its developer API URL; proxy to the isolated test server.
    // Responses are real backend HTTP responses, with no mocked API data.
    await page.route('**/api/v1/auth/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const response = await route.fetch({ url: `${backend}${url.pathname}`, headers: { ...request.headers(), origin: 'http://127.0.0.1:18081' } });
      requests.push({ path: url.pathname, status: response.status() });
      await route.fulfill({ response });
    });
    await page.goto('http://127.0.0.1:18081');
    const email = () => page.getByRole('textbox', { name: '이메일', exact: true });
    const password = () => page.getByLabel('비밀번호', { exact: true });
    const button = name => page.getByRole('button', { name, exact: true });
    await email().fill('browser-auth@example.com'); await password().fill('wrong12345'); await button('로그인').click();
    await page.getByText('이메일 또는 비밀번호를 확인해 주세요.').waitFor();
    await password().fill('DioMember123!'); await button('로그인').click();
    await page.getByRole('tab', { name: '내 공간', exact: true }).click();
    await page.getByText('브라우저회원님의 기록 공간').waitFor();
    await button('로그아웃').click(); await button('회원가입').waitFor();
    assert.ok(requests.some(item => item.path.endsWith('/login') && item.status === 200));
    assert.ok(requests.some(item => item.path.endsWith('/logout') && item.status === 204));
    await button('회원가입').click(); await email().fill('new-browser@example.com');
    await password().fill('DioMember123!'); await page.getByLabel('비밀번호 확인', { exact: true }).fill('DioMember123!');
    await button('다음').click(); await page.getByRole('textbox', { name: '닉네임', exact: true }).fill('새회원');
    await button('닉네임 중복 확인').click(); await page.getByText('사용할 수 있는 닉네임이에요.').waitFor();
    await page.getByRole('checkbox', { name: '전체 동의', exact: true }).click(); await button('가입 완료').click();
    await page.getByText('회원가입 전에 이메일 인증이 필요해요. 현재 화면에는 인증 입력 단계가 아직 없어요.').waitFor();
    assert.ok(requests.some(item => item.path.endsWith('/nickname-availability') && item.status === 200));
    assert.ok(!requests.some(item => item.path.endsWith('/signup')));
    assert.deepEqual(errors, []);
    console.log('PASS: real HTTP login error/success, existing profile, logout, nickname availability, signup blocked without verification; no new UI');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
