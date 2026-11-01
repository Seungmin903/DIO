// 지금 앱의 6개 화면(로그인 · 회원가입 · 다이어리 홈 · 꾸미기 공방 · 내 공간 · 휴지통)을 태블릿 · 폰 크기로 찍는다.
// 준비: frontend 에서 `pnpm web`(http://localhost:8081)이 떠 있어야 한다. 게스트 모드로 들어가므로 백엔드는 필요 없다.
// 실행: NODE_PATH=<frontend>/node_modules node "현재 화면 찍기.cjs" <결과 폴더> [주소]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const out = path.resolve(process.argv[2]);
const base = process.argv[3] || 'http://localhost:8081';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const DIARIES = [
  ['여름 방학', '#E8B4AE', 'gingham', 'portrait'], ['새 다이어리', '#95A5D6', 'linen', 'portrait'], ['테스트용 다이어리', '#A9BFA6', 'stripe', 'landscape'],
  ['위클리 플래너', '#F0B0AA', 'check', 'portrait'], ['메모장', '#C3AEDD', 'gingham', 'portrait'], ['독서 노트', '#4A4F5C', 'dot', 'portrait'],
  ['우리 반 교환일기', '#E3A57A', 'check', 'portrait'], ['제주 여행 일기', '#9FC2C9', 'linen', 'portrait'],
].map(([title, color, pattern, orientation], i) => ({
  id: `diary-${1700000000000 + i * 1000}`, title, color, pattern, createdAt: new Date(1700000000000 + i * 1000).toISOString(), templateConfig: { orientation },
  // 뒤 둘은 휴지통에 둔다(하나는 만료 임박)
  trashedAt: i === 6 ? new Date(NOW - 2 * DAY).toISOString() : i === 7 ? new Date(NOW - 28 * DAY).toISOString() : null,
}));

// NIGHT=1 이면 밤 10시 홈만 '홈 스와이프 <기기> 밤.jpg' 로 찍는다(실시간 창빛이 밤에는 회색으로 가라앉는 것을 비교하려고)
const NIGHT = !!process.env.NIGHT;
const SIZES = { 태블릿: { width: 1280, height: 800 }, 폰: { width: 390, height: 844 } };

async function open(browser, size, seed = true) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  // 홈 책상 빛이 '실시간'이라 찍는 시각에 따라 달라진다 → 오후 3시로 고정(햇살 책상 시안과 같은 기준)
  await page.clock.setFixedTime(new Date(2026, 9, 30, NIGHT ? 22 : 15, 0));
  if (seed) await context.addInitScript(list => localStorage.setItem('dio:diary:list:v1', JSON.stringify(list)), DIARIES);
  await page.goto(base);
  return { context, page };
}

async function shot(page, name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 90 });
  console.log('찍음', name);
}

// 폰은 아래 탭, 태블릿은 사이드 레일. 탭 · 레일 항목을 이름으로 누른다.
async function goTab(page, label, phone) {
  // 접힌 레일에도 항목이 있다. 펼치면 어두운 막이 화면을 덮으므로 펼치지 않고 누른다.
  const byRole = page.getByRole('button', { name: label, exact: true });
  const tab = page.getByRole('tab', { name: label, exact: true });
  if (await byRole.count()) await byRole.first().click(); else await tab.first().click();
  const close = page.getByRole('button', { name: '메뉴 닫기', exact: true });
  if (await close.count()) { await close.first().click({ force: true }); await page.waitForTimeout(400); }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [device, size] of Object.entries(SIZES)) {
      const phone = size.width < 600;
      // 1) 로그인 · 회원가입 (게스트 시작 전)
      if (!NIGHT) {
        const { context, page } = await open(browser, size, false);
        await page.getByRole('button', { name: '게스트로 시작하기', exact: true }).waitFor();
        await shot(page, `로그인 ${device}`);
        const signup = page.getByRole('button', { name: '회원가입', exact: true });
        if (await signup.count()) { await signup.first().click(); await shot(page, `회원가입 ${device}`); }
        await context.close();
      }
      // 2) 게스트 홈과 나머지 화면
      {
        const { context, page } = await open(browser, size, true);
        await page.getByRole('button', { name: '게스트로 시작하기', exact: true }).click();
        await page.getByRole('button', { name: /^.+ 열기$/ }).first().waitFor({ state: 'attached' });
        const next = page.getByRole('button', { name: '다음 다이어리', exact: true });
        if (await next.count()) await next.click();
        await shot(page, `홈 스와이프 ${device}${NIGHT ? ' 밤' : ''}`);
        if (NIGHT) { await context.close(); continue; }
        const grid = page.getByRole('tab', { name: '한눈에 보기', exact: true });
        if (await grid.count()) { await grid.click(); await shot(page, `홈 한눈에 ${device}`); }
        for (const [label, name] of [['꾸미기 공방', '꾸미기 공방'], ['내 공간', '내 공간'], ['휴지통', '휴지통']]) {
          try { await goTab(page, label, phone); await shot(page, `${name} ${device}`); } catch (e) { console.log('실패', label, device, e.message.split('\n')[0]); }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
})();
