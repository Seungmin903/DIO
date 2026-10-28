// Isolated browser context with HTTP fixtures; real Spring payloads come from DiaryAuthenticatedReadTests.
const { chromium } = require('playwright');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../.expo/diary-auth-web'), out=path.resolve(__dirname,'.out/diary-auth');
const contract=JSON.parse(fs.readFileSync(process.env.DIO_DIARY_CONTRACT_OUTPUT,'utf8'));
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
    for(const viewport of [{width:1280,height:800},{width:412,height:892}]){
      const context=await browser.newContext({viewport}),p=await context.newPage(),errors=[],requests=[];
      p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
      const protectedValues={[STORAGE_KEYS.diaries]:JSON.stringify([{id:'qa-local',title:'기존 기기 기록'}]),[`${STORAGE_KEYS.doc}:qa-local`]:'{"pages":[{"id":"keep"}]}'};
      await context.addInitScript(values=>{for(const [key,value]of Object.entries(values))localStorage.setItem(key,value);},protectedValues);
      let failList=false,failDetail=false,empty=false,account=1;
      await p.route('**/api/v1/**',async route=>{
        const req=route.request(),url=new URL(req.url());requests.push({method:req.method(),path:url.pathname,query:url.search});
        const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
        if(url.pathname.endsWith('/auth/login'))return send({accessToken:'qa-access',refreshToken:'qa-refresh',expiresIn:900,user:{userId:String(account),email:'owner@dio.test',nickname:'QA'}});
        if(url.pathname.endsWith('/auth/logout'))return route.fulfill({status:204});
        if(url.pathname.endsWith('/unread-count'))return send({unreadCount:0,actionableUnreadCount:0});
        if(url.pathname.endsWith('/notifications'))return send({items:[],hasNext:false,nextCursor:null});
        if(url.pathname.endsWith('/diaries')){
          assert.equal(req.headers().authorization,'Bearer qa-access');
          if(failList){failList=false;return send({code:'SERVER_ERROR'},500);}
          let rows=empty?[]:contract.list.items;
          if(url.searchParams.get('filter')==='shared')rows=rows.filter(r=>r.visibility!=='PRIVATE');
          if(url.searchParams.get('favorite')==='true')rows=rows.filter(r=>r.myMembership.isFavorite);
          if(url.searchParams.get('q'))rows=rows.filter(r=>r.diaryTitle.includes(url.searchParams.get('q')));
          const offset=Number(url.searchParams.get('cursor')||0),items=rows.slice(offset,offset+2),hasNext=offset+2<rows.length;
          return send({items,hasNext,nextCursor:hasNext?String(offset+2):null});
        }
        if(url.pathname.includes('/diaries/')){
          if(failDetail)return send({code:'DIARY_NOT_FOUND'},404);
          const diary=contract.list.items.find(r=>url.pathname.endsWith(r.diaryId));return send({diary});
        }
        throw Error('Unexpected request '+req.method()+' '+url.pathname);
      });
      await p.goto(`http://127.0.0.1:${server.address().port}`);
      const button=name=>p.getByRole('button',{name,exact:true});
      const login=async()=>{await p.getByLabel('이메일',{exact:true}).fill('owner@dio.test');await p.getByLabel('비밀번호',{exact:true}).fill('DioMember123!');await button('로그인').click();};
      await login();await p.getByRole('heading',{name:'내 계정 보관함'}).waitFor();
      const first=contract.list.items[0];await button(first.diaryTitle+' 열기').waitFor();
      await button('새 다이어리 만들기').waitFor();
      await button('더 보기').click();await button(contract.list.items[2].diaryTitle+' 열기').waitFor();
      await button(first.diaryTitle+' 열기').click();await p.getByText('다이어리 상세',{exact:true}).waitFor();
      await p.getByText('계정 다이어리의 수정·편집은 준비 중이에요.',{exact:true}).waitFor();
      await p.screenshot({path:path.join(out,`${viewport.width}-detail.png`)});await button('상세 닫기').click();
      failDetail=true;await button(first.diaryTitle+' 열기').click();await p.getByText('다이어리를 찾을 수 없어요.',{exact:true}).waitFor();await button('상세 닫기').click();failDetail=false;
      await p.getByRole('tab',{name:'공유 다이어리',exact:true}).click();await button(first.diaryTitle+' 열기').waitFor();
      assert(requests.some(r=>r.query.includes('filter=shared')));
      failList=true;await button('목록 새로고침').click();await button('다시 불러오기').waitFor();await button('다시 불러오기').click();
      await button('다시 불러오기').waitFor({state:'detached'});
      await button('알림 0개').click();await button('알림 닫기').waitFor();await button('알림 닫기').click();
      await p.waitForTimeout(350); // wait for the React Native modal fade to finish before capturing
      await p.screenshot({path:path.join(out,`${viewport.width}-list.png`)});
      for(const [key,value]of Object.entries(protectedValues))assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),value);
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await button('로그아웃').click();empty=true;account=2;await login();await button('새 다이어리 만들기').waitFor();
      assert.equal(await button(first.diaryTitle+' 열기').count(),0);
      assert.deepEqual(errors,[]);assert(!requests.some(r=>r.path.includes('/diaries')&&r.method!=='GET'));
      results.push({viewport,pageerrors:errors,requests:requests.length,localStoragePreserved:true,accountSwitch:true});await context.close();
    }
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
