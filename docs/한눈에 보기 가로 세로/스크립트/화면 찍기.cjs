// 보관함 한눈에 보기를 태블릿 가로 · 세로 여러 크기로 찍는다.
// 준비: frontend 에서 `pnpm web`(http://localhost:8081). 게스트 모드라 백엔드는 필요 없다.
// 실행: NODE_PATH=<frontend>/node_modules node "화면 찍기.cjs" <결과 폴더> [주소]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const out = path.resolve(process.argv[2]);
const base = process.argv[3] || 'http://localhost:8081';

const DIARIES = [
  ['여름 방학', '#E8B4AE', 'gingham', 'portrait'], ['새 다이어리', '#95A5D6', 'linen', 'portrait'], ['테스트용 다이어리', '#A9BFA6', 'stripe', 'landscape'],
  ['위클리 플래너', '#F0B0AA', 'check', 'portrait'], ['메모장', '#C3AEDD', 'gingham', 'portrait'], ['독서 노트', '#4A4F5C', 'dot', 'portrait'],
  ['우리 반 교환일기', '#E3A57A', 'check', 'portrait'], ['제주 여행 일기', '#9FC2C9', 'linen', 'landscape'], ['영화 기록', '#B9C7E8', 'dot', 'portrait'],
  ['가계부', '#D8C3A5', 'stripe', 'portrait'], ['운동 일지', '#A6C8B2', 'check', 'portrait'], ['레시피', '#F2C6B4', 'gingham', 'landscape'],
].map(([title, color, pattern, orientation], i) => ({
  id: `diary-${1700000000000 + i * 1000}`, title, color, pattern, createdAt: new Date(1700000000000 + i * 1000).toISOString(), templateConfig: { orientation }, trashedAt: null,
}));

// 갤럭시 탭(1280×800) · iPad Pro 11(1194×834) · iPad Air 11(1180×820) · iPad Pro 13(1366×1024) · iPad mini(1133×744)
const SIZES = (process.env.SIZES || '1280x800,1194x834,1366x1024,1133x744').split(',').flatMap(spec => {
  const [w, h] = spec.split('x').map(Number);
  return [[`${w}x${h} 가로`, { width: w, height: h }], [`${h}x${w} 세로`, { width: h, height: w }]];
});

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [name, size] of SIZES) {
      const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      await context.addInitScript(list => { localStorage.setItem('dio:diary:list:v1', JSON.stringify(list)); localStorage.setItem('dio:diary:library-view:v1', 'grid'); }, DIARIES);
      await page.goto(base, { timeout: 180000 }); await page.waitForTimeout(4000);
      // 게스트 먼저 흐름(2026-11-01)이라 바로 보관함이 뜬다. 예전 시작 화면이면 게스트로 들어간다
      const guest = page.getByRole('button', { name: '게스트로 시작하기', exact: true });
      if (await guest.isVisible().catch(() => false)) await guest.click();
      await page.getByRole('button', { name: /^.+ 열기$/ }).first().waitFor({ state: 'attached' });
      const tab = page.getByRole('tab', { name: '한눈에 보기', exact: true });
      if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      console.log('찍음', name);
      await context.close();
    }
  } finally { await browser.close(); }
})();
