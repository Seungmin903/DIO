const {chromium}=require('playwright-core'),http=require('node:http'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const output=path.join(__dirname,'../.expo/recent-pen-colors-qa');fs.mkdirSync(output,{recursive:true})
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100dvh"></div><script src="/tests/fixtures/pen-colors.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script>')}
 else {const r=http.get('http://127.0.0.1:'+(process.env.EXPO_QA_PORT||'8081')+req.url,up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res)});r.on('error',e=>{res.writeHead(502);res.end(e.message)})}
})
;(async()=>{
 await new Promise(done=>server.listen(54858,'127.0.0.1',done))
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[]
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message)});page.setDefaultTimeout(30000)
  const key='dio-editor-used-colors-v1:pen'
  await page.goto('http://127.0.0.1:54858',{waitUntil:'domcontentloaded'});console.log('fixture loaded');await page.waitForFunction(()=>window.__penColorEditor?.loaded,null,{timeout:60000});console.log('editor ready')
  const open=async()=>{if(!await page.getByRole('button',{name:'펜 팔레트 편집',exact:true}).count())await page.getByRole('button',{name:'펜',exact:true}).click()}
  const choose=async color=>{
   await open();await page.getByRole('button',{name:'펜 색 직접 지정',exact:true}).click()
   const picker=page.getByRole('textbox',{name:'펜 색 HEX 코드',exact:true})
   await picker.fill(color);await picker.blur()
   await page.getByRole('button',{name:'펜 색 창 닫기',exact:true}).click();await picker.waitFor({state:'detached'})
  }
  const draw=async()=>{
   await page.getByRole('button',{name:'펜 설정 닫기',exact:true}).click()
   const box=await page.getByLabel('펜 입력 영역',{exact:true}).boundingBox()
   await page.mouse.move(box.x+box.width*.4,box.y+box.height*.6);await page.mouse.down()
   await page.mouse.move(box.x+box.width*.5,box.y+box.height*.65,{steps:6});await page.mouse.up()
  }
  const read=()=>page.evaluate(key=>{const item=Object.entries(localStorage).find(([k])=>k.endsWith(key));return item?JSON.parse(item[1]):[]},key)
  await choose('#111111');assert.deepEqual(await read(),[],'selecting alone must not record use')
  for(let i=1;i<=8;i++){
   const color='#'+String(i).repeat(6);await choose(color);await draw();console.log('drawn',color)
   await page.waitForFunction(({key,color})=>{const value=Object.entries(localStorage).find(([k])=>k.endsWith(key))?.[1];return value&&JSON.parse(value)[0]===color},{key,color})
  }
  const expected=['#888888','#777777','#666666','#555555','#444444','#333333','#222222','#111111']
  assert.deepEqual(await read(),expected)
  await open()
  const base=page.getByLabel('펜 기본 팔레트',{exact:true}).getByRole('button')
  const recent=page.getByRole('button',{name:/^최근 사용한 펜 색상 /})
  assert.equal(await base.count(),8);assert.equal(await recent.count(),8)
  for(let i=0;i<8;i++){
   const a=await base.nth(i).boundingBox(),b=await recent.nth(i).boundingBox()
   assert.equal(a.x,b.x);assert.equal(a.width,b.width);assert.equal(a.height,b.height)
  }
  await open();assert.equal(await page.getByRole('button',{name:/^최근 사용한 펜 색상 /}).count(),8)
  await page.getByRole('button',{name:'최근 사용한 펜 색상 #444444',exact:true}).click()
  assert.deepEqual(await read(),expected,'history selection alone must not reorder')
  await draw();await page.waitForFunction(key=>JSON.parse(Object.entries(localStorage).find(([k])=>k.endsWith(key))[1])[0]==='#444444',key)
  const saved=await read();await page.reload();await page.waitForFunction(()=>window.__penColorEditor?.loaded)
  await open();await page.getByRole('button',{name:'최근 사용한 펜 색상 #444444',exact:true}).waitFor()
  assert.deepEqual(await read(),saved);assert.deepEqual(errors,[])
  await page.getByRole('button',{name:'최근 사용한 펜 색상 #444444',exact:true}).scrollIntoViewIfNeeded()
  await page.screenshot({path:path.join(output,'recent-colors.png')});console.log('PASS: select-only, 8 completed strokes, 8-color limit, reuse ordering, reload restoration')
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1})
