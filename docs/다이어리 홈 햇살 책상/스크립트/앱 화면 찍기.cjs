// 지금 앱의 태블릿 가로 스와이프 화면을 찍는다: 원본(ref.png)과 바탕을 뺀 검은 · 흰 바탕 두 장(ui-black · ui-white → "앱 화면 층.py"가 ui.png 로 합침).
// 실행: NODE_PATH=<frontend>/node_modules node "앱 화면 찍기.cjs" <web export 폴더> <결과 폴더>
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
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

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await context.addInitScript(list => localStorage.setItem('dio:diary:list:v1', JSON.stringify(list)), DIARIES);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: '게스트로 시작하기', exact: true }).click();
    await page.getByRole('button', { name: /^.+ 열기$/ }).first().waitFor({ state: 'attached' });
    await page.getByRole('button', { name: '다음 다이어리', exact: true }).click();
    await page.waitForTimeout(1200);
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, 'ref.png') });
    // 앱 바탕색(#F1F3F7)만 투명하게: 흰 사이드 메뉴 · 버튼 · 표지는 그대로
    const cleared = await page.evaluate(() => {
      let n = 0;
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
      for (const el of document.querySelectorAll('*')) {
        const full = el.getBoundingClientRect().width >= window.innerWidth && el.getBoundingClientRect().height >= window.innerHeight;
        if (getComputedStyle(el).backgroundColor === 'rgb(241, 243, 247)' || (full && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)')) { el.style.setProperty('background-color', 'transparent', 'important'); n++; }
      }
      // 옆 다이어리: 투명하게 하면 책상이 표지를 뚫고 비친다 → 불투명하게 두고 표지에 흐린 막, 이름 · 페이지 수만 흐리게
      for (const wrap of document.querySelectorAll('*')) {
        if (getComputedStyle(wrap).opacity !== '0.36') continue;
        const card = wrap.querySelector('[aria-label$=" 열기"]');
        if (!card) continue;
        wrap.style.setProperty('opacity', '1', 'important');
        const cover = [...card.children[0].querySelectorAll('*')].reverse().find(el => parseFloat(getComputedStyle(el).borderTopRightRadius) > 10 && parseFloat(getComputedStyle(el).borderTopLeftRadius) > 5);
        if (cover) {
          const cs = getComputedStyle(cover);
          const veil = document.createElement('div');
          Object.assign(veil.style, { position: 'absolute', inset: '0', zIndex: 50, pointerEvents: 'none', background: 'rgba(250,248,243,0.52)', borderRadius: `${cs.borderTopLeftRadius} ${cs.borderTopRightRadius} ${cs.borderBottomRightRadius} ${cs.borderBottomLeftRadius}` });
          cover.appendChild(veil);
        }
        if (card.children[1]) card.children[1].style.opacity = '0.45';
      }
      return n;
    });
    // 검은 바탕 · 흰 바탕으로 두 번 찍어 두 장의 차이로 투명도를 구한다 (Edge 는 투명 배경 캡처를 하지 않는다)
    for (const [bg, file] of [['#000000', 'ui-black.png'], ['#FFFFFF', 'ui-white.png']]) {
      await page.evaluate(color => { document.documentElement.style.background = color; document.body.style.background = color; }, bg);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(out, file) });
    }
    // 소품을 두면 안 되는 자리(버튼 · 글자 · 표지)를 화면 좌표로 남긴다
    const boxes = await page.evaluate(() => [...document.querySelectorAll('[role="button"],[role="tab"],button,[aria-label]')]
      .map(el => { const r = el.getBoundingClientRect(); return { label: el.getAttribute('aria-label') || el.textContent.slice(0, 20), x: r.x, y: r.y, w: r.width, h: r.height }; })
      .filter(b => b.w > 0 && b.h > 0));
    fs.writeFileSync(path.join(out, 'boxes.json'), JSON.stringify(boxes, null, 1));
    console.log('ok cleared', cleared, 'errors', errors.length ? errors[0] : 0);
    await context.close();
  } finally {
    await browser?.close(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
