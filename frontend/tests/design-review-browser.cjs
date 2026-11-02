const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, process.env.DESIGN_BASELINE ? '../.expo/tablet-layout-export' : '../.expo/design-review-export');
const out = path.resolve(__dirname, process.env.DESIGN_BASELINE ? '../.expo/design-review-before' : '../.expo/design-review-results');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (file === root) file = path.join(root, 'index.html');
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    const results = [];
    for (const [width, height] of [[1280,800],[1024,768],[390,844],[844,390]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => {
        localStorage.setItem('dio:diary:list:v1', JSON.stringify([{ id: 'layout-qa', title: '배치 검증', type: '개인', color: '#9DABD8', pattern: 'linen', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }]));
        localStorage.setItem('dio:editor:doc:v4:layout-qa', JSON.stringify({ id: 'layout-qa', title: '배치 검증', pages: [{ id: 'layout-page', canvasWidth: 1200, canvasHeight: 800, objects: [] }] }));
      });
      const button = name => page.getByRole('button', { name, exact: true });
      const clickWithFeedback = async control => {
        if (process.env.DESIGN_BASELINE) { await control.click(); return; }
        await control.hover();
        const before = await control.evaluate(node => ({ background: getComputedStyle(node).backgroundColor, opacity: getComputedStyle(node).opacity }));
        await page.mouse.down();
        try {
          await page.waitForFunction(node => getComputedStyle(node).opacity === '0.65', await control.elementHandle());
          assert.equal(await control.evaluate(node => getComputedStyle(node).backgroundColor), before.background);
        } finally { await page.mouse.up(); }
        await page.waitForFunction(node => getComputedStyle(node).opacity === '1', await control.elementHandle());
      };
      const checkBlueText = async () => {
        if (process.env.DESIGN_BASELINE) return;
        const violations = await page.evaluate(() => [...document.querySelectorAll('*')]
          .filter(node => node.getBoundingClientRect().width > 0 && [...node.childNodes]
            .some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim()))
          .filter(node => getComputedStyle(node).color === 'rgb(110, 146, 198)')
          .map(node => node.textContent.trim()));
        assert.deepEqual(violations, [], '읽는 UI 글자에 대비가 낮은 primary를 사용하지 않는다');
      };
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      // 첫 화면은 고르는 화면 없이 바로 보관함이다
      await button('배치 검증 열기').waitFor();
      await page.screenshot({path:path.join(out,`start-${width}.png`)});
      const phone = Math.min(width, height) < 600;
      if (!phone) {
        const rail = page.getByLabel('메뉴 펼치기', { exact: true }).locator('..').locator('..');
        const box = await rail.boundingBox();
        if (!process.env.DESIGN_BASELINE) assert.ok(Math.abs(box.x) < 1, `rail outside gap at ${width}: ${box.x}`);
        if (!process.env.DESIGN_BASELINE) assert.ok(Math.abs(box.height - height) < 1, `rail height at ${width}`);
        await button('메뉴 펼치기').click();
        await button('메뉴 접기').waitFor();
        await button('설정').click();
        await button('휴지통').click();
        await button('내 다이어리').click();
        await button('메뉴 접기').click();
        await page.waitForTimeout(350); // 메뉴 너비 전환이 끝난 뒤 화면 기록
      } else {
        assert.equal(await button('메뉴 펼치기').count(), 0);
        assert.ok(await page.getByRole('tab').count() > 0);
      }
      if (!process.env.DESIGN_BASELINE) {
        assert.equal(await page.getByText('모든 다이어리',{exact:true}).last().evaluate(node=>getComputedStyle(node).fontWeight),'800');
        if (!phone) assert.equal(await page.getByRole('tab',{name:'스와이프 보기',exact:true}).locator('text=스와이프').evaluate(node=>getComputedStyle(node).fontWeight),'800');
      }
      await page.getByRole('tab',{name:'한눈에 보기',exact:true}).click();
      await page.screenshot({path:path.join(out,`grid-${width}.png`)});
      await checkBlueText();
      await page.getByRole('tab',{name:'스와이프 보기',exact:true}).click();
      await page.screenshot({ path: path.join(out, `library-${width}.png`) });
      await button('배치 검증 열기').click();
      const canvas = page.getByLabel('손바닥 캔버스', { exact: true });
      await canvas.waitFor();
      await page.waitForFunction(() => {
        const box = document.querySelector('[aria-label="손바닥 캔버스"]')?.getBoundingClientRect();
        return box && box.width > 10 && box.height > 10;
      });
      const box = await canvas.boundingBox();
      assert.ok(Math.abs(box.width / box.height - 1.5) < 0.002, `paper stretched at ${width}: ${box.width}/${box.height}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const doc = JSON.parse(await page.evaluate(() => localStorage.getItem('dio:editor:doc:v4:layout-qa')));
      assert.deepEqual([doc.pages[0].canvasWidth, doc.pages[0].canvasHeight], [1200,800]);
      await page.screenshot({ path: path.join(out, `editor-${width}.png`) });
      if (!phone) {
        await clickWithFeedback(button('페이지 목록'));
        await page.waitForTimeout(300); // 패널 전환 애니메이션 종료 후 실제 속지 측정
        await checkBlueText();
        let panelBox = await canvas.boundingBox();
        assert.ok(Math.abs(panelBox.width / panelBox.height - 1.5) < 0.002);
        await clickWithFeedback(button('페이지 목록'));
        await button('레이어').click();
        await page.waitForTimeout(300);
        await checkBlueText();
        panelBox = await canvas.boundingBox();
        assert.ok(Math.abs(panelBox.width / panelBox.height - 1.5) < 0.002);
        await button('레이어').click();
        await clickWithFeedback(button('도형'));
        const shapeAdd = button('도형 캔버스에 추가');
        await shapeAdd.waitFor();
        const shapeContrast = await shapeAdd.evaluate(node => {
          const luminance = value => value.match(/[\d.]+/g).slice(0,3).map(Number).map(v => {
            v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
          }).reduce((sum,v,i) => sum + v * [.2126,.7152,.0722][i], 0);
          const bg = luminance(getComputedStyle(node).backgroundColor);
          const fg = luminance(getComputedStyle(node.lastElementChild).color);
          return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);
        });
        assert.ok(shapeContrast >= 4.5, `shape add contrast ${shapeContrast}`);
        await button('도형 닫기').click();
      }
      await page.getByLabel(phone && width>height ? '내보내기' : '공유 및 내보내기',{exact:true}).click();
      await button('PNG 만들기').waitFor();
      await page.waitForTimeout(350); // 모달 표시 애니메이션 종료 후 화면 기록
      if (!process.env.DESIGN_BASELINE) assert.equal(await button('PNG 만들기').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(79, 116, 174)');
      await page.screenshot({path:path.join(out,`export-${width}.png`)});
      await page.getByLabel('내보내기 창 닫기',{exact:true}).click();
      assert.deepEqual(errors, []);
      results.push({ width, height, phone, paperRatio: box.width / box.height });
      await page.close();
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log('PASS: 4 viewport sizes, enabled CTA contrast, heading weight, selected tabs, library grid/carousel, panels, unstretched paper and stored dimensions, no browser errors');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
