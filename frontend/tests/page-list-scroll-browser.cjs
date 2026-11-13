// 전용 Expo QA 서버 필요. 실제 PageList의 한 손가락 스크롤·선택·길게 누른 순서 변경을 검증한다.
const {chromium}=require('playwright')
const assert=require('node:assert/strict')
const base=new URL(process.argv[2]||'http://127.0.0.1:8095')
assert.ok(['localhost','127.0.0.1'].includes(base.hostname))
;(async()=>{
 const channel=process.env.DIO_QA_BROWSER_CHANNEL
 const server=await chromium.launchServer({headless:true,...(channel&&channel!=='chromium'?{channel}:{})})
 try{
  const browser=await chromium.connect(server.wsEndpoint()),results=[]
  for(const viewport of [{width:430,height:800},{width:1100,height:850}]){
   const page=await browser.newPage({viewport,hasTouch:true}),errors=[]
   page.on('pageerror',error=>errors.push(error.message))
   await page.route('**/page-scroll-qa.html*',route=>route.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style></head><body><div id="root"></div><script src="/tests/fixtures/page-drag.entry.bundle?platform=web&dev=true&hot=false"></script></body></html>'}))
   await page.goto(new URL('/page-scroll-qa.html?count=20',base).href)
   await page.getByLabel('2페이지',{exact:true}).waitFor({timeout:120000})
   await page.waitForTimeout(300)
   const scrollTop=()=>page.getByTestId('page-panel').evaluate(panel=>[...panel.querySelectorAll('div')].find(node=>['auto','scroll'].includes(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight)?.scrollTop??0)
   const original=await page.getByLabel('페이지 순서',{exact:true}).innerText()
   const current=await page.getByLabel('현재 페이지',{exact:true}).innerText()
   const client=await page.context().newCDPSession(page)
   const touch=(type,x,y)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y}]})
   const box=await page.getByLabel('2페이지',{exact:true}).boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2
   const before=await scrollTop()
   await touch('touchStart',x,y)
   for(let i=1;i<=10;i++){await touch('touchMove',x,y-i*12);await page.waitForTimeout(12)}
   await touch('touchEnd')
   await page.waitForTimeout(400)
   const after=await scrollTop()
   assert.ok(after>before+30,`Thumbnail swipe did not scroll: ${before} -> ${after}`)
   assert.equal(await page.getByLabel('페이지 순서',{exact:true}).innerText(),original)
   assert.equal(await page.getByLabel('현재 페이지',{exact:true}).innerText(),current)
   await page.getByTestId('page-panel').evaluate(panel=>{const node=[...panel.querySelectorAll('div')].find(node=>['auto','scroll'].includes(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight);node.scrollTop=0})
   await page.waitForTimeout(200)
   await page.getByLabel('1페이지',{exact:true}).tap()
   assert.equal(await page.getByLabel('현재 페이지',{exact:true}).innerText(),'page-1')
   const first=await page.getByLabel('1페이지',{exact:true}).boundingBox(),third=await page.getByLabel('3페이지',{exact:true}).boundingBox()
   const start={x:first.x+first.width/2,y:first.y+first.height/2},endY=third.y+third.height+12
   await touch('touchStart',start.x,start.y);await page.waitForTimeout(340)
   for(let i=1;i<=12;i++){await touch('touchMove',start.x,start.y+(endY-start.y)*i/12);await page.waitForTimeout(16)}
   await touch('touchEnd');await page.waitForTimeout(100)
   const order=(await page.getByLabel('페이지 순서',{exact:true}).innerText()).split(',')
   assert.deepEqual(order.slice(0,3),['page-2','page-3','page-1'])
   assert.equal(await page.getByLabel('현재 페이지',{exact:true}).innerText(),'page-1')
   const firstAfter=await page.getByLabel('1페이지',{exact:true}).boundingBox()
   await touch('touchStart',firstAfter.x+firstAfter.width/2,firstAfter.y+firstAfter.height/2)
   await page.waitForTimeout(340);await touch('touchEnd')
   await page.getByRole('button',{name:'페이지 복제',exact:true}).waitFor()
   assert.deepEqual((await page.getByLabel('페이지 순서',{exact:true}).innerText()).split(','),order)
   await page.getByLabel('페이지 작업 메뉴 닫기',{exact:true}).tap({position:{x:5,y:5}})
   assert.deepEqual(errors,[])
   results.push({viewport,scrollDelta:after-before,tap:true,longPressReorder:true,longPressMenu:true})
   await page.close()
  }
  console.log(JSON.stringify({status:'passed',results}))
 }finally{await server.kill()}
})().catch(error=>{console.error(error);process.exitCode=1})
