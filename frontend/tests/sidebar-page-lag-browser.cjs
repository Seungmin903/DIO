const {chromium}=require('playwright-core'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const output=path.join(__dirname,'../.expo/sidebar-page-lag-qa');fs.mkdirSync(output,{recursive:true})
const server=http.createServer((req,res)=>{
 if(req.url.split('?')[0]==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100dvh"></div><script src="/tests/fixtures/canvas-render-lag.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script>')}
 else {const r=http.get('http://127.0.0.1:'+(process.env.EXPO_QA_PORT || '8081')+req.url,up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res)});r.on('error',e=>{res.writeHead(502);res.end(e.message)})}
})
;(async()=>{
 await new Promise(done=>server.listen(54857,'127.0.0.1',done))
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],results=[]
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000)
  await page.goto('http://127.0.0.1:54857/?count=500&editing=1')
  await page.waitForFunction(()=>window.__heavyReader?.loaded,null,{timeout:180000})
  await page.getByRole('button',{name:'2페이지',exact:true}).waitFor()
  await page.waitForTimeout(1500)
  const before=await page.evaluate(()=>JSON.stringify(window.__heavyReader.doc))
  for(const index of [1,0,2,1,0]){
   const started=Date.now()
   await page.getByRole('button',{name:`${index+1}페이지`,exact:true}).click()
   await page.waitForFunction(id=>window.__heavyReader.pageId===id,`heavy-${index}`)
   await page.waitForFunction(()=>document.querySelectorAll('[data-completed-stroke-id^="p'+window.__heavyReader.pageId.slice(6)+'-s"]').length>=500)
   results.push({page:index+1,clickToMountedMs:Date.now()-started})
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__heavyReader.doc)),before)
  assert.deepEqual(errors,[])
  await page.screenshot({path:path.join(output,'sidebar-heavy-page.png')})
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results))
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1})
