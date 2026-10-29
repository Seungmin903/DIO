const { chromium }=require('playwright-core')
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{createHash}=require('node:crypto')
const project=path.resolve(__dirname,'..'),qa=process.env.LICENSE_QA_OUTPUT||path.join(project,'qa/license-release-20261027'),root=process.env.LICENSE_WEB_ROOT||path.join(qa,'web-final')
fs.mkdirSync(qa,{recursive:true})
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png','.zip':'application/zip'}
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname
  if(pathname==='/__qa/heicDecoder.mjs'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(project,'src/editor/utils/heicDecoder.web.js')))}
  if(pathname==='/__qa/replacement.mjs'){res.setHeader('Content-Type','application/javascript');return res.end('globalThis.DIOHeic={heicTo:async()=>new Blob(["replacement-library"])}')}
  if(pathname==='/__qa/fixture.heic')return res.end(fs.readFileSync(path.join(qa,'public-fixture.heic')))
  let file=path.resolve(root,'.'+decodeURIComponent(pathname));if(file===root||fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html')
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end()}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)
})
;(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`
  console.log('browser: server ready')
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
  const errors=[],result={}
  try{
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('LOCAL_QA_ERROR',e.message)})
    page.setDefaultTimeout(30000);context.setDefaultTimeout(30000)
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});console.log('browser: app loaded')
    const profile=page.getByRole('tab',{name:'내 공간',exact:true}),guest=page.getByRole('button',{name:'게스트로 시작하기',exact:true})
    await Promise.race([profile.waitFor(),guest.waitFor()]);if(await guest.isVisible())await guest.click()
    await page.getByRole('tab',{name:'내 공간',exact:true}).click()
    await page.getByText('오픈소스 및 콘텐츠 라이선스',{exact:true}).click()
    console.log('browser: license modal open')
    await page.getByLabel('라이선스 검색',{exact:true}).fill('heic-to')
    await page.getByRole('button',{name:'heic-to 라이선스 전문 보기',exact:true}).click()
    await page.getByText('GNU LESSER GENERAL PUBLIC LICENSE',{exact:false}).waitFor()
    const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'heic-to 소스 받기',exact:true}).click()
    const download=await downloadEvent,downloadPath=path.join(qa,'browser-heic-sources.zip');await download.saveAs(downloadPath)
    console.log('browser: source downloaded')
    const catalog=JSON.parse(fs.readFileSync(path.join(project,'src/licenses/generated/web.json'))),source=catalog.components.find(e=>e.name==='heic-to').sourceArchives[0]
    assert.equal(createHash('sha256').update(fs.readFileSync(downloadPath)).digest('hex'),source.sha256)
    result.offlineNoticeAndSourceDownload=true
    await page.screenshot({path:path.join(qa,'web-license-phone.png'),fullPage:false})
    const decoded=await page.evaluate(async()=>{
      const {loadHeicDecoder}=await import('/__qa/heicDecoder.mjs'),decoder=await loadHeicDecoder()
      const blob=await(await fetch('/__qa/fixture.heic')).blob(),jpeg=await decoder.heicTo({blob,type:'image/jpeg',quality:.8}),data=new Uint8Array(await jpeg.arrayBuffer())
      const bitmap=await createImageBitmap(jpeg);const out={width:bitmap.width,height:bitmap.height,jpegMagic:data[0]===255&&data[1]===216};bitmap.close();return out
    })
    assert(decoded.jpegMagic&&decoded.width>100&&decoded.height>100);result.realHeicDecode=decoded
    console.log('browser: HEIC decoded')
    const replacement=await context.newPage();await replacement.goto(base)
    const text=await replacement.evaluate(async()=>{globalThis.DIO_HEIC_DECODER_URL='/__qa/replacement.mjs';const {loadHeicDecoder}=await import('/__qa/heicDecoder.mjs');return(await(await loadHeicDecoder()).heicTo()).text()})
    assert.equal(text,'replacement-library');result.compatibleLibraryReplacement=true
    const rejected=await context.newPage();await rejected.goto(base)
    assert(await rejected.evaluate(async()=>{globalThis.DIO_HEIC_DECODER_URL='https://example.invalid/decoder.mjs';try{await(await import('/__qa/heicDecoder.mjs')).loadHeicDecoder();return false}catch{return true}}));result.crossOriginDecoderRejected=true
    await page.goto(base+'/licenses/');await page.getByRole('heading',{name:'DIO 오픈소스 고지와 소스'}).waitFor();result.standaloneNoticesPage=true
    assert.deepEqual(errors,[]);result.status='passed';fs.writeFileSync(path.join(qa,'browser-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
  }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1})
