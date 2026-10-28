// Isolated browser context with HTTP fixtures; real Spring payloads come from DiaryAuthenticatedReadTests.
const { chromium } = require('playwright');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../.expo/diary-auth-web'), out=path.resolve(__dirname,'.out/diary-purge');
const trashed=JSON.parse(fs.readFileSync(process.env.DIO_DIARY_TRASH_CONTRACT_OUTPUT,'utf8')).items[0];
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const target=file===root?path.join(root,'index.html'):file;
  fs.readFile(target,(error,data)=>{if(error){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',{'.html':'text/html','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'}[path.extname(target)]||'application/octet-stream');res.end(data);});
});
(async()=>{
 let browser;
 try{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
  const {STORAGE_KEYS}=await import('../src/editor/utils/storageContract.js');
  for(const viewport of [{width:1280,height:800},{width:1024,height:768},{width:412,height:892},{width:667,height:375}]){
   const context=await browser.newContext({viewport}),p=await context.newPage(),errors=[],calls=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
   const local=JSON.stringify([{id:'local-kept',title:'Local diary'}]);await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:STORAGE_KEYS.diaries,value:local});
   const row={...trashed,diaryTitle:'Purge target',permissions:{...trashed.permissions,canPermanentlyDelete:true}};
   const other={...row,diaryId:'00000000-0000-0000-0000-000000000088',diaryTitle:'Protected diary',myRole:'EDITOR'};
   let complete=false,attempts=0;
   await p.route('**/api/v1/**',async route=>{
    const req=route.request(),url=new URL(req.url());const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname.endsWith('/auth/login'))return send({accessToken:'qa-access',refreshToken:'qa-refresh',expiresIn:900,user:{userId:'1',email:'owner@dio.test',nickname:'QA'}});
    if(url.pathname.endsWith('/unread-count'))return send({unreadCount:0,actionableUnreadCount:0});
    if(url.pathname.endsWith('/notifications'))return send({items:[],hasNext:false,nextCursor:null});
    if(url.pathname.endsWith('/diaries'))return send({items:url.searchParams.get('status')==='trashed'?[...(complete?[]:[row]),other]:[],hasNext:false,nextCursor:null});
    if(req.method()==='DELETE'){
     assert.equal(url.pathname,`/api/v1/diaries/${row.diaryId}`);assert.equal(url.search,'?permanent=true');assert.equal(req.postData(),null);assert.equal(req.headers()['idempotency-key'],undefined);assert.equal(req.headers().authorization,'Bearer qa-access');calls.push(req.url());attempts++;
     if(attempts===1)return send({code:'CLEANUP_ERROR'},500);
     if(!complete){complete=true;return route.abort('failed');}return route.fulfill({status:204});
    }
    throw Error('Unexpected '+url.pathname);
   });
   await p.goto(`http://127.0.0.1:${server.address().port}`);const button=name=>p.getByRole('button',{name,exact:true});
   await p.getByLabel('이메일',{exact:true}).fill('owner@dio.test');await p.getByLabel('비밀번호',{exact:true}).fill('DioMember123!');await button('로그인').click();await button('휴지통 보기').click();await button('Purge target 영구 삭제').waitFor();
   assert.equal(await button('Protected diary 영구 삭제').count(),0);assert.ok((await button('Purge target 영구 삭제').boundingBox()).height>=44);
   await button('Purge target 영구 삭제').click();await button('취소').click();assert.equal(calls.length,0);
   await button('Purge target 영구 삭제').click();await p.getByText(/복원할 수 없어요. 다른 자료에서 쓰는 미디어 원본은 유지해요./).waitFor();await p.screenshot({path:path.join(out,`${viewport.width}-confirm.png`)});await button('영구 삭제').click();
   await button('같은 요청 다시 확인').waitFor();assert.equal(await button('Purge target 영구 삭제').isDisabled(),true);assert.equal(calls.length,1);await p.screenshot({path:path.join(out,`${viewport.width}-retry.png`)});
   await button('같은 요청 다시 확인').click();await p.waitForFunction(()=>[...document.querySelectorAll('[role="alert"]')].some(e=>e.textContent.includes('연결하지 못했어요')));await button('같은 요청 다시 확인').click();
   await p.getByText('다이어리를 영구 삭제했어요.',{exact:true}).waitFor();await p.waitForFunction(()=>!document.querySelector('[aria-label="Purge target 영구 삭제"]'));assert.equal(attempts,3);assert.equal(new Set(calls).size,1);
   assert.ok(await p.getByText('Protected diary',{exact:true}).count()>=1);assert.equal(await p.evaluate(key=>localStorage.getItem(key),STORAGE_KEYS.diaries),local);
   await p.screenshot({path:path.join(out,`${viewport.width}-completed.png`)});assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   results.push({viewport,pageerrors:errors,ownerOnly:true,cancelWithoutRequest:true,cleanupFailureRetry:true,lostResponseRetry:true,deleteAttempts:attempts,otherDiaryPreserved:true,localStoragePreserved:true});await context.close();
  }
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
