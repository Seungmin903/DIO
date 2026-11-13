// 별도 QA Metro 서버가 필요하다. 실제 편집 ObjectContent와 PageImageSurface PNG를 비교한다.
const {chromium}=require('playwright')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),UPNG=require('upng-js')
const base=new URL(process.argv[2]||'http://127.0.0.1:8095')
assert.ok(['localhost','127.0.0.1'].includes(base.hostname))
const out=path.resolve(__dirname,'../.expo/dday-stamp-scale')
const rgba=buffer=>{const bytes=new Uint8Array(buffer),png=UPNG.decode(bytes.buffer);return{width:png.width,height:png.height,data:new Uint8Array(UPNG.toRGBA8(png)[0])}}
const pixelDifference=(first,second)=>{
 const a=rgba(first),b=rgba(second)
 assert.deepEqual([a.width,a.height],[b.width,b.height])
 let sum=0
 for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)sum+=Math.abs(a.data[i+c]-b.data[i+c])
 return sum/(a.width*a.height*3)
}
;(async()=>{
 const channel=process.env.DIO_QA_BROWSER_CHANNEL
 const server=await chromium.launchServer({headless:true,...(channel?{channel}:{})})
 try {
  const browser=await chromium.connect(server.wsEndpoint()),results=[]
  fs.mkdirSync(out,{recursive:true})
  for(const viewport of [{width:390,height:844},{width:1100,height:850}]) {
   const page=await browser.newPage({viewport}),errors=[]
   page.on('pageerror',error=>errors.push(error.message))
   await page.route('**/dday-stamp-qa.html*',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><div id="root"></div><script src="/tests/fixtures/dday-stamp-scale.entry.bundle?platform=web&dev=true&hot=false"></script></body></html>'}))
   for(const [index,title] of ['기념일','가나다라마바사아자차카타파하','WWWWWWWWWWWWWW'].entries()) {
    const url=new URL('/dday-stamp-qa.html',base);url.searchParams.set('title',title)
    await page.goto(url.href,{waitUntil:'domcontentloaded'})
    try { await page.waitForFunction(()=>globalThis.__stampQA?.png||globalThis.__stampQA?.error,{}, {timeout:120000}) }
    catch(error) { console.error(await page.evaluate(()=>({state:globalThis.__stampQA,body:document.body.innerText.slice(0,1000)})),errors);throw error }
    const exported=await page.evaluate(()=>globalThis.__stampQA)
    assert.equal(exported.error,null)
    const differences=[]
    for(const zoom of [0.1,0.25,0.4,0.5,1,2]) {
     const frame=page.getByTestId(`stamp-${zoom}`),label=frame.getByText(title,{exact:true})
     await label.waitFor({state:'attached'})
     const bounds=await frame.boundingBox(),text=await label.evaluate(node=>{
      const range=document.createRange();range.selectNodeContents(node);const b=range.getBoundingClientRect()
      return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height,clipped:node.scrollWidth>node.clientWidth+1}
     })
     assert.ok(text.width>0&&text.height>0)
     assert.equal(text.clipped,false,`${title} at ${zoom}: horizontal clipping`)
     assert.ok(text.x>=bounds.x-1&&text.y>=bounds.y-1&&text.right<=bounds.x+bounds.width+1&&text.bottom<=bounds.y+bounds.height+1,JSON.stringify({zoom,bounds,text}))
     const scaled=await page.evaluate(async({png,size})=>{
      const image=new Image();image.src=png;await image.decode()
      const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size
      canvas.getContext('2d').drawImage(image,0,0,size,size)
      return canvas.toDataURL('image/png')
     },{png:exported.png,size:200*zoom})
     const mean=pixelDifference(await page.getByTestId(`edit-${zoom}`).screenshot(),Buffer.from(scaled.split(',')[1],'base64'))
     assert.ok(mean<6,`Scaled editor/export difference at ${zoom}: ${mean}`)
     differences.push({zoom,mean})
    }
    const edit=await page.getByTestId('edit-1').screenshot(),png=Buffer.from(exported.png.split(',')[1],'base64')
    const mean=pixelDifference(edit,png)
    assert.ok(mean<3,`Editor/export pixel difference ${mean}`)
    const prefix=`${viewport.width}-${index}`
    fs.writeFileSync(path.join(out,`${prefix}-edit.png`),edit);fs.writeFileSync(path.join(out,`${prefix}-export.png`),png)
    await page.getByTestId('edit-0.25').screenshot({path:path.join(out,`${prefix}-small.png`)})
    results.push({viewport,title,scales:6,meanPixelDifference:mean,scaledDifferences:differences})
   }
   assert.deepEqual(errors,[]);await page.close()
  }
  console.log(JSON.stringify({status:'passed',results}))
 } finally { await server.kill() }
})().catch(error=>{console.error(error);process.exitCode=1})
