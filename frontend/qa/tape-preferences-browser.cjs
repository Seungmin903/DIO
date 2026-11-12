// .expo/tape-preferences-web 개발 번들 사용. 별도 origin·컨텍스트에서 합성 자료만 검증한다.
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../.expo/tape-preferences-web');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (file !== root && !file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file === root ? path.join(root, 'index.html') : file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
    if (file === root) res.setHeader('Content-Type', 'text/html');
    res.end(data);
  });
});
(async () => {
  let browser;
  try {
    const { STORAGE_KEYS } = await import('../src/editor/utils/storageContract.js');
    const { createDefaultDoc } = await import('../src/editor/state/defaultDoc.js');
    const diary = { id: 'qa-tape', title: '테이프 확인', color: '#CED9EE', pattern: 'linen', type: '개인', createdAt: '2026-10-25T00:00:00Z' };
    const docKey = `${STORAGE_KEYS.doc}:${diary.id}`;
    const seed = { [STORAGE_KEYS.diaries]: JSON.stringify([diary]), [docKey]: JSON.stringify(createDefaultDoc(diary)) };
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const viewport of [{ width: 1280, height: 800 }, { width: 412, height: 892 }]) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(seed => { if (!localStorage.getItem('qa:tape:seeded')) { for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value); localStorage.setItem('qa:tape:seeded', 'true'); } }, seed);
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
      const button = name => page.getByRole('button', { name, exact: true });
      const enter = async () => { await button('테이프 확인 열기').click(); await button('다이어리 홈').waitFor(); };
      const tape = () => button('마스킹테이프').click();
      const selected = async label => { const locator = page.getByLabel(label, { exact: true }); await locator.waitFor(); await page.waitForFunction(({ label, width }) => { const node = document.querySelector(`[aria-label="${label}"]`); return node && getComputedStyle(node).borderTopWidth === width; }, { label, width: label.startsWith('테이프 색') ? '3px' : '2px' }); };
      await page.goto(`http://127.0.0.1:${server.address().port}`); await enter(); await tape();
      await page.getByRole('button', { name: /와이드/ }).click(); await page.getByLabel('테이프 색 스카이', { exact: true }).click();
      await page.getByLabel('보관함 닫기', { exact: true }).click(); await tape();
      await selected('테이프 색 스카이');
      await button('무늬 도트').click(); await tape(); await selected('무늬 도트'); await selected('테이프 색 스카이');
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').pattern === 'dot', STORAGE_KEYS.tapePreferences);
      await page.reload(); await enter(); await tape(); await selected('무늬 도트'); await selected('테이프 색 스카이');
      assert.equal(await page.getByRole('button', { name: /와이드/ }).evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)');
      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}: 색·규격·무늬, 닫기·삽입·Reload 복원, 브라우저 오류 0건`);
      await context.close();
    }
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
