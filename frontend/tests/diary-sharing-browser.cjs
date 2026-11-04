const { chromium } = require('playwright-core');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const out = path.join(__dirname, '../.expo/sharing-results');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<html><body style="margin:0"><div id="root" style="display:flex;height:100vh"></div><script src="/tests/fixtures/diary-sharing.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>',
    );
    return;
  }
  http
    .get(`http://127.0.0.1:8096${req.url}`, (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    })
    .on('error', (e) => {
      res.writeHead(502);
      res.end(e.message);
    });
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  try {
    const page = await browser.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const button = (name) => page.getByRole('button', { name, exact: true });
    const open = async () => {
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await button('소유자 공유 열기').waitFor({ timeout: 120000 });
    };
    for (const [width, height] of [
      [1280, 800],
      [1024, 768],
      [390, 844],
      [320, 568],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await open();
      await button('소유자 공유 열기').click();
      await button('초대 링크 만들기').waitFor();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, `sharing-${width}.png`) });
      for (const name of ['공유 창 닫기', '초대 링크 만들기', '완료']) {
        const el = button(name);
        await el.scrollIntoViewIfNeeded();
        const b = await el.boundingBox();
        assert.ok(b.x >= 0 && b.x + b.width <= width + 1, `${name} ${width}`);
      }
      await button('공유 창 닫기').click();
      await button('초대 목록 열기').click();
      await button('우리의 여행 기록 초대 수락').waitFor();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, `invitations-${width}.png`) });
      await button('우리의 여행 기록 초대 수락').click();
      await page.getByRole('textbox', { name: '다이어리 닉네임', exact: true }).waitFor();
      for (const name of [
        '다이어리 프로필 사진 선택',
        '닉네임 설정 취소',
        '수락하고 참여하기',
      ]) {
        const element = button(name);
        await element.scrollIntoViewIfNeeded();
        const box = await element.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `${name} ${width}`);
      }
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, `nickname-${width}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await open();
    await button('소유자 공유 열기').click();
    await page.getByText('다이어리 공유', { exact: true }).click();
    assert.ok(await button('초대 링크 만들기').isVisible());
    await page.mouse.click(4, 4);
    await button('공유 창 닫기').waitFor({ state: 'detached' });
    assert.ok(await page.getByLabel('소연 참여 중', { exact: true }).isVisible());
    await button('소유자 공유 열기').click();
    await button('이 다이어리 프로필 수정').click();
    const editName = page.getByRole('textbox', { name: '다이어리 닉네임', exact: true });
    await editName.fill('소연수정');
    await button('다이어리 프로필 사진 선택').click();
    const chooserPromise = page.waitForEvent('filechooser');
    await button('다이어리 사진 선택').click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'profile.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await button('변경 사항 저장').click();
    await button('이 다이어리 프로필 수정').waitFor();
    assert.ok(
      (await page.getByRole('img', { name: '소연수정 프로필 사진', exact: true }).count()) > 0,
    );
    await button('이 다이어리 프로필 수정').click();
    await button('다이어리 프로필 사진 선택').click();
    await button('기본 프로필로 변경').click();
    await button('변경 사항 저장').click();
    await button('이 다이어리 프로필 수정').waitFor();
    assert.equal(
      await page.getByRole('img', { name: '소연수정 프로필 사진', exact: true }).count(),
      0,
    );
    await button('초대 링크 만들기').click();
    await button('초대 링크 복사').waitFor();
    assert.equal(await page.getByText('보기 전용', { exact: true }).count(), 0);
    assert.equal(await button('하루 내보내기').count(), 0);
    await button('공유 창 닫기').click();
    await button('초대 목록 열기').click();
    await button('우리의 여행 기록 초대 수락').click();
    const nick = page.getByRole('textbox', { name: '다이어리 닉네임', exact: true }),
      accept = button('수락하고 참여하기');
    await nick.fill('하루');
    await nick.fill('여행자');
    assert.ok(await accept.isEnabled());
    await nick.fill('a');
    assert.ok(await accept.isDisabled());
    await button('닉네임 설정 취소').click();
    await button('우리의 여행 기록 초대 수락').waitFor();
    assert.equal(await page.getByTestId('joined').textContent(), '0');
    await button('우리의 여행 기록 초대 수락').click();
    await nick.fill('여행자');
    await accept.click();
    await button('다이어리 참여 해제').waitFor();
    assert.equal(await page.getByTestId('joined').textContent(), '1');
    assert.equal(await button('초대 링크 만들기').count(), 0);
    await button('다이어리 참여 해제').click();
    await button('참여 해제').click();
    await page.getByText('참여를 해제했어요.').waitFor();
    assert.equal(await page.getByTestId('joined').textContent(), '0');
    await page
      .getByRole('textbox', { name: '받은 초대 링크' })
      .fill('https://evil.example/invite/x');
    await button('초대 링크 확인').click();
    await page.getByText('사용할 수 없는 초대 링크예요.').waitFor();
    await button('주말의 기록 초대 거절').click();
    await button('거절').click();
    await button('주말의 기록 초대 거절').waitFor({ state: 'detached' });
    for (const title of ['우리의 여행 기록', '함께하는 오후', '지난 초대', '주말의 기록']) {
      await button(`${title} 알림 삭제`).click();
      await button(`${title} 알림 삭제`).waitFor({ state: 'detached' });
    }
    await page.getByText('받은 초대가 없어요.').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: 5 viewport layouts, owner permissions/removal/link, nickname duplicate/recheck/cancel, accept/leave, invalid links; no page errors',
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
