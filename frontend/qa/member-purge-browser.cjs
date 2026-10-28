const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../.expo/member-contract-web'),out=path.resolve(__dirname,'.out/member-purge');
const source=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../backend/build/contracts/member-diary-purge-http.json'),'utf8'));
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();const target=file===root?path.join(root,'index.html'):file;fs.readFile(target,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',{'.html':'text/html','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf'}[path.extname(target)]||'application/octet-stream');res.end(data);});});
(async()=>{let browser;try{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
for(const viewport of [{width:1280,height:800},{width:1024,height:768},{width:412,height:892},{width:667,height:375}]){
 const context=await browser.newContext({viewport}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
 let cancelNext=false,dialogs=0;p.on('dialog',d=>{if(d.type()!=='confirm')return d.accept();dialogs++;assert.match(d.message(),/공용 미디어 원본은 유지/);return cancelNext?(cancelNext=false,d.dismiss()):d.accept()});
 let present=true,deletes=0,mode='lost',failList=false,terminal=0;
 const item={...source.trash.items[0],diaryTitle:'영구 삭제 QA'},id=item.diaryId;
 const noPermission={...item,diaryId:'99999999-2222-4333-8444-555555555555',diaryTitle:'권한 없음',canPermanentlyDelete:false,canRestore:false};
 const documentKey=`dio:member:v1:101:doc:${id}`;await context.addInitScript(key=>{localStorage.setItem('dio:diary:list:v1','guest-kept');localStorage.setItem(key,'local-doc-kept')},documentKey);
 await p.route('**/api/v1/**',async route=>{const req=route.request(),u=new URL(req.url()),send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 if(u.pathname.endsWith('/auth/login'))return send({accessToken:'qa-access',refreshToken:'qa-refresh',expiresIn:900,user:{userId:'101',email:'qa@dio.test',nickname:'QA'}});
 if(u.pathname.endsWith('/notifications/unread-count'))return send({unreadCount:0,actionableUnreadCount:0});if(u.pathname.endsWith('/notifications'))return send({items:[],hasNext:false,nextCursor:null});
 if(u.pathname.endsWith('/member/diaries/trash'))return send({items:[...(present?[item]:[]),noPermission],hasNext:false,nextCursor:null});
 if(u.pathname.endsWith('/purge')){assert.equal(u.pathname,`/api/v1/member/diaries/${id}/purge`);assert.equal(req.method(),'DELETE');assert.equal(req.postData(),null);assert.equal(u.search,'');deletes++;
  if(terminal)return send({status:terminal,code:terminal===403?'DIARY_OWNER_REQUIRED':'DIARY_NOT_TRASHED',detail:'terminal'},terminal);
  if(mode==='503'){mode='ok';return send({status:503,code:'DIARY_PERSISTENCE_UNAVAILABLE',detail:'retry'},503)}
  present=false;if(mode==='lost'){mode='ok';return route.abort('failed')}if(mode==='refresh'){mode='ok';failList=true}return route.fulfill({status:204});}
 if(u.pathname.endsWith('/member/diaries'))return failList?send({status:503,code:'UNAVAILABLE',detail:'retry'},503):send({items:[],hasNext:false,nextCursor:null});
 throw Error('Unexpected '+req.method()+' '+u.pathname);
 });
 const button=name=>p.getByRole('button',{name,exact:true}),nav=name=>p.getByRole(Math.min(viewport.width,viewport.height)<600?'tab':'button',{name,exact:true}).last();
 await p.goto(`http://127.0.0.1:${server.address().port}`);await p.getByPlaceholder('이메일을 입력해 주세요').fill('qa@dio.test');await p.getByPlaceholder('비밀번호를 입력해 주세요',{exact:true}).fill('TestOnly123!');await button('로그인').click();await button('회원 목록 새로고침').waitFor();await nav('휴지통').click();await button('영구 삭제 QA 영구 삭제').waitFor();
 assert.equal(await button('권한 없음 영구 삭제').count(),0);const bounds=await button('영구 삭제 QA 영구 삭제').boundingBox();assert.ok(bounds.height>=44&&bounds.width>=44);
 cancelNext=true;await button('영구 삭제 QA 영구 삭제').click();assert.equal(deletes,0);
 await button('영구 삭제 QA 영구 삭제').click();await button('휴지통 작업 다시 시도').click();await button('영구 삭제 QA 영구 삭제').waitFor({state:'detached'});assert.equal(deletes,2);
 present=true;mode='503';await button('휴지통 새로고침').click();await button('영구 삭제 QA 영구 삭제').click();await button('휴지통 작업 다시 시도').click();await button('영구 삭제 QA 영구 삭제').waitFor({state:'detached'});assert.equal(deletes,4);
 present=true;mode='refresh';await button('휴지통 새로고침').click();await button('영구 삭제 QA 영구 삭제').click();await button('변경 후 목록 다시 확인').waitFor();const committed=deletes;failList=false;await button('변경 후 목록 다시 확인').click();await button('영구 삭제 QA 영구 삭제').waitFor({state:'detached'});assert.equal(deletes,committed);
 present=true;terminal=403;await button('휴지통 새로고침').click();await button('영구 삭제 QA 영구 삭제').click();await p.getByText('소유자만 변경할 수 있어요.',{exact:true}).waitFor();assert.equal(await button('휴지통 작업 다시 시도').count(),0);
 assert.equal(await p.evaluate(()=>localStorage.getItem('dio:diary:list:v1')),'guest-kept');assert.equal(await p.evaluate(k=>localStorage.getItem(k),documentKey),'local-doc-kept');assert.deepEqual(errors,[]);await p.screenshot({path:path.join(out,`${viewport.width}-terminal.png`)});
 results.push({viewport,pageerrors:errors,cancelPreserved:true,responseLossRetry204:true,server503Retry:true,knownCommitRefreshOnly:true,forbiddenStopsRetry:true,permissionButtonHidden:true,localDataPreserved:true,deletes,dialogs});await context.close();
}fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
