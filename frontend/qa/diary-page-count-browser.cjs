// 전용 origin·브라우저 컨텍스트에서 생성한 자료만 사용한다.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const mock = process.argv.includes('--mock');
const root = path.resolve(__dirname, mock ? '../.expo/diary-page-count-mock-web' : '../.expo/diary-page-count-web');
const out = path.resolve(__dirname, '.out/diary-page-count');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const target = file === root ? path.join(root, 'index.html') : file;
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' }[path.extname(target)] || 'application/octet-stream');
    res.end(data);
  });
});

(async () => {
  let browser;
  try {
    const { STORAGE_KEYS } = await import('../src/editor/utils/storageContract.js');
    const { createDefaultDoc } = await import('../src/editor/state/defaultDoc.js');
    const diary = { id: 'qa-count-main', title: '페이지 수 확인', color: '#CED9EE', pattern: 'linen', type: '개인', favorite: true, createdAt: '2026-10-25T10:00:00Z' };
    const long = { ...diary, id: 'qa-count-long', title: '이름이 아주 긴 다이어리에서도 페이지 수가 잘리지 않는지 확인합니다', favorite: false, createdAt: '2026-10-24T10:00:00Z' };
    const failed = { ...diary, id: 'qa-count-failed', title: '조회 실패 확인', favorite: false, createdAt: '2026-10-23T10:00:00Z' };
    const documentFor = (row, count) => {
      const doc = createDefaultDoc(row);
      return { ...doc, pages: Array.from({ length: count }, (_, index) => ({ ...doc.pages[0], id: `${row.id}-page-${index}` })) };
    };
    const values = { [STORAGE_KEYS.diaries]: JSON.stringify([diary, long, failed]),
      [`${STORAGE_KEYS.doc}:${diary.id}`]: JSON.stringify(documentFor(diary, 3)),
      [`${STORAGE_KEYS.doc}:${long.id}`]: JSON.stringify(documentFor(long, 12)) };
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    fs.mkdirSync(out, { recursive: true });
    const results = [];
    for (const viewport of [{ width: 1280, height: 800 }, { width: 412, height: 892 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      if (!mock) await context.addInitScript(({ values, failedKey }) => {
        if (!localStorage.getItem('qa:page-count:seeded')) {
          for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
          localStorage.setItem('qa:page-count:seeded', 'true');
        }
        const read = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) { if (key === failedKey) throw new Error('QA read failure'); return read.call(this, key); };
      }, { values, failedKey: `${STORAGE_KEYS.doc}:${failed.id}` });
      const button = name => page.getByRole('button', { name, exact: true });
      const tab = name => page.getByRole('tab', { name, exact: true });
      const id = mock ? 'mock-travel' : diary.id;
      const count = () => page.getByTestId(`diary-page-count-${id}`);
      const expectCount = async value => { await count().getByText(`${value}페이지`, { exact: true }).waitFor(); };
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await expectCount(mock ? 9 : 3);
      await tab('한눈에 보기').click();
      await expectCount(mock ? 9 : 3);
      if (!mock) {
        await page.getByTestId(`diary-page-count-${long.id}`).getByText('12페이지', { exact: true }).waitFor();
        await page.getByTestId(`diary-page-count-${failed.id}`).getByText('페이지 수 확인 불가', { exact: true }).waitFor();
      }
      const box = await count().boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width);
      assert.ok(await count().evaluate(node => node.scrollWidth <= node.clientWidth));
      await page.screenshot({ path: path.join(out, `${mock ? 'mock' : 'local'}-${viewport.width}.png`), fullPage: true });
      await button('다이어리 검색').click();
      await page.getByRole('textbox', { name: '다이어리 제목 검색' }).fill(mock ? '여행' : diary.title);
      await expectCount(mock ? 9 : 3);
      await button('보관함 옵션').click(); await button('편집').click();
      await page.getByRole('checkbox', { name: `${mock ? '여행 기록' : diary.title} 선택`, exact: true }).click();
      await page.getByText('1개 선택됨', { exact: true }).waitFor();
      await expectCount(mock ? 9 : 3);
      await page.getByRole('toolbar').getByRole('button', { name: '편집 완료', exact: true }).click();
      await button('검색 닫기').click();
      if (!mock) {
        await button(`${diary.title} 열기`).click(); await button('다이어리 홈').waitFor();
        await button('페이지 목록').click();
        await page.getByLabel('페이지 작업 메뉴', { exact: true }).first().click();
        await page.getByLabel('페이지 복제', { exact: true }).click();
        await button('다이어리 홈').click(); await expectCount(4);
        await button(`${diary.title} 열기`).click(); await button('다이어리 홈').waitFor();
        await button('페이지 목록').click();
        await page.getByLabel('페이지 작업 메뉴', { exact: true }).first().click();
        await page.getByLabel('페이지 삭제', { exact: true }).click();
        await button('다이어리 홈').click(); await expectCount(3);
        await page.reload(); await expectCount(3);
      }
      assert.deepEqual(errors, []);
      results.push({ viewport, mode: mock ? 'mock-library' : 'local', count: mock ? 9 : 3,
        flows: mock ? ['carousel', 'grid', 'search', 'selection'] : ['carousel', 'grid', 'search', 'selection', 'read-failure', 'duplicate-return', 'delete-return', 'reload'], errors });
      await context.close();
    }
    fs.writeFileSync(path.join(out, `${mock ? 'mock' : 'local'}-results.json`), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
