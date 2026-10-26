// 독립 프로필·임시 origin에서만 수행한다. 사용자 브라우저 자료에는 접근하지 않는다.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../.expo/mock-library-web');
const out = path.resolve(__dirname, '.out/mock-library');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const target = file === root ? path.join(root, 'index.html') : file;
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', { '.html':'text/html', '.js':'application/javascript', '.svg':'image/svg+xml', '.png':'image/png', '.ttf':'font/ttf' }[path.extname(target)] || 'application/octet-stream'); res.end(data);
  });
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const viewport of [{width:1280,height:800}, {width:412,height:892}]) {
      const context = await browser.newContext({viewport});
      const p = await context.newPage(); p.setDefaultTimeout(15000);
      const errors=[]; p.on('pageerror', e=>errors.push(e.message));
      const button=name=>p.getByRole('button',{name,exact:true});
      const nav=name=>p.getByRole(viewport.width<600?'tab':'button',{name,exact:true}).last();
      await p.goto(`http://127.0.0.1:${server.address().port}`);
      await p.getByRole('tab',{name:'한눈에 보기',exact:true}).click();
      await button('여행 기록 수정').click();
      const title=p.getByRole('textbox',{name:'다이어리 이름',exact:true});
      await title.fill('저장 후 이동'); await button('완료하기').click();
      await title.waitFor({state:'hidden'}); await nav('휴지통').click();
      await p.getByText('휴지통이 비어 있어요',{exact:true}).waitFor();
      // 목 재조회 및 상세 조회의 지연(각 600ms)을 모두 넘겨 늦은 진입 부재를 확인한다.
      await p.waitForTimeout(1400);
      assert.equal(await p.getByText('다이어리 상세',{exact:true}).count(),0);
      await nav(viewport.width<600?'다이어리':'모든 다이어리').click();
      await button('저장 후 이동 수정').click(); await title.fill('휴지통 전 수정');
      await p.getByRole('button',{name:/저장 한 번 실패/}).click(); await button('완료하기').click();
      await button('같은 입력 다시 저장').waitFor();
      await button('같은 입력 다시 저장 닫기').last().click();
      await button('목 응답 설정').click(); await button('이동·복원 정상').click();
      await button('저장 후 이동 휴지통으로 이동').click(); await button('휴지통으로 옮기기').click();
      await button('처리 결과 닫기').waitFor();
      await button('수정 요청 이어서 확인').click(); await button('같은 입력 다시 저장').click();
      await button('입력 유지하고 최신 내용 확인').click();
      await p.getByText(/휴지통에 있는 다이어리는 수정할 수 없어요/).waitFor();
      assert.equal(await button('완료하기').isDisabled(),true);
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({viewport,navigation:'passed',trashedEdit:'passed',pageErrors:errors}));
      await context.close();
    }
  } finally { await browser?.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
