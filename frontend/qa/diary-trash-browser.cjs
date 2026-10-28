// Isolated browser context with HTTP fixtures; real Spring payloads come from DiaryAuthenticatedReadTests.
const { chromium } = require('playwright');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../.expo/diary-auth-web'), out=path.resolve(__dirname,'.out/diary-trash');
const created=JSON.parse(fs.readFileSync(process.env.DIO_DIARY_CREATE_CONTRACT_OUTPUT,'utf8'));
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const target=file===root?path.join(root,'index.html'):file;
  fs.readFile(target,(error,data)=>{if(error){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',{'.html':'text/html','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'}[path.extname(target)]||'application/octet-stream');res.end(data);});
});
(async()=>{
 let browser;
 try {
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
  for(const viewport of [{width:1280,height:800},{width:1024,height:768},{width:412,height:892},{width:667,height:375}]){
   const context=await browser.newContext({viewport}),p=await context.newPage(),errors=[],calls=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
   const {STORAGE_KEYS}=await import('../src/editor/utils/storageContract.js');const preserved=JSON.stringify([{id:'local-kept',title:'My local diary'}]);
   await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:STORAGE_KEYS.diaries,value:preserved});
   let row={...created.diary,diaryTitle:'My diary',version:'1'},lostDelete=true,lostRestore=true,lateExpired=false;
   const editor={...row,diaryId:'00000000-0000-0000-0000-000000000022',diaryTitle:'Editor diary',myRole:'EDITOR',permissions:{...row.permissions,canEditMetadata:false,canTrash:false}};
   const expired={...row,diaryId:'00000000-0000-0000-0000-000000000033',diaryTitle:'Expired diary',deletedAt:'2026-01-01T00:00:00Z',expiresAt:'2026-01-31T00:00:00Z',permissions:{...row.permissions,canEditMetadata:false,canTrash:false,canRestore:false}};
   const late={...expired,diaryId:'00000000-0000-0000-0000-000000000044',diaryTitle:'Late diary',permissions:{...expired.permissions,canRestore:true}};
   const sendPage=(route,rows)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:rows,nextCursor:null,hasNext:false})});
   await p.route('**/api/v1/**',async route=>{
    const req=route.request(),url=new URL(req.url());const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname.endsWith('/auth/login'))return send({accessToken:'qa-access',refreshToken:'qa-refresh',expiresIn:900,user:{userId:'1',email:'owner@dio.test',nickname:'QA'}});
    if(url.pathname.endsWith('/unread-count'))return send({unreadCount:0,actionableUnreadCount:0});
    if(url.pathname.endsWith('/notifications'))return send({items:[],hasNext:false,nextCursor:null});
    if(url.pathname.endsWith('/diaries'))return sendPage(route,url.searchParams.get('status')==='trashed'?[...(row.deletedAt?[row]:[]),expired,{...late,permissions:{...late.permissions,canRestore:!lateExpired}}]:[...(row.deletedAt?[]:[row]),editor]);
    if(req.method()==='DELETE') {
     calls.push('trash');assert.equal(req.postData(),null);assert.equal(url.search,'');
     if(!row.deletedAt)row={...row,deletedAt:'2026-10-27T12:00:00Z',expiresAt:'2026-11-26T12:00:00Z',version:'2',permissions:{...row.permissions,canTrash:false,canEditMetadata:false,canRestore:true}};
     if(lostDelete){lostDelete=false;return route.abort('failed');}return route.fulfill({status:204});
    }
    if(url.pathname.endsWith('/restore')) {
     assert.equal(req.postData(),null);assert.equal(req.headers()['idempotency-key'],undefined);
     if(url.pathname.includes(late.diaryId)){lateExpired=true;calls.push('expired');return send({code:'DIARY_RESTORE_EXPIRED'},410);}
     calls.push('restore');row={...row,deletedAt:null,expiresAt:null,version:'3',permissions:{...row.permissions,canRestore:false,canTrash:true,canEditMetadata:true}};
     if(lostRestore){lostRestore=false;return route.abort('failed');}return send({diary:row});
    }
    return send({diary:row});
   });
   await p.goto(`http://127.0.0.1:${server.address().port}`);const button=name=>p.getByRole('button',{name,exact:true});
   await p.getByLabel('이메일',{exact:true}).fill('owner@dio.test');await p.getByLabel('비밀번호',{exact:true}).fill('DioMember123!');await button('로그인').click();
   await button('My diary 휴지통으로 이동').waitFor();assert.equal(await button('Editor diary 휴지통으로 이동').count(),0);
   assert.ok((await button('My diary 휴지통으로 이동').boundingBox()).height>=44);
   await button('My diary 휴지통으로 이동').click();await button('취소').click();assert.equal(calls.length,0);
   await button('My diary 휴지통으로 이동').click();await p.screenshot({path:path.join(out,`${viewport.width}-confirm.png`)});
   assert.ok((await button('휴지통으로 이동').boundingBox()).height>=44);await button('휴지통으로 이동').click();await button('같은 요청 다시 확인').waitFor();await button('같은 요청 다시 확인').click();
   await p.getByText('휴지통으로 이동했어요.',{exact:true}).waitFor();await button('휴지통 보기').click();await button('My diary 복원').waitFor();
   assert.equal(await button('Expired diary 복원').isDisabled(),true);assert.equal(await p.getByRole('button',{name:/영구 삭제/}).count(),0);
   assert.ok((await button('My diary 복원').boundingBox()).height>=44);await p.screenshot({path:path.join(out,`${viewport.width}-trash.png`)});
   await button('My diary 복원').click();await button('같은 요청 다시 확인').waitFor();await button('같은 요청 다시 확인').click();await p.getByText('다이어리를 복원했어요.',{exact:true}).waitFor();
   await button('Late diary 복원').click();await p.getByText('30일 복원 기한이 지났어요. 더 이상 복원할 수 없어요.',{exact:true}).waitFor();
   await p.waitForFunction(()=>[...document.querySelectorAll('[role="button"]')].find(e=>e.getAttribute('aria-label')==='Late diary 복원')?.getAttribute('aria-disabled')==='true');
   await p.screenshot({path:path.join(out,`${viewport.width}-expired.png`)});
   await button('보관함 보기').click();await button('My diary 열기').waitFor();
   assert.deepEqual(calls,['trash','trash','restore','restore','expired']);assert.equal(await p.evaluate(key=>localStorage.getItem(key),STORAGE_KEYS.diaries),preserved);
   assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   results.push({viewport,pageerrors:errors,ownerOnly:true,deleteRetryPreservesTimestamp:true,restoreRetry:true,expiryBlocksRestore:true,localStoragePreserved:true,minimumActionHeight:44});await context.close();
  }
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
