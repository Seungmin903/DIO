const { chromium } = require('playwright-core');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../.expo/profile-export'),
  out = path.resolve(__dirname, '../.expo/profile-results');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (file === root) file = path.join(root, 'index.html');
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
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
        '.png': 'image/png',
        '.json': 'application/json',
      }[path.extname(file)] || 'application/octet-stream',
    );
    res.end(data);
  });
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
    headless: true,
  });
  try {
    for (const [width, height] of [
      [1280, 800],
      [1024, 768],
      [390, 844],
      [320, 568],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } }),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        if (localStorage.getItem('profile-qa')) return;
        localStorage.setItem(
          'dio:diary:list:v1',
          JSON.stringify([
            {
              id: 'private-qa',
              title: '개인 검증',
              color: '#9DABD8',
              favorite: true,
              createdAt: '2026-10-26',
            },
          ]),
        );
        localStorage.setItem(
          'dio:editor:doc:v4:private-qa',
          JSON.stringify({ id: 'private-qa', pages: [{ id: 'own-page', objects: [] }] }),
        );
        localStorage.setItem('profile-qa', '1');
      });
      const button = (name) => page.getByRole('button', { name, exact: true }),
        input = (name) => page.getByLabel(name, { exact: true });
      const goProfile = async () => {
        await page.getByLabel('내 공간', { exact: true }).click();
        await button('회원정보 수정').click();
      };
      const login = async (password) => {
        await input('이메일').fill('profile@example.com');
        await input('비밀번호').fill(password);
        await button('로그인').click();
      };
      const storage = () =>
        page.evaluate(() => [
          localStorage.getItem('dio:diary:list:v1'),
          localStorage.getItem('dio:editor:doc:v4:private-qa'),
        ]);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await button('회원가입').click();
      await input('이메일').fill('profile@example.com');
      await input('비밀번호').fill('Password123');
      await input('비밀번호 확인').fill('Password123');
      await button('다음').click();
      await input('닉네임').fill('처음이름');
      await page.getByRole('checkbox', { name: '전체 동의', exact: true }).click();
      await button('가입 완료').click();
      await page.getByText('가입이 완료됐어요.').waitFor();
      await login('Password123');
      await page.getByRole('button', { name: /^받은 초대/ }).click();
      await button('우리의 여행 기록 초대 수락').click();
      await input('다이어리 닉네임').fill('함께이름');
      await button('다이어리 닉네임 중복 확인').click();
      await button('수락하고 참여하기').click();
      await button('다이어리 열기').waitFor();
      await button('공유 창 닫기').click();
      await goProfile();
      await input('닉네임').waitFor();
      assert.equal(await button('계정 설정').count(), 0);
      const original = await storage();
      await input('닉네임').fill('수정중');
      await button('취소').click();
      await button('계속 수정하기').click();
      assert.equal(await input('닉네임').inputValue(), '수정중');
      await page.getByLabel('즐겨찾기', { exact: true }).click();
      await button('계속 수정하기').waitFor();
      await page.waitForTimeout(350); // RN Modal fade가 끝난 뒤 시각 결과를 기록한다.
      await page.screenshot({ path: path.join(out, `discard-${width}.png`) });
      await button('계속 수정하기').click();
      assert.equal(await input('닉네임').inputValue(), '수정중');
      await page.getByLabel('즐겨찾기', { exact: true }).click();
      await button('저장하지 않고 나가기').click();
      await goProfile();
      assert.equal(await input('닉네임').inputValue(), '처음이름');
      const chooser = page.waitForEvent('filechooser');
      await button('프로필 사진 변경').click();
      await (
        await chooser
      ).setFiles({
        name: 'photo.png',
        mimeType: 'image/png',
        buffer: fs.readFileSync(path.join(__dirname, '../assets/images/icon.png')),
      });
      await page.getByRole('img', { name: '프로필 사진', exact: true }).waitFor();
      const before = await input('닉네임').boundingBox();
      if (width >= 700) {
        const reset = await button('프로필 사진 삭제').boundingBox();
        const blankX = before.x + before.width - 4;
        assert.ok(blankX > reset.x + reset.width);
        await page.mouse.click(blankX, reset.y + reset.height / 2);
        assert.ok(await page.getByRole('img', { name: '프로필 사진', exact: true }).isVisible());
      }
      await button('프로필 사진 삭제').click();
      const after = await input('닉네임').boundingBox();
      assert.ok(Math.abs(before.y - after.y) < 1);
      await input('닉네임').fill('수정이름');
      assert.ok(await button('변경사항 저장').isEnabled());
      await input('닉네임').fill('마지막이름');
      assert.ok(await button('변경사항 저장').isEnabled());
      await button('변경사항 저장').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `profile-${width}.png`) });
      await button('변경사항 저장').click();
      await page.getByText('회원정보를 저장했어요.').waitFor();
      assert.ok(await button('변경사항 저장').isDisabled());
      await button('내 공간으로 돌아가기').click();
      await (width < 700 ? page.getByRole('tab', { name: '다이어리', exact: true }) : button('모든 다이어리')).click();
      await button('우리의 여행 기록 열기').click();
      await page.getByRole('button', { name: /^다이어리 공유/ }).click();
      await page.getByText('함께이름 · 나', { exact: true }).waitFor();
      await button('공유 창 닫기').click();
      await button('다이어리 홈').click();
      await goProfile();
      await button('비밀번호 변경').click();
      await input('새 비밀번호').fill('Changed123');
      await button('확인 창 닫기').click();
      await button('계속 수정하기').click();
      assert.equal(await input('새 비밀번호').inputValue(), 'Changed123');
      await input('현재 비밀번호').fill('Wrong1234');
      await input('새 비밀번호 확인').fill('Changed123');
      await button('변경').click();
      await page.getByText('현재 비밀번호가 맞지 않아요.').waitFor();
      await input('현재 비밀번호').fill('Password123');
      await button('변경').click();
      await page.getByText('비밀번호를 변경했어요.').waitFor();
      await button('내 공간으로 돌아가기').click();
      await page.getByText('마지막이름님의 기록 공간', { exact: true }).waitFor();
      await button('로그아웃').click();
      await login('Password123');
      await page.getByText('이메일 또는 비밀번호가 맞지 않아요.').waitFor();
      await login('Changed123');
      await goProfile();
      await button('회원 탈퇴').click();
      assert.ok(await button('탈퇴하기').isDisabled());
      await input('탈퇴 확인 문구').fill('탈퇴합니다 ');
      assert.ok(await button('탈퇴하기').isDisabled());
      await input('탈퇴 확인 문구').fill('탈퇴합니다');
      assert.ok(await button('탈퇴하기').isEnabled());
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(out, `withdraw-${width}.png`) });
      await button('확인 창 닫기').click();
      await button('회원 탈퇴').click();
      assert.equal(await input('탈퇴 확인 문구').inputValue(), '');
      await input('탈퇴 확인 문구').fill('탈퇴합니다');
      await button('탈퇴하기').click();
      await button('로그인').waitFor();
      await login('Changed123');
      await page.getByText('이메일 또는 비밀번호가 맞지 않아요.').waitFor();
      assert.deepEqual(await storage(), original);
      await button('개발자 모드로 시작').click();
      await page.getByLabel('내 공간', { exact: true }).click();
      assert.equal(await button('회원정보 수정').count(), 0);
      assert.equal(await button('로그아웃').count(), 0);
      await button('로그인·회원가입').click();
      await button('구글로 로그인').click();
      await input('닉네임').fill('소셜회원');
      await page.getByRole('checkbox', { name: '전체 동의', exact: true }).click();
      await button('가입 완료').click();
      await goProfile();
      assert.equal(await button('비밀번호 변경').count(), 0);
      await page.getByLabel('로그인 방식: 구글', { exact: true }).waitFor();
      assert.equal(await input('이메일').count(), 0);
      await input('닉네임').fill('소셜수정');
      await button('변경사항 저장').click();
      await page.getByText('회원정보를 저장했어요.').waitFor();
      await button('변경사항 저장').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `social-${width}.png`) });
      await button('회원 탈퇴').click();
      await input('탈퇴 확인 문구').fill('탈퇴합니다');
      await button('탈퇴하기').click();
      await button('로그인').waitFor();
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(
      'PASS: 4 viewport profile forms, unsaved navigation guard, photo stability, nickname verification, password/relogin, exact withdrawal phrase, private storage unchanged, zero page errors',
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
