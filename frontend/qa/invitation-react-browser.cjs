const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
(async()=>{
 let input='';for await(const chunk of process.stdin)input+=chunk;
 const {baseUrl,diaries}=JSON.parse(input);assert.match(baseUrl,/^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/);
 const root=path.resolve(__dirname,'../.expo/invitation250-web');
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const target=file===root?path.join(root,'index.html'):file;fs.readFile(target,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.svg':'image/svg+xml','.ttf':'font/ttf','.png':'image/png'})[path.extname(target)]||'application/octet-stream');res.end(b);});});
 let browser,page;
 try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({channel:'msedge',headless:true});
 page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(12000);page.on('requestfailed',r=>console.log('FAILED',r.method(),r.failure()?.errorText));const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
 // API 응답은 조작하지 않고 목적지만 격리 Spring으로 바꾼다.
 await page.route('**/api/v1/**',async route=>{const old=new URL(route.request().url());const target=baseUrl+old.pathname.split('/api/v1')[1]+old.search;if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type,x-dio-access-token'}});return;}const headers={...route.request().headers()};delete headers.origin;const response=await route.fetch({url:target,headers});await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':origin}});});
 const login=await fetch(baseUrl+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'e2e-a@example.com',password:'DioMember123!'})}).then(r=>r.json());
 for(const id of diaries.slice(3,5)) {const r=await fetch(`${baseUrl}/diaries/${id}/invites/email`,{method:'POST',headers:{Authorization:`Bearer ${login.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({email:'e2e-b@example.com'})});assert.equal(r.status,202);}
 await page.goto(origin);await page.getByPlaceholder('이메일을 입력해 주세요').fill('e2e-b@example.com');await page.getByPlaceholder('비밀번호를 입력해 주세요',{exact:true}).fill('DioMember123!');await page.getByRole('button',{name:'로그인',exact:true}).click();
 await page.getByRole('button',{name:/^(회원 목록 새로고침|이전 생성 확인)$/}).waitFor();
 await page.getByRole('button',{name:/^알림(?:[, ·]|$)/}).first().click();
 await page.getByRole('button',{name:/^초대 확인 /}).first().click();
 await page.getByRole('button',{name:'초대 화면으로 이동',exact:true}).click();
 await page.getByRole('button',{name:'참여 프로필 설정',exact:true}).click();await page.getByRole('button',{name:'수락하고 참여하기',exact:true}).waitFor();
 await page.getByLabel('다이어리 닉네임',{exact:true}).fill('참여자');
 await page.getByRole('button',{name:'수락하고 참여하기',exact:true}).click();
 await page.getByText('다이어리에 참여했어요.',{exact:true}).waitFor();
 fs.mkdirSync(path.join(__dirname,'.out/react250'),{recursive:true});await page.screenshot({path:path.join(__dirname,'.out/react250/accepted.png')});
 // 새 페이지 로그인으로 남은 초대를 열고, 공유 목록의 거절(삭제) UI 사용.
 await page.reload();await page.getByPlaceholder('이메일을 입력해 주세요').fill('e2e-b@example.com');await page.getByPlaceholder('비밀번호를 입력해 주세요',{exact:true}).fill('DioMember123!');await page.getByRole('button',{name:'로그인',exact:true}).click();
 await page.getByRole('button',{name:/^알림(?:[, ·]|$)/}).first().click();await page.getByRole('button',{name:/^초대 확인 /}).nth(1).click();await page.getByRole('button',{name:'초대 화면으로 이동',exact:true}).click();
 await page.getByRole('button',{name:/초대 삭제/}).first().click();await page.getByRole('button',{name:'삭제',exact:true}).click();
 await page.getByText('삭제했어요.',{exact:false}).first().waitFor();
 await page.screenshot({path:path.join(__dirname,'.out/react250/declined.png')});assert.deepEqual(errors,[]);
 console.log('PASS React notifications → invitation → accept/decline against isolated Spring; pageerror 0');
 }catch(error){if(page){fs.mkdirSync(path.join(__dirname,'.out/react250'),{recursive:true});await page.screenshot({path:path.join(__dirname,'.out/react250/failure.png')});console.log((await page.locator('body').innerText()).slice(0,4000));}throw error;}finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
