const {chromium}=require('playwright-core');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const server=http.createServer((req,res)=>{
 if(req.url.split('?')[0]==='/'){res.setHeader('Content-Type','text/html');return res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100vh"></div><script src="/tests/fixtures/thumbnail-scroll.entry.bundle?platform=web&dev=true&minify=false&lazy=false&hot=false"></script>')}
 http.get(`http://localhost:${process.env.EXPO_QA_PORT||8081}${req.url}`,up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res)}).on('error',()=>{res.writeHead(502);res.end('Metro is unavailable')});
});
function scroll(action){
 const panel=document.querySelector('[aria-label="사진 패널"]');
 const list=[...panel.querySelectorAll('div')].find(node=>node.scrollHeight>node.clientHeight+10&&/auto|scroll/.test(getComputedStyle(node).overflowY));
 if(!list)throw Error('photo list scroller not found');
 if(action==='top')list.scrollTop=0;
 else list.scrollTop+=Math.max(80,Math.floor(list.clientHeight/2));
 return list.scrollTop+list.clientHeight>=list.scrollHeight-2;
}
(async()=>{
 const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
 if(!executablePath||!fs.existsSync(executablePath))throw Error('Set PLAYWRIGHT_EXECUTABLE_PATH and start the loopback Expo QA server.');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath});
  const output=path.join(__dirname,'../.expo/thumbnail-scroll-results');fs.mkdirSync(output,{recursive:true});
  for(const [width,height] of [[1280,800],[390,844]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);
   await page.goto(`http://127.0.0.1:${server.address().port}`,{timeout:120000});
   const loaded=()=>page.waitForFunction(()=>{
    const node=document.querySelector('[aria-label="사진 미리보기: 사진 1"]');
    const image=node?.tagName==='IMG'?node:node?.querySelector('img');return image?.complete&&image.naturalWidth>0;
   });
   await loaded().catch(async error=>{
    console.error('PAGE ERRORS',errors);console.error((await page.locator('body').innerText()).slice(0,1500));
    await page.screenshot({path:path.join(output,`${width}x${height}-failed.png`)});throw error;
   });
   for(let batch=0;batch<6;batch++){
    let bottom=false;
    for(let step=0;step<100&&!bottom;step++){bottom=await page.evaluate(scroll,'next');await page.waitForTimeout(70)}
    assert.equal(bottom,true);
    if(batch<5){await page.getByRole('button',{name:'더 불러오기',exact:true}).click();await page.waitForTimeout(100)}
   }
   const seen=await page.evaluate(()=>globalThis.__thumbnailScroll.requests.size);assert.ok(seen>100,`only ${seen} distinct images were requested`);
   await page.evaluate(scroll,'top');await loaded();
   assert.equal(await page.getByText('미리보기 실패',{exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>globalThis.__thumbnailScroll.invalidations),0);
   await page.screenshot({path:path.join(output,`${width}x${height}-return.png`)});
   await page.getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('button',{name:'다시 열기',exact:true}).click();await loaded();
   assert.equal(await page.getByText('미리보기 실패',{exact:true}).count(),0);assert.deepEqual(errors,[]);
   console.log(`PASS ${width}x${height}: ${seen} thumbnails, return/reopen without failures`);await page.close();
  }
 }finally{await browser?.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
