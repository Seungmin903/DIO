// 클립.html 의 svg 를 하나씩 투명 배경 PNG 로 찍는다 (파일 이름 = svg id).
// 실행: NODE_PATH=<frontend>/node_modules node "클립 그리기.cjs" <결과 폴더>
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve(process.argv[2]);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.goto('file:///' + path.join(__dirname, '클립.html').replace(/\\/g, '/'));
    fs.mkdirSync(out, { recursive: true });
    for (const svg of await page.locator('svg').all()) {
      const name = await svg.getAttribute('id');
      await svg.screenshot({ path: path.join(out, `${name}.png`), omitBackground: true });
      console.log('ok', name);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
