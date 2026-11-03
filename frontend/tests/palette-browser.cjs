const {chromium}=require('playwright-core'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const output=path.join(__dirname,'../.expo/palette-qa');fs.mkdirSync(output,{recursive:true})
const server=http.createServer((req,res)=>{
 if(req.url==='/'||req.url.startsWith('/?')){
  const fixture=req.url.includes('studio=1')?'palette-studio':'eyedropper'
  res.setHeader('Content-Type','text/html; charset=utf-8')
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><script>const realSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(window.__paletteWriteFail&&k.endsWith('dio-editor-palette-v1:pen'))throw Error('quota');return realSet.call(this,k,v)}</script><div id="root" style="display:flex;height:100dvh"></div><script src="/tests/fixtures/${fixture}.entry.bundle?platform=web&dev=false&minify=false&lazy=false&hot=false"></script>`)
 }else{const r=http.get('http://127.0.0.1:'+(process.env.EXPO_QA_PORT||8088)+req.url,up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res)});r.on('error',e=>{res.writeHead(502);res.end(e.message)})}
})
;(async()=>{
 await new Promise(done=>server.listen(54862,'127.0.0.1',done))
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 try{
  const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[]
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message)});page.setDefaultTimeout(30000)
  await page.goto('http://127.0.0.1:54862');await page.waitForFunction(()=>window.__eyedropperEditor?.loaded,null,{timeout:180000})
  const before=await page.evaluate(()=>JSON.stringify(window.__eyedropperEditor.doc))
  const open=async label=>{
   const edit=page.getByRole('button',{name:`${label} 팔레트 편집`,exact:true})
   if(!await edit.count()){await page.getByRole('button',{name:label,exact:true}).click();if(!await edit.count())await page.getByRole('button',{name:label,exact:true}).click()}
   await edit.click();await page.getByRole('button',{name:`${label} 팔레트 1번 색 편집`,exact:true}).click()
   await page.getByRole('textbox',{name:`${label} 색 HEX 코드`,exact:true}).waitFor()
  }
  await open('펜');assert.equal(await page.getByText('내 색상',{exact:true}).count(),0)
  const hex=page.getByRole('textbox',{name:'펜 색 HEX 코드',exact:true})
  await hex.fill('#123456');await hex.press('Tab')
  await page.evaluate(()=>window.__paletteWriteFail=true)
  await page.getByRole('button',{name:'펜 색 창 닫기',exact:true}).click()
  await page.getByText('색상을 저장하지 못했어요. 다시 시도해 주세요.',{exact:true}).waitFor()
  await page.evaluate(()=>window.__paletteWriteFail=false)
  await page.screenshot({path:path.join(output,'palette-editor.png')})
  await page.getByRole('button',{name:'펜 색 창 닫기',exact:true}).click()
  await hex.waitFor({state:'detached'})
  const palette=await page.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([k])=>k.endsWith('dio-editor-palette-v1:pen'))[1]))
  assert.equal(palette[0],'#123456');assert.equal(palette.length,7)
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__eyedropperEditor.doc)),before)
  await page.reload();await page.waitForFunction(()=>window.__eyedropperEditor?.loaded)
  const edit=page.getByRole('button',{name:'펜 팔레트 편집',exact:true})
  if(!await edit.count())await page.getByRole('button',{name:'펜',exact:true}).click()
  await page.getByRole('button',{name:'펜 색상 #123456',exact:true}).waitFor()
  const beforeSampling=await page.evaluate(()=>JSON.stringify(window.__eyedropperEditor.doc))
  await edit.click();await page.getByRole('button',{name:'펜 팔레트 1번 색 편집',exact:true}).click()
  // Headless browser cannot operate the OS chooser. Verify common browser API
  // integration with a deterministic result; native screen capture is tested separately.
  await page.evaluate(()=>{window.EyeDropper=class{async open(){window.__screenPickerOpened=true;return {sRGBHex:'#e08020'}}}})
  await page.getByRole('button',{name:'스포이드로 화면에서 색 가져오기',exact:true}).click()
  await page.waitForFunction(()=>window.__screenPickerOpened)
  await hex.waitFor();assert.equal(await hex.inputValue(),'#E08020')
  await page.screenshot({path:path.join(output,'palette-after-sampling.png')})
  await page.getByRole('button',{name:'펜 색 창 닫기',exact:true}).click();await hex.waitFor({state:'detached'})
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__eyedropperEditor.doc)),beforeSampling)
  assert.deepEqual(errors,[])
  await page.getByRole('button',{name:'마스킹테이프',exact:true}).click()
  const tapeRow=page.getByLabel('테이프 기본 팔레트',{exact:true})
  await tapeRow.waitFor()
  const content=await page.getByRole('textbox',{name:'테이프 검색',exact:true}).evaluate(el=>{const r=el.parentElement.getBoundingClientRect();return {x:r.x,right:r.right}})
  for (const target of [tapeRow,page.getByText('테이프 색상',{exact:true}),page.getByRole('button',{name:'테이프 팔레트 편집',exact:true})]) {
   const box=await target.boundingBox()
   assert.ok(box.x>=content.x-.5 && box.x+box.width<=content.right+.5,'tape palette stays inside drawer body margins')
  }
  await page.screenshot({path:path.join(output,'tape-palette-body-margins.png')})
  console.log('PASS tape palette body margins')
  console.log('PASS editor flow');await page.goto('http://127.0.0.1:54862/?studio=1');await page.getByRole('button',{name:'펜 팔레트 편집',exact:true}).waitFor()
  assert.equal(await page.getByText('내 색상',{exact:true}).count(),0)
  await page.getByRole('button',{name:'펜 팔레트 편집',exact:true}).click();await page.getByRole('button',{name:'펜 팔레트 1번 색 편집',exact:true}).click()
  assert.equal(await page.getByRole('textbox',{name:'펜 색 HEX 코드',exact:true}).inputValue(),'#E08020')
  await page.getByRole('button',{name:'펜 색 창 닫기',exact:true}).click()
  for (const [label,scope,color] of [['형광펜','highlighter','#44AA88'],['글자','text','#9988AA'],['마스킹 테이프','tape','#663399'],['종이','paper','#EEDDAA'],['선과 글씨','paperLine','#334455']]) {
   await page.getByRole('button',{name:`${label} 팔레트 편집`,exact:true}).click()
   await page.getByRole('button',{name:`${label} 팔레트 1번 색 편집`,exact:true}).click()
   const input=page.getByRole('textbox',{name:`${label} 색${scope==='tape'?' 바탕색':''} HEX 코드`,exact:true})
   await input.fill(color);await input.blur()
   if(scope==='tape'){
    await page.getByRole('radio',{name:'무늬색 바꾸기',exact:true}).click()
    const fg=page.getByRole('textbox',{name:'마스킹 테이프 색 무늬색 HEX 코드',exact:true});await fg.fill('#AABBCC');await fg.blur()
   }
   await page.getByRole('button',{name:`${label} 색 창 닫기`,exact:true}).click();await input.waitFor({state:'detached'})
   const stored=await page.evaluate(scope=>JSON.parse(Object.entries(localStorage).find(([k])=>k.endsWith(`dio-editor-palette-v1:${scope}`))[1]),scope)
   assert.equal(stored[0],scope==='tape'?`custom:${color}:#AABBCC`:color)
  }
  // Rotation dismisses edits; normal browser back/Esc follows the common close semantics.
  await page.getByRole('button',{name:'펜 팔레트 1번 색 편집',exact:true}).click()
  await page.getByRole('textbox',{name:'펜 색 HEX 코드',exact:true}).fill('#010203')
  await page.setViewportSize({width:1200,height:800})
  await page.getByRole('textbox',{name:'펜 색 HEX 코드',exact:true}).waitFor({state:'detached'})
  assert.equal(await page.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([k])=>k.endsWith('dio-editor-palette-v1:pen'))[1])[0]),'#E08020')
  for(const viewport of [{width:390,height:844},{width:320,height:740},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.getByRole('button',{name:'펜 팔레트 1번 색 편집',exact:true}).click()
   const box=await page.getByLabel('펜 색',{exact:true}).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=viewport.width&&box.y>=0&&box.y+box.height<=viewport.height,'color window fits viewport')
   await page.screenshot({path:path.join(output,`palette-${viewport.width}x${viewport.height}.png`)})
   await page.getByRole('button',{name:'펜 색 창 닫기',exact:true}).click()
  }
  console.log('PASS palette slot editing, failed-save retry, reload/shared studio restoration, browser screen-picker API integration (stub), all six palette scopes, rotation cancellation, no document mutation/custom collection, 3 narrow viewports')
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1})
