// 독립 origin/profile: 사용자 브라우저나 실제 서버에 접근하지 않는다.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../.expo/editor-invitation-web');
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
(async()=>{let browser;try{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true});const p=await browser.newPage({viewport:{width:1280,height:800}});p.setDefaultTimeout(10000);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}`);await p.getByRole('button',{name:'초대 다이어리 이동 검사',exact:true}).click();await p.getByTestId('guard-result').getByText('이동 허용',{exact:true}).waitFor();console.log('LABELS',await p.getByRole('button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label'))));await p.getByRole('button',{name:'텍스트',exact:true}).click();await p.mouse.click(768,257);await p.mouse.click(420,470);console.log('TEXTBOXES',await p.getByRole('textbox').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),placeholder:e.getAttribute('placeholder'),tag:e.tagName}))));await p.getByRole('textbox',{name:'캔버스 텍스트 내용',exact:true}).fill('보존할 편집 내용');await p.getByRole('button',{name:'초대 다이어리 이동 검사',exact:true}).click();await p.getByTestId('guard-result').getByText('이동 차단',{exact:true}).waitFor();console.log('PASS editor blocks invitation transition during text commit/save');await p.getByRole('button',{name:'모든 변경 사항을 이 기기에 자동 저장했어요.',exact:true}).waitFor();await p.getByRole('button',{name:'초대 다이어리 이동 검사',exact:true}).click();await p.getByTestId('guard-result').getByText('이동 허용',{exact:true}).waitFor();fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,'editor-guard.png')});assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>Object.values(localStorage).some(v=>v.includes('보존할 편집 내용'))),true);console.log('PASS saved editor content preserved; pageerror 0');console.log('BUTTONS',await p.getByRole('button').allTextContents());}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
