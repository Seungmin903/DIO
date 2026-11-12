const{chromium}=require('playwright')
const assert=require('node:assert/strict')
const base=new URL(process.argv[2]||'http://127.0.0.1:8095')
if(!['127.0.0.1','localhost'].includes(base.hostname))throw Error('Use a dedicated loopback QA server')
;(async()=>{
 const channel=process.env.DIO_QA_BROWSER_CHANNEL
 const server=await chromium.launchServer({headless:true,...(channel&&channel!=='chromium'?{channel}:{})}),browser=await chromium.connect(server.wsEndpoint())
 const results=[]
 try{
  for(const viewport of [{width:430,height:800},{width:1100,height:850}]){
   const page=await browser.newPage({viewport,hasTouch:true}),errors=[]
   page.on('pageerror',e=>errors.push(e.message))
   await page.route('**/cover-sticker-qa.html*',r=>r.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div><script src="/tests/fixtures/cover-sticker-controls.entry.bundle?platform=web&dev=true&hot=false"></script></body></html>'}))
   const state=async()=>JSON.parse(await page.getByTestId('state').innerText())
   const open=async(scenario='overlap')=>{const url=new URL('/cover-sticker-qa.html',base);url.searchParams.set('scenario',scenario);await page.goto(url.href,{waitUntil:'domcontentloaded'});await page.getByTestId('state').waitFor({timeout:90000});await page.getByLabel('표지 스티커 위 스티커',{exact:true}).tap();assert.equal((await state()).selected,'a')}
   const tapButton=async name=>{const button=page.getByRole('button',{name,exact:true});await button.waitFor();const b=await button.boundingBox(),point={x:b.x+b.width/2,y:b.y+b.height/2};const target=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[aria-label]')?.getAttribute('aria-label'),point);assert.equal(target,name);await page.touchscreen.tap(point.x,point.y)}
   for(const scenario of ['overlap','above']){
    await open(scenario);const before=await state();await tapButton('표지 스티커 복제');const after=await state();assert.equal(after.stickers.length,3);assert.deepEqual(after.stickers.slice(0,2),before.stickers);assert.equal(after.selected,after.stickers[2].id);assert.equal(after.stickers[2].x,54)
    await open(scenario);await tapButton('표지 스티커 삭제');const deleted=await state();assert.deepEqual(deleted.stickers.map(s=>s.id),['b']);assert.equal(deleted.selected,null)
   }
   await open();const before=await state(),hit=await page.getByLabel('표지 스티커 위 스티커',{exact:true}).boundingBox();await page.mouse.move(hit.x+hit.width/2,hit.y+hit.height/2);await page.mouse.down();await page.mouse.move(hit.x+hit.width/2+20,hit.y+hit.height/2+60,{steps:12});await page.mouse.up();const moved=await state();assert.equal(moved.selected,'a');assert.ok(moved.stickers[0].x>before.stickers[0].x);assert.ok(moved.stickers[0].y>before.stickers[0].y);assert.deepEqual(moved.stickers[1],before.stickers[1])
   await open();const old=await state(),corner=await page.getByLabel('표지 스티커 크기 조절',{exact:true}).nth(3).boundingBox();await page.mouse.move(corner.x+9,corner.y+9);await page.mouse.down();await page.mouse.move(corner.x+39,corner.y+39,{steps:12});await page.mouse.up();const resized=await state();assert.equal(resized.selected,'a');assert.ok(resized.stickers[0].size>old.stickers[0].size);assert.deepEqual(resized.stickers[1],old.stickers[1])
   await open();const rotate=await page.getByLabel('표지 스티커 회전 손잡이',{exact:true}).boundingBox();await page.mouse.move(rotate.x+9,rotate.y+9);await page.mouse.down();await page.mouse.move(rotate.x+49,rotate.y+29,{steps:12});await page.mouse.up();assert.notEqual((await state()).stickers[0].rotation,0)
   await open();const other=await page.getByLabel('표지 스티커 아래 스티커',{exact:true}).boundingBox();await page.touchscreen.tap(other.x+other.width/2,other.y+other.height-3);assert.equal((await state()).selected,'b');const cover=await page.getByTestId('cover').boundingBox();await page.touchscreen.tap(cover.x+10,cover.y+10);assert.equal((await state()).selected,null)
   const exactUrl=new URL('/cover-sticker-qa.html',base);exactUrl.searchParams.set('scenario','exact');await page.goto(exactUrl.href,{waitUntil:'domcontentloaded'});await page.getByTestId('state').waitFor();await page.getByLabel('표지 스티커 아래 스티커',{exact:true}).tap();assert.equal((await state()).selected,'b');await tapButton('표지 스티커 복제');const exactCopy=await state();assert.equal(exactCopy.stickers.length,3);assert.equal(exactCopy.selected,exactCopy.stickers[2].id);await tapButton('표지 스티커 삭제');assert.deepEqual((await state()).stickers.map(s=>s.id),['a','b'])
   assert.deepEqual(errors,[]);results.push({viewport,duplicate:true,delete:true,move:true,resize:true,rotate:true,selection:true});await page.close()
  }
 }finally{await server.kill()}
 console.log(JSON.stringify({status:'passed',results}))
})().catch(e=>{console.error(e);process.exitCode=1})

