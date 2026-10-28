// 독립 프로필·임시 origin에서만 수행한다. 사용자 브라우저 자료에는 접근하지 않는다.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../.expo/mock-library-web');
const out = path.resolve(__dirname, '.out/mock-trash-review-fix');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const target = file === root ? path.join(root, 'index.html') : file;
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', { '.html':'text/html', '.js':'application/javascript', '.svg':'image/svg+xml', '.png':'image/png', '.ttf':'font/ttf' }[path.extname(target)] || 'application/octet-stream'); res.end(data);
  });
});
(async()=>{
 let browser;
 try{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'msedge',headless:true});
  const {STORAGE_KEYS}=await import('../src/editor/utils/storageContract.js');const results=[];
  for(const viewport of [{width:1280,height:800},{width:1024,height:768},{width:412,height:892},{width:667,height:375}]){
   const context=await browser.newContext({viewport}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
   const protectedValues={[STORAGE_KEYS.diaries]:JSON.stringify([{id:'qa-local-kept',title:'기기 자료'}]),[`${STORAGE_KEYS.doc}:qa-local-kept`]:'{"pages":[{"id":"keep"}]}'};
   await context.addInitScript(values=>{for(const [k,v]of Object.entries(values))localStorage.setItem(k,v);},protectedValues);
   const button=name=>p.getByRole('button',{name,exact:true});const nav=name=>p.getByRole(Math.min(viewport.width,viewport.height)<600?'tab':'button',{name,exact:true}).last();
   await p.goto(`http://127.0.0.1:${server.address().port}`);await p.getByRole('tab',{name:'한눈에 보기',exact:true}).click();await button('여행 기록 휴지통으로 이동').click();await button('휴지통으로 옮기기').click();await button('처리 결과 닫기').click();
   await nav('휴지통').click();await button('여행 기록 영구 삭제').waitFor();assert.equal(await button('여행 기록 영구 삭제').isDisabled(),false);
   // Dev-only fixture controls may sit behind phone navigation; programmatic clicks only set the scenario.
   // All user-facing purge/cancel/retry actions below use normal Playwright clicks.
   await button('목 응답 설정').click();await button('목 서버 30일 경과').evaluate(el=>el.click());await button('목 응답 설정 닫기').evaluate(el=>el.click());await p.waitForFunction(()=>document.querySelector('[aria-label="여행 기록 복원"]')?.getAttribute('aria-disabled')==='true');
   assert.equal(await button('여행 기록 영구 삭제').isDisabled(),false);await button('여행 기록 영구 삭제').click();await button('취소').click();assert.equal(await button('여행 기록 영구 삭제').count(),1);
   await button('목 응답 설정').click();await button('이동·복원 한 번 실패').evaluate(el=>el.click());await button('목 응답 설정 닫기').evaluate(el=>el.click());await button('여행 기록 영구 삭제').click();await p.screenshot({path:path.join(out,`${viewport.width}-confirm.png`)});await button('영구 삭제하기').click();await button('실패 항목 다시 시도').waitFor();
   assert.equal(await button('여행 기록 영구 삭제').isDisabled(),true);await button('실패 항목 다시 시도').click();await p.getByText('휴지통이 비어 있어요',{exact:true}).waitFor();
   await nav(Math.min(viewport.width,viewport.height)<600?'다이어리':'모든 다이어리').click();await button('함께 쓰는 일기 열기').waitFor();
   for(const[k,v]of Object.entries(protectedValues))assert.equal(await p.evaluate(key=>localStorage.getItem(key),k),v);
   assert.deepEqual(errors,[]);results.push({viewport,pageerrors:errors,permanentButtonVisible:true,expiredTrashCanPurge:true,cancelPreservesRow:true,failedPurgeRetry:true,otherDiaryAndLocalDataPreserved:true});await context.close();
  }
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
