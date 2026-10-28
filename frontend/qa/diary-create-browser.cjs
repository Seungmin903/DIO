// Isolated browser context with HTTP fixtures; real Spring payloads come from DiaryAuthenticatedReadTests.
const { chromium } = require('playwright');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../.expo/diary-auth-web'), out=path.resolve(__dirname,'.out/diary-create');
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
  try{
    fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
    const {STORAGE_KEYS}=await import('../src/editor/utils/storageContract.js');
    for(const viewport of [{width:1280,height:800},{width:1024,height:768},{width:412,height:892},{width:667,height:375}]){
      const context=await browser.newContext({viewport}),p=await context.newPage(),errors=[],requests=[];
      p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
      const protectedValues={[STORAGE_KEYS.diaries]:JSON.stringify([{id:'qa-local',title:'기존 기기 기록'}]),[`${STORAGE_KEYS.doc}:qa-local`]:'{"pages":[{"id":"keep"}]}'};
      await context.addInitScript(values=>{for(const [key,value]of Object.entries(values))localStorage.setItem(key,value);},protectedValues);
      let committed=null,account=1,lose=true;const postKeys=[];
      await p.route('**/api/v1/**',async route=>{
        const req=route.request(),url=new URL(req.url());requests.push({method:req.method(),path:url.pathname});
        const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
        if(url.pathname.endsWith('/auth/login'))return send({accessToken:'qa-access',refreshToken:'qa-refresh',expiresIn:900,user:{userId:String(account),email:'owner@dio.test',nickname:'QA'}});
        if(url.pathname.endsWith('/auth/logout'))return route.fulfill({status:204});
        if(url.pathname.endsWith('/unread-count'))return send({unreadCount:0,actionableUnreadCount:0});
        if(url.pathname.endsWith('/notifications'))return send({items:[],hasNext:false,nextCursor:null});
        if(url.pathname.endsWith('/diaries')&&req.method()==='POST'){
          const input=req.postDataJSON(),key=req.headers()['idempotency-key'];postKeys.push(key);assert.equal(req.headers().authorization,'Bearer qa-access');
          assert.equal(input.firstPage.type,'BLANK');assert.equal(input.firstPage.orientation,'portrait');assert.equal(input.visibility,undefined);
          if(!committed)committed={...created,diary:{...created.diary,diaryTitle:input.diaryTitle,coverStyle:input.coverStyle,coverColor:input.coverColor}};
          if(lose){lose=false;return route.abort('failed');}assert.equal(key,postKeys[0]);return send(committed,201);
        }
        if(url.pathname.endsWith('/diaries'))return send({items:committed&&account===1?[committed.diary]:[],hasNext:false,nextCursor:null});
        if(url.pathname.includes('/diaries/'))return send({diary:committed.diary});
        throw Error('Unexpected '+url.pathname);
      });
      await p.goto(`http://127.0.0.1:${server.address().port}`);
      const button=name=>p.getByRole('button',{name,exact:true});
      const login=async()=>{await p.getByLabel('이메일',{exact:true}).fill('owner@dio.test');await p.getByLabel('비밀번호',{exact:true}).fill('DioMember123!');await button('로그인').click();};
      await login();await p.getByRole('heading',{name:'내 계정 보관함'}).waitFor();
      await button('새 다이어리 만들기').click();
      await p.getByLabel('다이어리 이름',{exact:true}).fill('서버 생성 기록');
      await p.getByRole('radio',{name:'세로형',exact:true}).click();
      await p.getByText('개인 다이어리에 무지 첫 페이지 1장을 만들어요.',{exact:true}).waitFor();
      await p.screenshot({path:path.join(out,`${viewport.width}-form.png`)});
      await button('다이어리 만들기').click();await button('같은 요청으로 다시 확인').waitFor();
      assert.equal(postKeys.length,1);assert.equal(await button('다이어리 만들기').isDisabled(),true);
      const saved=JSON.parse(await p.evaluate(()=>localStorage.getItem('dio:account-diary-creation:v1:1')));assert.equal(saved.key,postKeys[0]);
      await p.screenshot({path:path.join(out,`${viewport.width}-retry.png`)});
      await p.reload();await login();await button('이전 생성 요청 확인').click();
      assert.equal(await p.getByLabel('다이어리 이름',{exact:true}).inputValue(),'서버 생성 기록');
      await button('같은 요청으로 다시 확인').click();await button('서버 생성 기록 열기').waitFor();
      assert.deepEqual(postKeys,[saved.key,saved.key]);
      assert.equal(await p.evaluate(()=>localStorage.getItem('dio:account-diary-creation:v1:1')),null);
      await button('서버 생성 기록 열기').click();await p.getByText('개인 · 소유자 · 1페이지',{exact:true}).waitFor();
      await p.screenshot({path:path.join(out,`${viewport.width}-created.png`)});await button('상세 닫기').click();
      for(const [key,value]of Object.entries(protectedValues))assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),value);
      await button('로그아웃').click();account=2;await login();await button('새 다이어리 만들기').waitFor();assert.equal(await button('서버 생성 기록 열기').count(),0);
      assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      results.push({viewport,pageerrors:errors,postAttempts:postKeys.length,createdDiaries:1,sameKeyAfterReload:true,localStoragePreserved:true});await context.close();
    }
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
