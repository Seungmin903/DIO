// 지금 앱 화면(로그인 · 내 다이어리 세 보기 · 공유된 다이어리 · 꾸미기 공방 다섯 탭 · 휴지통 · 내 공간 · 새 다이어리 · 알림 · 편집기)을 태블릿 · 폰 크기로 찍는다.
// 준비: frontend 에서 `pnpm web`(http://localhost:8081)이 떠 있어야 한다. 게스트 모드로 들어가므로 백엔드는 필요 없다(공유된 다이어리는 빈 화면).
// 실행: NODE_PATH=<frontend>/node_modules node "화면 찍기.cjs" <결과 폴더> [주소]
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

const SIZES = process.env.ONLY_TAB ? { 태블릿: { width: 1280, height: 800 } } : { 태블릿: { width: 1280, height: 800 }, 폰: { width: 390, height: 844 } };

async function open(browser, size, seed = true) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  // 홈 책상 빛이 '실시간'이라 찍는 시각에 따라 달라진다 → 오후 3시로 고정
  await page.clock.setFixedTime(new Date(2026, 9, 30, 15, 0));
  if (seed) await context.addInitScript(list => localStorage.setItem('dio:diary:list:v1', JSON.stringify(list)), DIARIES);
  await page.goto(base, { timeout: 180000 }); // dev 서버의 첫 번들은 20~30초 걸린다
  return { context, page };
}

async function shot(page, name) {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log('찍음', name);
}

async function visible(page, label, roles = ['button', 'tab']) {
  for (const role of roles) {
    const all = page.getByRole(role, { name: label, exact: true });
    for (let i = 0; i < await all.count(); i++) if (await all.nth(i).isVisible()) return all.nth(i);
  }
  throw new Error(`보이는 '${label}' 없음`);
}

async function press(page, label, roles) {
  await (await visible(page, label, roles)).click();
  // 메뉴가 펼쳐졌을 때만 닫는다(접힌 동안의 투명한 닫기 막을 누르면 그 아래 책이 눌린다)
  if (await page.getByRole('button', { name: '메뉴 접기', exact: true }).count()) await (await visible(page, '메뉴 접기')).click();
}

async function tryStep(name, fn) {
  try { await fn(); } catch (e) { console.log('실패', name, e.message.split('\n')[0]); }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [device, size] of Object.entries(SIZES)) {
      const n = (i, t) => `${device} ${String(i).padStart(2, '0')} ${t}`;
      {
        const { context, page } = await open(browser, size, false);
        await page.getByRole('button', { name: '게스트로 시작하기', exact: true }).waitFor();
        await shot(page, n(1, '로그인'));
        await context.close();
      }
      const { context, page } = await open(browser, size, true);
      await page.getByRole('button', { name: '게스트로 시작하기', exact: true }).click();
      await page.getByRole('button', { name: /^.+ 열기$/ }).first().waitFor({ state: 'attached' });
      // 첫 보기는 스와이프라 누르지 않고 찍는다(고른 보기를 다시 누르면 지금 다이어리가 열린다)
      await page.waitForTimeout(3000);
      await shot(page, n(3, '내 다이어리 스와이프'));
      await tryStep('펼쳐서', async () => {
        await press(page, '펼쳐서 보기', ['tab']);
 await shot(page, n(2, '내 다이어리 펼쳐서')); });
      await tryStep('한눈에', async () => { await press(page, '한눈에 보기', ['tab']); await shot(page, n(4, '내 다이어리 한눈에')); });
      await tryStep('공유', async () => { await press(page, '공유된 다이어리'); await shot(page, n(5, '공유된 다이어리')); });
      await tryStep('공방', async () => {
        await press(page, '꾸미기 공방');
        let i = 6;
        for (const tab of ['폰트', '스티커', '표지', '속지', '프리셋']) {
          await page.getByRole('tab', { name: tab, exact: true }).first().click();
          await shot(page, n(i++, `꾸미기 공방 ${tab}`));
        }
      });
      await tryStep('휴지통', async () => { await press(page, '휴지통'); await shot(page, n(11, '휴지통')); });
      await tryStep('내 공간', async () => { await press(page, '내 공간'); await shot(page, n(12, '내 공간')); });
      await tryStep('메뉴 펼침', async () => {
        await press(page, '내 다이어리');
        await (await visible(page, '메뉴 펼치기')).click();
        await shot(page, n(13, '메뉴 펼침'));
        await (await visible(page, '메뉴 접기')).click();
      });
      await tryStep('새 다이어리', async () => {
        await (await visible(page, '새 다이어리 만들기')).click();
        await shot(page, n(14, '새 다이어리'));
        await page.keyboard.press('Escape');
        const cancel = page.getByRole('button', { name: /^(닫기|취소)$/ });
        if (await cancel.count()) await cancel.first().click();
      });
      await tryStep('편집기', async () => {
        await press(page, '내 다이어리');
        await press(page, '한눈에 보기', ['tab']);
        await (await visible(page, '여름 방학 열기')).click();
        await page.waitForTimeout(2500);
        await shot(page, n(15, '편집기'));
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }
})();
