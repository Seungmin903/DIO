const {chromium}=require('playwright')
const assert=require('node:assert/strict')
;(async()=>{
 const server=await chromium.launchServer({headless:true,...(process.env.DIO_QA_BROWSER_CHANNEL?{channel:process.env.DIO_QA_BROWSER_CHANNEL}:{})})
 try{
 const browser=await chromium.connect(server.wsEndpoint())
 for(const viewport of [{width:390,height:844},{width:740,height:360},{width:1100,height:850}]){
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:true})
  const page=await context.newPage();page.on('pageerror',e=>console.error('PAGE ERROR',e.message))
  await page.route('**/profile-crop-qa*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}#root{display:flex}</style><div id="root"></div><script src="/tests/fixtures/profile-fixed-crop.entry.bundle?platform=web&dev=true&hot=false"></script>'}))
  await page.goto('http://localhost:8095/profile-crop-qa')
  const root=page.getByTestId('profile-crop-gesture'),circle=page.getByTestId('profile-crop-circle')
  await circle.waitFor({timeout:120000})
  // 짧은 가로 화면에서도 조작 영역을 먼저 보이게 한다.
  await circle.scrollIntoViewIfNeeded()
  const initial=await circle.boundingBox(),stage=await root.boundingBox()
  const x=initial.x+initial.width/2,y=initial.y+initial.height/2
  const cdp=await context.newCDPSession(page)
  async function touch(type,points){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});await page.waitForTimeout(50)}
  for(let n=0;n<8;n++){
   const from=n%2?70:25,to=n%2?25:70
   await touch('touchStart',[[1,x-from,y]])
   const single=await root.evaluate(el=>el.children[0].getBoundingClientRect().toJSON())
   await touch('touchStart',[[1,x-from,y],[2,x+from,y]])
   await touch('touchMove',[[1,x-from,y],[2,x+from,y]])
   const doubled=await root.evaluate(el=>el.children[0].getBoundingClientRect().toJSON())
   assert.ok(Math.abs(single.x-doubled.x)<1&&Math.abs(single.y-doubled.y)<1,'adding finger must not jump')
   await touch('touchMove',[[1,x-to,y],[2,x+to,y]])
   await touch('touchEnd',[[1,x-to,y]])
   const before=await root.evaluate(el=>el.children[0].getBoundingClientRect().toJSON())
   await touch('touchMove',[[1,x-to,y]])
   const rebased=await root.evaluate(el=>el.children[0].getBoundingClientRect().toJSON())
   assert.ok(Math.abs(before.x-rebased.x)<1&&Math.abs(before.y-rebased.y)<1,'finger transition must not jump')
   await touch('touchMove',[[1,x-to+15,y+30]])
   if(n===0){const moved=await root.evaluate(el=>el.children[0].getBoundingClientRect().toJSON());assert.ok(Math.abs(moved.x-rebased.x)>1||Math.abs(moved.y-rebased.y)>1,'remaining finger must move photo')}
   await touch('touchEnd',[])
   const current=await circle.boundingBox()
   for(const k of ['x','y','width','height'])assert.ok(Math.abs(current[k]-initial[k])<1,`circle moved: ${k}`)
  }
  // 원 밖으로 끌었다 다시 들어와도 같은 responder로 이동을 받는다.
  await touch('touchStart',[[1,x,y]])
  await touch('touchMove',[[1,x,Math.min(viewport.height-2,stage.y+stage.height+50)]])
  await touch('touchMove',[[1,x,y-20]])
  await touch('touchEnd',[])
  const bounds=await root.evaluate(el=>({image:el.children[0].getBoundingClientRect().toJSON(),circle:el.querySelector('[data-testid="profile-crop-circle"]').getBoundingClientRect().toJSON()}))
  assert.ok(bounds.image.x<=bounds.circle.x+1&&bounds.image.y<=bounds.circle.y+1)
  assert.ok(bounds.image.right>=bounds.circle.right-1&&bounds.image.bottom>=bounds.circle.bottom-1)
  const expected={u:(bounds.circle.x-bounds.image.x)/bounds.image.width,v:(bounds.circle.y-bounds.image.y)/bounds.image.height,width:bounds.circle.width/bounds.image.width,height:bounds.circle.height/bounds.image.height}
  await page.getByRole('button',{name:'적용',exact:true}).click()
  await page.getByText('저장 완료',{exact:true}).waitFor()
  const result=await page.evaluate(async expected=>{
   const load=uri=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=uri})
   const source=await load(globalThis.__profileQA.source),saved=await load(globalThis.__profileQA.result)
   const size=Math.round(Math.min(expected.width*source.width,expected.height*source.height))
   const sx=Math.min(source.width-size,Math.max(0,Math.round(expected.u*source.width))),sy=Math.min(source.height-size,Math.max(0,Math.round(expected.v*source.height)))
   const side=Math.min(1024,size),reference=document.createElement('canvas'),actual=document.createElement('canvas')
   reference.width=actual.width=side;reference.height=actual.height=side
   reference.getContext('2d').drawImage(source,sx,sy,size,size,0,0,side,side)
   actual.getContext('2d').drawImage(saved,0,0,side,side)
   const a=reference.getContext('2d').getImageData(0,0,side,side).data,b=actual.getContext('2d').getImageData(0,0,side,side).data
   let diff=0;for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)diff+=Math.abs(a[i+c]-b[i+c])
   return {width:saved.width,height:saved.height,expectedSide:side,meanDifference:diff/(side*side*3)}
  },expected)
  assert.equal(result.width,result.expectedSide);assert.equal(result.height,result.expectedSide);assert.ok(result.meanDifference<4,JSON.stringify(result))
  console.log(JSON.stringify({viewport,status:'passed',iterations:8,saved:result}))
  await context.close()
 }
 }finally{await server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1})
