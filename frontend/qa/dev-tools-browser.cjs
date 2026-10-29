// 독립 origin/profile: 사용자 브라우저나 실제 서버에 접근하지 않는다.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, process.env.DIO_DEVTOOLS_QA_ROOT || '../.expo/dev-api-web');
const out = path.resolve(__dirname, '.out/notifications');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const target = file === root ? path.join(root, 'index.html') : file;
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' }[path.extname(target)] || 'application/octet-stream'); res.end(data);
  });
});
(async () => {
 let browser;
 try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, ...(process.env.DIO_QA_BROWSER_CHANNEL ? { channel: process.env.DIO_QA_BROWSER_CHANNEL } : {}) });
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors=[]; p.on('pageerror', e=>errors.push(e.message));
  const button=name=>p.getByRole('button',{name,exact:true});
  await p.goto(`http://127.0.0.1:${server.address().port}`);
  await button('테스트 도구 열기').click();
  await button('목 생성').click();
  await button('응답 유실').click();
  await p.getByRole('textbox').fill('접기 후 재시도 보존');
  await button('요청 저장').click();
  await button('같은 입력 다시 저장').waitFor();
  await button('저장 검증 닫기').click();
  await button('테스트 도구 닫기').click();
  await p.getByTestId('api-mock-controls').waitFor({state:'hidden'});
  await button('테스트 도구 열기').click();
  await button('목 생성').click();
  assert.equal(await p.getByRole('textbox').inputValue(),'접기 후 재시도 보존');
  await button('같은 입력 다시 저장').click();
  await p.getByText('요청을 완료했어요.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: tool collapse preserves unresolved request and input; retry succeeds; pageerror 0');
 } finally {await browser?.close(); await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
