// 수동 QA: 별도 Expo 서버(8095) 필요. CI 자동 실행 대상이 아니다.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const base = new URL(process.argv[2] || 'http://127.0.0.1:8095');
  assert.ok(['localhost', '127.0.0.1'].includes(base.hostname));
  const channel = process.env.DIO_QA_BROWSER_CHANNEL;
  const server = await chromium.launchServer({ headless: true, ...(channel && channel !== 'chromium' ? { channel } : {}) });
  try {
    const browser = await chromium.connect(server.wsEndpoint());
    const results = [];
    for (const viewport of [{width:390,height:844},{width:1100,height:850},{width:800,height:1100}]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/library-empty-qa.html', route => route.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style></head><body><div id="root"></div><script src="/tests/fixtures/library-empty-layout.entry.bundle?platform=web&dev=true&hot=false"></script></body></html>'}));
      await page.goto(new URL('/library-empty-qa.html', base).href);
      await page.getByText('내 다이어리가 없어요', {exact:true}).waitFor({timeout:120000});
      for (const [filter, title] of [['personal','내 다이어리가 없어요'],['shared','공유된 다이어리가 없어요'],['favorite','즐겨찾기한 다이어리가 없어요']]) {
        await page.getByLabel(`QA ${filter}`, {exact:true}).click();
        const positions = [];
        for (const view of ['open','carousel','grid']) {
          await page.getByLabel(`QA ${view}`, {exact:true}).click();
          const label = page.getByText(title, {exact:true});
          await label.waitFor();
          positions.push(await label.boundingBox());
          assert.equal(await page.getByLabel('새 다이어리 만들기', {exact:true}).count(), filter==='personal'?1:0);
        }
        for (const box of positions.slice(1)) for (const key of ['x','y','width','height']) assert.ok(Math.abs(box[key]-positions[0][key])<1, `${filter} ${key}: ${JSON.stringify(positions)}`);
      }
      assert.deepEqual(errors, []);
      results.push({viewport, emptyPositionsMatch:true});
      await page.close();
    }
    console.log(JSON.stringify({status:'passed',results}));
  } finally { await server.kill(); }
})().catch(error => { console.error(error); process.exitCode=1; });
