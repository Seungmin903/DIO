const {chromium}=require('playwright-core'),http=require('node:http'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root" style="height:100dvh;display:flex"></div><script src="/tests/fixtures/handwriting-performance.entry.bundle?platform=web&dev=false&minify=false&lazy=false&hot=false"></script>')}else{const r=http.get('http://127.0.0.1:'+(process.env.EXPO_QA_PORT||8091)+req.url,up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res)});r.on('error',e=>{res.writeHead(502);res.end(e.message)})}})
;(async()=>{
 await new Promise(r=>server.listen(54865,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 try{
 const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000)
 await page.goto('http://127.0.0.1:54865');const pad=page.getByLabel('값 손글씨 입력칸',{exact:true});await pad.waitFor({timeout:180000})
 const slider=page.getByRole('textbox',{name:'펜 굵기 숫자 입력',exact:true});await slider.fill('24');await slider.blur()
 const box=await pad.boundingBox()
 for(let stroke=0;stroke<6;stroke++){
  await page.mouse.move(box.x+box.width*.15,box.y+box.height*.2);await page.mouse.down()
  for(let i=0;i<120;i++)await page.mouse.move(box.x+box.width*(.15+.7*i/120),box.y+box.height*(.5+Math.sin(i/12)*.25))
  assert.equal(await page.evaluate(()=>window.__handwritingPerf.saves),0,'no full draft save during continuous ink')
  await page.mouse.up()
 }
 await page.waitForFunction(()=>window.__handwritingPerf.saves>0)
 const saved=await page.evaluate(()=>window.__handwritingPerf)
 assert.equal(saved.draft.samples.값.strokes.length,22);assert.equal(saved.draft.samples.값.strokes.at(-1).width,24);assert.ok(saved.saves<6)
 await page.getByRole('button',{name:'획 되돌리기',exact:true}).click();await page.waitForFunction(()=>window.__handwritingPerf.draft.samples.값.strokes.length===21)
 await page.getByRole('button',{name:'획 다시 실행',exact:true}).click();await page.waitForFunction(()=>window.__handwritingPerf.draft.samples.값.strokes.length===22)
 const out=path.join(__dirname,'../.expo/handwriting-performance');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'input.png')})
 assert.deepEqual(errors,[]);console.log('PASS heavy 36-character draft: 6 continuous strokes, zero mid-ink saves, coalesced save, width24, undo/redo. Saves after ink:',saved.saves)
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1})
