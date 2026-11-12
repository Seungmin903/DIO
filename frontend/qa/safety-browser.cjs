const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, '.out/safety');
const url = process.env.DIO_SAFETY_QA_URL || 'http://localhost:8094';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.DIO_QA_BROWSER_CHANNEL || 'chrome', args: ['--no-proxy-server', '--no-sandbox', '--disable-gpu'] });
  let activePage;
  try {
    fs.mkdirSync(out, { recursive: true });
    for (const viewport of [{ width: 412, height: 892 }, { width: 1280, height: 800 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      activePage = page;
      const errors = [], serverCalls = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', r => { if (/localhost:8080|\/api\//.test(r.url())) serverCalls.push(r.url()); });
      const button = name => page.getByRole('button', { name, exact: true });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await button('공유 화면 열기').click({ timeout: 180000 });
      await button('전체 참여자 보기').click();
      await page.getByText('현재 참여 중 · 3명', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, `participants-${viewport.width}.png`) });
      assert.equal(await button('소연 메뉴').count(), 0);
      await button('모아 메뉴').click(); await button('신고하기').click();
      assert.equal(await button('신고 화면 확인하기').isDisabled(), true);
      await page.getByRole('radio', { name: '기타', exact: true }).click();
      await page.getByRole('textbox', { name: '상세 설명', exact: true }).fill('공유 다이어리에서 발생한 문제에 대한 구체적인 설명입니다.');
      await button('사진 첨부 (0/3)').click();
      await button('증빙 사진 1 확대').click(); await button('사진 닫기').click();
      await page.screenshot({ path: path.join(out, `report-${viewport.width}.png`) });
      await button('이전 화면').click(); await button('취소').click();
      assert.equal(await page.getByRole('textbox', { name: '상세 설명', exact: true }).inputValue(), '공유 다이어리에서 발생한 문제에 대한 구체적인 설명입니다.');
      await button('신고 화면 확인하기').click();
      await page.getByText('신고 화면 확인을 마쳤어요', { exact: true }).waitFor();
      await button('이 사용자 차단하기').click(); await button('차단하기').click();
      await page.getByText('미리보기 상태를 변경했어요. 실제 계정에는 적용되지 않아요.', { exact: true }).waitFor();
      await button('확인').click(); await button('이전 화면').click(); await button('공유 창 닫기').click();
      await button('마이페이지 열기').click(); await button('차단한 사용자').click();
      await page.getByText('전체 1명', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, `blocks-${viewport.width}.png`) });
      await button('차단 해제').click();
      await button('차단 해제').last().click();
      await page.getByText('차단한 사용자가 없어요', { exact: true }).waitFor();
      await button('이전 화면').click(); await button('미리보기 홈').click();
      // Failed report preserves the form and evidence, then permits a deliberate retry.
      await button('다음 신고 실패 재현').click(); await button('참여자 화면 열기').click();
      await button('모아 메뉴').click(); await button('신고하기').click();
      await page.getByRole('radio', { name: '욕설·괴롭힘', exact: true }).click();
      await page.getByRole('textbox', { name: '상세 설명', exact: true }).fill('실패 후에도 남아 있어야 하는 설명');
      await button('사진 첨부 (0/3)').click(); await button('신고 화면 확인하기').click();
      await page.getByText(/미리보기 요청 실패예요/).waitFor();
      assert.equal(await page.getByRole('textbox', { name: '상세 설명', exact: true }).inputValue(), '실패 후에도 남아 있어야 하는 설명');
      await button('증빙 사진 1 확대').waitFor();
      await page.getByRole('radio', { name: '기타', exact: true }).click();
      await page.getByRole('textbox', { name: '상세 설명', exact: true }).fill('전송 후 수정한 설명');
      await button('증빙 사진 1 삭제').click();
      await page.screenshot({ path: path.join(out, `report-retry-${viewport.width}.png`) });
      await button('처음 전송한 내용으로 되돌리기').click();
      assert.equal(await page.getByRole('textbox', { name: '상세 설명', exact: true }).inputValue(), '실패 후에도 남아 있어야 하는 설명');
      assert.match(await page.getByRole('radio', { name: '욕설·괴롭힘', exact: true }).innerText(), /◉/);
      await button('증빙 사진 1 확대').waitFor(); await button('신고 화면 확인하기').click();
      await button('이 사용자 차단하기').click(); await button('차단하기').click();
      await button('확인').click(); await button('이전 화면').click();
      // Warning is non-destructive; dismissal applies to this account and diary only.
      await button('공유 다이어리 열기').click();
      await page.getByText('차단한 사용자가 함께하고 있어요', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, `warning-${viewport.width}.png`) });
      await button('돌아가기').click();
      assert.equal(await page.getByText('다이어리가 열렸어요 · 참여·편집 권한 유지', { exact: true }).count(), 0);
      await button('공유 다이어리 열기').click();
      await page.getByRole('checkbox', { name: '이 다이어리에서 다시 보지 않기', exact: true }).click(); await button('계속하기').click();
      await page.getByText('다이어리가 열렸어요 · 참여·편집 권한 유지', { exact: true }).waitFor();
      await button('공유 다이어리 열기').click();
      await page.getByText('다이어리가 열렸어요 · 참여·편집 권한 유지', { exact: true }).waitFor();
      assert.equal(await button('계속하기').count(), 0);
      await button('샘플 계정 전환').click(); await button('차단 목록 열기').click();
      await page.getByText('차단한 사용자가 없어요', { exact: true }).waitFor(); await button('이전 화면').click();
      await button('서버 미연결 전환').click(); await button('참여자 화면 열기').click();
      await page.getByText(/로그인 후 현재 참여자를 조회할 수 있어요/).waitFor();
      await button('모아 메뉴').click(); assert.equal(await button('차단하기').isDisabled(), true);
      await button('신고하기').click();
      await page.getByRole('radio', { name: '기타', exact: true }).click();
      await page.getByRole('textbox', { name: '상세 설명', exact: true }).fill('작성할 수 있지만 전송되지 않는 신고');
      assert.equal(await button('신고 접수하기').isDisabled(), true);
      assert.deepEqual(serverCalls, []); assert.deepEqual(errors, []);
      await context.close(); console.log(`Safety browser QA passed: ${viewport.width}×${viewport.height}`);
    }
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage.screenshot({ path: path.join(out, 'failure.png') });
      console.error((await activePage.locator('body').innerText()).slice(-3500));
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
