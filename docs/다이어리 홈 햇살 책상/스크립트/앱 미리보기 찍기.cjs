// 다이어리 홈 '햇살 책상' 미리보기 스크린샷 (게스트 모드).
// 준비: npx expo export --platform web --dev --output-dir .expo/desk-web --max-workers 2
// 실행: node qa/desk-preview-browser.cjs [결과 폴더]
// 독립 프로필 · 임시 origin 에서만 돈다. 브라우저 시계를 고정해 시간대별 창빛을 찍는다.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[3]);
const out = path.resolve(process.argv[2]);
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const target = file === root ? path.join(root, 'index.html') : file;
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' }[path.extname(target)] || 'application/octet-stream'); res.end(data);
  });
});
const DIARIES = [
  ['여름 방학', '#E8B4AE', 'gingham', 'portrait'], ['새 다이어리', '#95A5D6', 'linen', 'portrait'], ['테스트용 다이어리', '#A9BFA6', 'stripe', 'landscape'],
  ['위클리 플래너', '#F0B0AA', 'check', 'portrait'], ['메모장', '#C3AEDD', 'gingham', 'portrait'], ['독서 노트', '#4A4F5C', 'dot', 'portrait'],
  ['우리 반 교환일기', '#E3A57A', 'check', 'portrait'], ['제주 여행 일기', '#9FC2C9', 'linen', 'portrait'],
].map(([title, color, pattern, orientation], i) => ({ id: `diary-${1700000000000 + i * 1000}`, title, color, pattern, createdAt: new Date(1700000000000 + i * 1000).toISOString(), templateConfig: { orientation } }));

async function shoot(browser, { name, viewport, hour, minute, view = 'carousel', next = 1 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(2026, 9, 29, hour, minute ?? 0));
  await context.addInitScript(list => localStorage.setItem('dio:diary:list:v1', JSON.stringify(list)), DIARIES);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: '게스트로 시작하기', exact: true }).click();
  await page.getByRole('button', { name: /^.+ 열기$/ }).first().waitFor({ state: 'attached' });
  if (view === 'grid') await page.getByRole('tab', { name: '한눈에 보기', exact: true }).click();
  else for (let i = 0; i < next; i++) {
    const button = page.getByRole('button', { name: '다음 다이어리', exact: true });
    if (await button.count()) await button.click(); else await page.mouse.wheel(0, 0);
  }
  await page.waitForTimeout(900);
  fs.mkdirSync(out, { recursive: true });
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await context.close();
  return { name, errors };
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const tablet = { width: 1280, height: 800 }, phone = { width: 390, height: 844 };
    const jobs = [
      { name: '01 태블릿 스와이프 15시', viewport: tablet, hour: 15 },
      { name: '02 태블릿 한눈에 15시', viewport: tablet, hour: 15, view: 'grid' },
      { name: '03 폰 스와이프 15시', viewport: phone, hour: 15 },
      { name: '04 폰 한눈에 15시', viewport: phone, hour: 15, view: 'grid' },
      { name: '05 태블릿 8시', viewport: tablet, hour: 8 },
      { name: '06 태블릿 12시', viewport: tablet, hour: 12 },
      { name: '07 태블릿 17시30분', viewport: tablet, hour: 17, minute: 30 },
      { name: '08 태블릿 22시', viewport: tablet, hour: 22 },
      { name: '09 폰 8시', viewport: phone, hour: 8 },
      { name: '10 폰 22시', viewport: phone, hour: 22 },
    ];
    for (const job of jobs) {
      const result = await shoot(browser, job);
      console.log(result.name, result.errors.length ? `pageerror ${result.errors.length}: ${result.errors[0]}` : 'ok');
    }
  } finally {
    await browser?.close(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
