const {chromium}=require('playwright-core');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const server=http.createServer((req,res)=>{
 if(req.url.split('?')[0]==='/'){res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100vh"></div><script src="/tests/fixtures/photo-source.entry.bundle?platform=web&dev=false&minify=false&lazy=false&hot=false"></script>');return}
 http.get(`http://127.0.0.1:${process.env.EXPO_QA_PORT||8081}${req.url}`,up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res)}).on('error',()=>{res.writeHead(502);res.end('Metro is unavailable')});
});
(async()=>{
 const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
 if(!executablePath||!fs.existsSync(executablePath))throw Error('PLAYWRIGHT_EXECUTABLE_PATH에 설치된 Chromium 브라우저 경로를 지정해 주세요. Metro도 실행해야 합니다.');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath});
  const out=path.join(__dirname,'../.expo/photo-source-results');fs.mkdirSync(out,{recursive:true});
  for(const [width,height] of [[1280,800],[1024,768],[390,844],[844,390],[320,740]]){
   const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
   await page.goto(`http://127.0.0.1:${server.address().port}`,{timeout:120000});
   const button=name=>page.getByRole('button',{name,exact:true});
   await button('새 사진 추가').waitFor();await page.screenshot({path:path.join(out,`${width}x${height}-sources.png`)});
   await button('새 사진 추가').click();await page.getByText('기기 선택됨',{exact:true}).waitFor();
   await button('사진 열기').click();await button('최근 추가한 사진').click();await page.getByText('사진 1',{exact:true}).waitFor();
   assert.equal(await page.getByText('사진 2',{exact:true}).count(),0);
   assert.equal(await button('사진 선택: 사진 4').isDisabled(),true);await page.getByText('5MB 초과',{exact:true}).waitFor();
   await button('더 불러오기').click();await page.getByText('사진 3',{exact:true}).waitFor();
   await page.screenshot({path:path.join(out,`${width}x${height}.png`)});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
   await button('사진 추가로 돌아가기').click();await button('새 사진 추가').waitFor();await button('최근 추가한 사진').click();await button('더 불러오기').click();
   await button('사진 선택: 사진 3').click();await page.getByText('사진 3 선택됨',{exact:true}).waitFor();
   await button('사진 열기').click();await button('닫기').click();assert.equal(await button('최근 추가한 사진').count(),0);
   await page.goto(`http://127.0.0.1:${server.address().port}/?editor=1`,{timeout:120000});
   await button(Math.min(width,height)<600?'사진·GIF':'사진').click();await button('새 사진 추가').waitFor();
   await page.waitForFunction(()=>{const node=document.querySelector('[aria-label="사진 패널"]');if(!node)return false;const box=node.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight+1});
   const box=await page.getByLabel('사진 패널',{exact:true}).boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,JSON.stringify({width,height,box}));
   await page.screenshot({path:path.join(out,`${width}x${height}-editor.png`)});
   await button('닫기').click();assert.equal(await page.getByLabel('사진 패널',{exact:true}).count(),0);assert.deepEqual(errors,[]);
   await context.close();console.log(`PASS ${width}x${height}`);
  }
 }finally{await browser?.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
