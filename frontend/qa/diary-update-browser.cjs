// Isolated browser context with HTTP fixtures; real Spring payloads come from DiaryAuthenticatedReadTests.
const { chromium } = require('playwright');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../.expo/diary-auth-web'), out=path.resolve(__dirname,'.out/diary-update');
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
   const context=await browser.newContext({viewport}),p=await context.newPage(),errors=[],patches=[];
   p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
   let row={...created.diary,diaryTitle:'Original',version:'1'},conflict=true,denied=false;
   await p.route('**/api/v1/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname.endsWith('/auth/login'))return send({accessToken:'qa-access',refreshToken:'qa-refresh',expiresIn:900,user:{userId:'1',email:'owner@dio.test',nickname:'QA'}});
    if(url.pathname.endsWith('/unread-count'))return send({unreadCount:0,actionableUnreadCount:0});
    if(url.pathname.endsWith('/notifications'))return send({items:[],hasNext:false,nextCursor:null});
    if(url.pathname.endsWith('/diaries'))return send({items:[row],hasNext:false,nextCursor:null});
    if(url.pathname.includes('/diaries/')){
     if(req.method()==='PATCH'){
      const input=req.postDataJSON();patches.push(input);assert.equal(req.headers()['idempotency-key'],undefined);
      if(denied)return send({code:'DIARY_OWNER_REQUIRED'},403);
      if(conflict){conflict=false;row={...row,version:'2',coverColor:'#112233',diaryTitle:'Other device'};return send({code:'VERSION_CONFLICT'},409);}
      assert.deepEqual(input,{expectedVersion:'2',diaryTitle:'My draft'});
      row={...row,diaryTitle:input.diaryTitle,version:'3'};return send({diary:row});
     }
     return send({diary:row});
    }
    throw Error('Unexpected '+url.pathname);
   });
   await p.goto(`http://127.0.0.1:${server.address().port}`);const button=name=>p.getByRole('button',{name,exact:true});
   await p.getByLabel('이메일',{exact:true}).fill('owner@dio.test');await p.getByLabel('비밀번호',{exact:true}).fill('DioMember123!');await button('로그인').click();
   await button('Original 수정').click();await p.getByLabel('다이어리 이름',{exact:true}).fill('My draft');
   assert.equal(await p.getByText('페이지 크기',{exact:true}).count(),0);
   await p.screenshot({path:path.join(out,`${viewport.width}-form.png`)});
   await button('변경 저장').click();await button('최신 정보 확인').waitFor();assert.equal(await button('변경 저장').isDisabled(),true);
   assert.equal(await p.getByLabel('다이어리 이름',{exact:true}).inputValue(),'My draft');
   await p.screenshot({path:path.join(out,`${viewport.width}-conflict.png`)});
   await button('최신 정보 확인').click();await p.getByText(/현재 저장된 이름: Other device/).waitFor();assert.equal(patches.length,1);
   assert.equal(await p.getByLabel('다이어리 이름',{exact:true}).inputValue(),'My draft');
   await p.screenshot({path:path.join(out,`${viewport.width}-review.png`)});
   await button('변경 저장').click();await button('My draft 열기').waitFor();assert.equal(row.coverColor,'#112233');assert.equal(patches.length,2);
   assert.equal(await button('My draft 휴지통으로 이동').count(),1);
   await button('My draft 수정').click();await p.getByLabel('다이어리 이름',{exact:true}).fill('Denied');denied=true;
   await button('변경 저장').click();await p.getByText('소유자만 다이어리 정보를 수정할 수 있어요.',{exact:true}).first().waitFor();
   assert.equal(await button('변경 저장').isDisabled(),true);assert.equal(patches.length,3);
   await p.screenshot({path:path.join(out,`${viewport.width}-forbidden.png`)});
   assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   results.push({viewport,pageerrors:errors,conflictPreservesInput:true,explicitReview:true,unrelatedCoverPreserved:true,forbiddenBlocked:true,patchAttempts:patches.length});await context.close();
  }
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
