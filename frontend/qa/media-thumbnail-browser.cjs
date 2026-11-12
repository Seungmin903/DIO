// Real frontend runtime -> authenticated Spring API -> disposable H2/local storage.
const {chromium}=require('playwright-core');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const server=http.createServer((req,res)=>{
 if(req.url.split('?')[0]==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100vh"></div><script src="/tests/fixtures/media-thumbnail.entry.bundle?platform=web&dev=true&minify=false&lazy=false&hot=false"></script>')}
 http.get(`http://127.0.0.1:18568${req.url}`,up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res)}).on('error',()=>{res.writeHead(502);res.end('Metro unavailable')});
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(18569,'127.0.0.1',resolve));
  browser=await chromium.launch({channel:'msedge',headless:true});
  const out=path.join(__dirname,'../.expo/media-thumbnail-qa');fs.mkdirSync(out,{recursive:true});
  for(const [width,height] of [[390,844],[1280,800]]){
   const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[],requests=[];
   page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.url().includes('/api/v1/media'))requests.push(r.url())});
   await page.goto('http://127.0.0.1:18569',{timeout:180000});
   const preview=()=>page.getByLabel('사진 미리보기: old-photo-1.png',{exact:true});
   try{await preview().waitFor()}catch(error){await page.screenshot({path:path.join(out,`${width}x${height}-failure.png`)});console.error(await page.locator('body').innerText());console.error(errors);throw error}
   await page.waitForFunction(()=>{
    const node=document.querySelector('[aria-label="사진 미리보기: old-photo-1.png"]');
    const image=node?.tagName==='IMG'?node:node?.querySelector('img');return image?.complete&&image.naturalWidth>0
   });
   assert.equal(requests.filter(url=>/\/file$/.test(url)).length,0,'클릭 전 원본 요청 금지');
   const thumbnailRequests=requests.filter(url=>/\/thumbnail$/.test(url)).length;
   assert.ok(thumbnailRequests>0&&thumbnailRequests<30,`화면에 보이는 사진만 요청: ${thumbnailRequests}`);
   assert.equal(await page.getByText('선택해 불러오기',{exact:true}).count(),0);
   await page.screenshot({path:path.join(out,`${width}x${height}-before-click.png`)});
   // Allow the visible request queue to settle, then verify persisted cache across a reload.
   await page.waitForTimeout(1000);requests.length=0;
   await page.reload({timeout:180000});await preview().waitFor();
   await page.waitForTimeout(500);assert.equal(requests.filter(url=>/\/thumbnail$/.test(url)).length,0,'다시 열면 디스크 캐시 재사용');
   const more=page.getByRole('button',{name:'더 불러오기',exact:true});
   await more.scrollIntoViewIfNeeded();await more.click();
   const last=page.getByRole('button',{name:'사진 선택: old-photo-36.png',exact:true});
   await last.scrollIntoViewIfNeeded();await page.getByLabel('사진 미리보기: old-photo-36.png',{exact:true}).waitFor();
   assert.equal(requests.filter(url=>/\/file$/.test(url)).length,0,'스크롤·추가 페이지에서도 원본 요청 금지');
   await page.getByRole('button',{name:'사진 선택: old-photo-1.png',exact:true}).click();
   await page.getByText(/^원본 선택 완료:/).waitFor();
   assert.equal(requests.filter(url=>/\/file$/.test(url)).length,1,'선택할 때만 원본 조회');
   assert.deepEqual(errors,[]);console.log(`PASS ${width}x${height}: visible thumbnails=${thumbnailRequests}, no originals before click, persistent cache, original selection`);
   await context.close();
  }
 }finally{await browser?.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
