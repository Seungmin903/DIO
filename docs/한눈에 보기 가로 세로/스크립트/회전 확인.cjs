// 한눈에 보기를 조금 내린 뒤 창을 가로 ↔ 세로로 돌려, 맨 위에 보던 다이어리가 그대로 맨 위 줄에 남는지 본다.
// 실행: NODE_PATH=<frontend>/node_modules node "회전 확인.cjs" <결과 폴더> [주소]
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const out = path.resolve(process.argv[2]);
const base = process.argv[3] || 'http://localhost:8081';
const DIARIES = Array.from({ length: 20 }, (_, i) => ({
  id: `diary-${1700000000000 + i * 1000}`, title: `다이어리 ${i + 1}`, color: ['#E8B4AE', '#95A5D6', '#A9BFA6', '#C3AEDD'][i % 4], pattern: 'linen',
  createdAt: new Date(1700000000000 + i * 1000).toISOString(), templateConfig: { orientation: i % 5 === 2 ? 'landscape' : 'portrait' }, trashedAt: null,
}));

async function topTitle(page) {
  // 보이는 카드 제목 중 화면 맨 위(필터 줄 아래)에 가장 가까운 것
  return page.evaluate(() => {
    const items = [...document.querySelectorAll('[role="button"][aria-label$=" 열기"]')]
      .map(el => ({ label: el.getAttribute('aria-label'), top: el.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top);
    let el = document.querySelector('[role="button"][aria-label$=" 열기"]'); while (el && !(el.scrollHeight > el.clientHeight + 5 && getComputedStyle(el).overflowY !== 'visible')) el = el.parentElement;
    const head = el ? `scrollTop=${Math.round(el.scrollTop)} viewTop=${Math.round(el.getBoundingClientRect().top)} | ` : '';
    return head + items.map(item => `${item.label.replace(' 열기', '')}@${Math.round(item.top)}`).join(' ');
  });
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('console', m => { if (m.text().startsWith('[grid]')) console.log(m.text()); });
  await context.addInitScript(list => { localStorage.setItem('dio:diary:list:v1', JSON.stringify(list)); localStorage.setItem('dio:diary:library-view:v1', 'grid'); }, DIARIES);
  await page.goto(base, { timeout: 180000 }); await page.waitForTimeout(4000);
  const guest = page.getByRole('button', { name: '게스트로 시작하기', exact: true });
  if (await guest.isVisible().catch(() => false)) await guest.click();
  const tab = page.getByRole('tab', { name: '한눈에 보기', exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await page.waitForTimeout(1500);
  await page.mouse.move(640, 500); await page.mouse.wheel(0, 800); await page.waitForTimeout(800);
  console.log('가로', await topTitle(page)); await page.screenshot({ path: path.join(out, '회전 1 가로.png') });
  await page.setViewportSize({ width: 800, height: 1280 }); await page.waitForTimeout(1200);
  console.log('세로', await topTitle(page)); await page.screenshot({ path: path.join(out, '회전 2 세로.png') });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(1200);
  console.log('다시 가로', await topTitle(page)); await page.screenshot({ path: path.join(out, '회전 3 다시 가로.png') });
  await browser.close();
})();
