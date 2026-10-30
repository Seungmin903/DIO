const {chromium}=require('playwright-core')
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict')
const project=path.resolve(__dirname,'..'),output=path.resolve(project,process.env.FONT_COMPRESSION_OUTPUT||'qa/handwriting-output/compression-20261029-verified')
const files={'/original.ttf':path.join(project,'qa/handwriting-output/device/galaxy-s921n-20261026/device-generated.ttf'),'/packed.ttf':path.join(output,'coordinate-packed.ttf'),'/small.woff2':path.join(output,'lossless.woff2')}
const server=http.createServer((req,res)=>{
 const file=files[req.url]
 if(!file){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Local font comparison</title>')}
 res.setHeader('Content-Type',req.url.endsWith('woff2')?'font/woff2':'font/ttf');fs.createReadStream(file).pipe(res)
})
;(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.setDefaultTimeout(30000)
  await page.goto('http://127.0.0.1:'+server.address().port)
  const result=await page.evaluate(async()=>{
   for(const [name,url] of [['Original','/original.ttf'],['Packed','/packed.ttf'],['Small','/small.woff2']])document.fonts.add(await new FontFace(name,`url(${url})`).load())
   const chars=[...new Set([...Array.from('한이민글핀안녕하세요감사합니다반갑습니다좋은하루되세요오늘도수고했어요잘부탁드립니다사랑합니다'),...Array.from({length:256},(_,i)=>String.fromCharCode(0xac00+Math.floor(i*11171/255)))])]
   const results=[]
   for(const family of ['Packed','Small'])for(const size of [24,48,128,256]){
    const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=size+64;a.height=b.height=size*2+64
    const ca=a.getContext('2d',{willReadFrequently:true}),cb=b.getContext('2d',{willReadFrequently:true});ca.font=`${size}px Original`;cb.font=`${size}px ${family}`
    let changedGlyphs=0,advanceChanges=0
    for(const char of chars){
     ca.clearRect(0,0,a.width,a.height);cb.clearRect(0,0,b.width,b.height);ca.fillText(char,16,size+16);cb.fillText(char,16,size+16)
     const x=ca.getImageData(0,0,a.width,a.height).data,y=cb.getImageData(0,0,b.width,b.height).data
     if(x.some((v,i)=>v!==y[i]))changedGlyphs++
     if(ca.measureText(char).width!==cb.measureText(char).width)advanceChanges++
    }
    results.push({family,sizePx:size,compared:chars.length,changedGlyphs,advanceChanges})
   }
   return {platform:navigator.userAgent,fontsLoaded:true,results}
  })
  fs.writeFileSync(path.join(output,'browser-validation.json'),JSON.stringify(result,null,2))
  assert(result.results.every(v=>v.changedGlyphs===0&&v.advanceChanges===0),'Browser raster difference')
  console.log(JSON.stringify(result))
 }finally{if(browser)await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
