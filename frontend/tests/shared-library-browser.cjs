const { chromium } = require('playwright-core'),
  http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../.expo/sharing-export'),
  out = path.resolve(__dirname, '../.expo/shared-library-results');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) && file !== root) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (file === root) file = path.join(root, 'index.html');
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.png': 'image/png',
      }[path.extname(file)] || 'application/octet-stream',
    );
    res.end(data);
  });
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({
          viewport: { width, height: width === 1280 ? 800 : 844 },
        }),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        if (localStorage.getItem('shared-qa-seed')) return;
        const diary = {
          id: 'own-qa',
          title: '개인 검증',
          type: '개인',
          color: '#9DABD8',
          pattern: 'linen',
          favorite: false,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        };
        localStorage.setItem('dio:diary:list:v1', JSON.stringify([diary]));
        localStorage.setItem(
          'dio:editor:doc:v4:own-qa',
          JSON.stringify({
            id: diary.id,
            title: diary.title,
            pages: [{ id: 'own-page', objects: [] }],
          }),
        );
        localStorage.setItem('shared-qa-seed', '1');
      });
      const button = (name) => page.getByRole('button', { name, exact: true });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await button('게스트로 시작하기').click();
      await button('개인 검증 열기').waitFor();
      const privateDoc = await page.evaluate(() =>
        localStorage.getItem('dio:editor:doc:v4:own-qa'),
      );
      await button('개인 검증 열기').click();
      await page.getByRole('button', { name: /^다이어리 공유/ }).click();
      assert.equal(await button('하루 참여 해제').count(), 0);
      await button('초대 링크 만들기').click();
      await button('초대 링크 복사').waitFor();
      await button('공유 창 닫기').click();
      await button('다이어리 홈').click();
      await page.getByRole('tab', { name: '공유 다이어리', exact: true }).click();
      await page.getByText('공유 중인 다이어리가 없어요', { exact: true }).waitFor();
      await page.getByRole('tab', { name: '모든 다이어리', exact: true }).click();
      await page.getByRole('button', { name: /^받은 초대/ }).click();
      await button('우리의 여행 기록 초대 수락').click();
      await page.getByRole('textbox', { name: '다이어리 닉네임', exact: true }).fill('참여검증');
      await button('다이어리 닉네임 중복 확인').click();
      await page.getByText('사용할 수 있는 닉네임이에요.').waitFor();
      await button('수락하고 참여하기').click();
      await button('다이어리 열기').waitFor();
      await button('공유 창 닫기').click();
      const shared = button('우리의 여행 기록 열기');
      await shared.waitFor();
      await page.getByRole('tab', { name: '공유 다이어리', exact: true }).click();
      await shared.waitFor();
      assert.equal(await button('개인 검증 열기').count(), 0);
      assert.ok(await shared.getByLabel('공유 다이어리', { exact: true }).isVisible());
      assert.equal(await button('우리의 여행 기록 수정').count(), 0);
      assert.equal(await button('우리의 여행 기록 휴지통으로 이동').count(), 0);
      await shared.getByRole('button', { name: '즐겨찾기 추가', exact: true }).click();
      await shared.getByRole('button', { name: '즐겨찾기 해제', exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, `library-${width}.png`) });
      await shared.click();
      await button('다이어리 홈').waitFor();
      if (!(await page.getByLabel('페이지 추가', { exact: true }).isVisible()))
        await button('페이지 목록').click();
      await page.getByLabel('페이지 추가', { exact: true }).click();
      await page.getByRole('button', { name: /무지/ }).click();
      await page.getByLabel('2페이지', { exact: true }).waitFor();
      await button('다이어리 홈').click();
      await shared.waitFor();
      await shared.getByText('2페이지', { exact: true }).waitFor();
      await shared.click();
      await button('다이어리 홈').waitFor();
      if (!(await page.getByLabel('2페이지', { exact: true }).isVisible()))
        await button('페이지 목록').click();
      await page.getByLabel('2페이지', { exact: true }).waitFor();
      await page.getByRole('button', { name: /^다이어리 공유/ }).click();
      await button('다이어리 참여 해제').click();
      await button('참여 해제').click();
      await button('공유 창 닫기').click();
      await shared.waitFor({ state: 'detached' });
      await page.getByRole('tab', { name: '공유 다이어리', exact: true }).click();
      await page.getByText('공유 중인 다이어리가 없어요', { exact: true }).waitFor();
      await page.getByRole('tab', { name: '모든 다이어리', exact: true }).click();
      await button('개인 검증 열기').waitFor();
      const stored = await page.evaluate(() => ({
        list: JSON.parse(localStorage.getItem('dio:diary:list:v1')),
        doc: localStorage.getItem('dio:editor:doc:v4:own-qa'),
        temporary: Object.keys(localStorage).filter((key) => key.startsWith('session-doc:')),
      }));
      assert.deepEqual(
        stored.list.map((d) => d.id),
        ['own-qa'],
      );
      assert.equal(stored.doc, privateDoc);
      assert.deepEqual(stored.temporary, []);
      await page.reload();
      await button('게스트로 시작하기').click();
      await button('개인 검증 열기').waitFor();
      assert.equal(await shared.count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(
      'PASS: tablet/phone accept -> shared library -> editable canvas -> reopen -> leave; personal storage preserved, preview rows not persisted, zero page errors',
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
