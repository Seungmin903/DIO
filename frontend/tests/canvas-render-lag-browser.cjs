const {chromium}=require('playwright-core'), http=require('node:http'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict')
const output=path.join(__dirname,'../.expo/canvas-render-lag-qa');fs.mkdirSync(output,{recursive:true})
const server=http.createServer((req,res)=>{
 if(req.url.split('?')[0]==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100dvh"></div><script src="/tests/fixtures/canvas-render-lag.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script>')}
 else {const r=http.get('http://127.0.0.1:'+(process.env.EXPO_QA_PORT || '8081')+req.url,up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res)});r.on('error',e=>{res.writeHead(502);res.end(e.message)})}
})
;(async()=>{
 await new Promise(done=>server.listen(54856,'127.0.0.1',done))
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 const results=[]
 try{
  for(const vectors of [true,false]){
   const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[]
   page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000)
   await page.goto('http://127.0.0.1:54856/?count=500'+(vectors?'&vectors=1':''))
   await page.waitForFunction(()=>window.__heavyReader?.loaded,null,{timeout:180000})
   if(!vectors)await page.getByTestId('reading-page-image').waitFor({timeout:60000})
   const before=await page.evaluate(()=>JSON.stringify(window.__heavyReader.doc))
   const mountedBefore=await page.locator('[data-completed-stroke-id]').count()
   if(vectors)assert.equal(mountedBefore,500);else assert.equal(mountedBefore,0)
   // Preparation is optional; wait for the adjacent image to warm without changing the document.
   if(!vectors)await page.waitForTimeout(2000)
   const frameSamples=[]
   await page.evaluate(()=>{window.__frames=[];window.__frameRunning=true;let last=performance.now();const tick=now=>{window.__frames.push(now-last);last=now;if(window.__frameRunning)requestAnimationFrame(tick)};requestAnimationFrame(tick)})
   const started=Date.now();await page.getByRole('button',{name:'다음 페이지',exact:true}).click()
   let previewUris=[]
   if(!vectors){await page.waitForFunction(()=>document.querySelectorAll('[data-testid="reading-page-image"]').length>=2);previewUris=await page.getByTestId('reading-page-image').locator('img').evaluateAll(nodes=>nodes.map(n=>n.src))}
   await page.waitForFunction(()=>window.__heavyReader.pageId==='heavy-1')
   const elapsed=Date.now()-started
   if(!vectors){await page.getByTestId('reading-page-image').waitFor();const uri=await page.getByTestId('reading-page-image').locator('img').getAttribute('src');assert.ok(previewUris.includes(uri),'preview and final page reuse the same URI')}
   await page.evaluate(()=>{window.__frameRunning=false})
   const frames=await page.evaluate(()=>window.__frames)
   assert.equal(await page.evaluate(()=>JSON.stringify(window.__heavyReader.doc)),before)
   await page.screenshot({path:path.join(output,vectors?'vectors.png':'cached.png')})
   results.push({mode:vectors?'vectors':'cached',strokes:500,mountedBefore,navMs:elapsed,framesOver50ms:frames.filter(n=>n>50).length,maxFrameMs:Math.max(...frames)})
   assert.deepEqual(errors,[]);await context.close()
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results))
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1})
