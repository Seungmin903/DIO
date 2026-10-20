import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { release } from 'node:os'
const { PDFDocument, PDFName, PDFDict, decodePDFRawStream } = createRequire(new URL('../package.json', import.meta.url))('pdf-lib')

export async function runPdfQa(browser,{baseURL,keys,gif,screenshotDir}) {
 const records=[]
 const colors=[[230,80,80],[80,180,80],[80,100,230],[230,180,60],[170,90,200]]
 async function scenario(name,count,action,{broken=false,viewport={width:1280,height:800}}={}){
  const ctx=await browser.newContext({viewport,acceptDownloads:true}),page=await ctx.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  const record={name,count,viewport,input:{canvas:[1024,768],photoRaster:[32,32],gifRaster:[4,4],photos:count,gifs:1,stickers:1,tapes:1,text:1,strokes:1},passed:false,save:{saved:0,cancelled:0,failed:0,downloadStarted:0}}
  try{
   await page.goto(baseURL)
   const original=await page.evaluate(({keys,gif,colors,count,broken})=>{
    const pages=Array.from({length:count},(_,i)=>{
     const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');x.fillStyle=`rgb(${colors[i%5].join(',')})`;x.fillRect(0,0,32,32)
     const photo={id:`photo${i}`,type:'photo',x:0,y:0,w:1024,h:768,rotation:0,frame:'shape',shape:'rect',src:c.toDataURL(),imageWidth:32,imageHeight:32,crop:{zoom:1,fx:.5,fy:.5}}
     const objects=[photo]
     if(i===0)objects.push(
       {...photo,id:'gif',x:900,y:40,w:80,h:80,imageWidth:4,imageHeight:4,src:gif},
       {...photo,id:'sticker',type:'sticker',x:800,y:650,w:40,h:40,imageWidth:4,imageHeight:4,src:gif},
       {id:'tape',type:'tape',x:100,y:650,w:160,h:34,rotation:0,pattern:'solid',palette:'custom:#000000:#00ffff',opacity:1,edge:'straight'},
       {id:'text',type:'text',x:100,y:550,w:200,h:70,rotation:0,baseWidth:200,text:'PDF QA 기록',color:'#111111'},
       {id:'stroke',type:'stroke',x:400,y:650,w:150,h:30,rotation:0,baseWidth:150,baseHeight:30,strokeWidth:6,penKind:'ballpoint',color:'#663399',points:[{x:5,y:15},{x:145,y:15}]},
     )
     if(broken&&i===1)objects.push({...photo,id:'missing',src:'media:pdf-missing',mediaFileId:'pdf-missing'})
     return {id:`p${i+1}`,canvasWidth:1024,canvasHeight:768,objects}
    })
    const doc=JSON.stringify({id:'pdfqa',title:'PDF QA',pages})
    localStorage.setItem(keys.diaries,JSON.stringify([{id:'pdfqa',title:'PDF QA',color:'#CED9EE'}]));localStorage.setItem(keys.doc+':pdfqa',doc);return doc
   },{keys,gif,colors,count,broken})
   await page.reload();await page.getByText('PDF QA',{exact:true}).first().click();await page.getByLabel('공유 및 내보내기',{exact:true}).click()
   await action(page,record)
   assert.equal(await page.evaluate(k=>localStorage.getItem(k),keys.doc+':pdfqa'),original)
   assert.deepEqual(errors,[]);record.passed=true
   if(screenshotDir)await page.screenshot({path:`${screenshotDir}/${name}.png`})
  }catch(error){record.error=error.stack;if(screenshotDir)await page.screenshot({path:`${screenshotDir}/${name}-failed.png`}).catch(()=>{})}
  finally{records.push(record);console.log(name,record.passed?'PASS':record.error);await ctx.close()}
 }
 async function inspect(page,record,expected){
  const start=performance.now();await page.getByRole('button',{name:'PDF 만들기',exact:true}).click()
  await page.getByRole('button',{name:'PDF 파일 저장',exact:true}).waitFor({timeout:190000})
  const data=await page.locator('iframe[title="생성된 PDF 미리보기"]').evaluate(async el=>Array.from(new Uint8Array(await(await fetch(el.src)).arrayBuffer())))
  const doc=await PDFDocument.load(new Uint8Array(data), {updateMetadata:false}),pages=doc.getPages()
  record.output={ms:Math.round(performance.now()-start),bytes:data.length,pages:pages.length,fileName:await page.getByTestId('pdf-result-name').innerText(),memory:await page.evaluate(()=>performance.memory?.usedJSHeapSize??null)}
  assert.equal(pages.length,expected.length);assert.equal(doc.getTitle(),'PDF QA');assert.equal(doc.getAuthor(),'');assert.equal(doc.getProducer(),'DIO')
  record.colors=[]
  for(let i=0;i<pages.length;i++){
   const p=pages[i],size=p.getSize();assert.ok(Math.abs(size.width-841.89)<.1);assert.ok(Math.abs(size.height-595.28)<.1)
   const objects=p.node.Resources().lookup(PDFName.of('XObject'),PDFDict),stream=objects.lookup(objects.keys()[0])
   assert.equal(stream.dict.get(PDFName.of('SMask')),undefined);assert.equal(stream.dict.get(PDFName.of('ColorSpace')).toString(),'/DeviceRGB')
   const width=stream.dict.get(PDFName.of('Width')).asNumber(),height=stream.dict.get(PDFName.of('Height')).asNumber(),raw=decodePDFRawStream(stream).decode(),k=(Math.floor(height/2)*width+Math.floor(width/2))*3
   const rgb=Array.from(raw.slice(k,k+3));assert.deepEqual(rgb,colors[(expected[i]-1)%5]);record.colors.push(rgb)
  }
  if(expected[0]===1){
   const p=pages[0],objects=p.node.Resources().lookup(PDFName.of('XObject'),PDFDict),stream=objects.lookup(objects.keys()[0]),raw=decodePDFRawStream(stream).decode(),width=stream.dict.get(PDFName.of('Width')).asNumber()
   const k=(160*width+1880)*3;assert.deepEqual(Array.from(raw.slice(k,k+3)),[255,0,0]);record.gifFirstFrame=true
   const pixel=(x,y)=>Array.from(raw.slice((y*width+x)*3,(y*width+x)*3+3))
   assert.deepEqual(pixel(1630,1330),[255,0,0]);assert.deepEqual(pixel(360,1334),[0,255,255]);assert.deepEqual(pixel(950,1330),[102,51,153])
   let textInk=0;for(let y=1100;y<1240;y++)for(let x=200;x<600;x++){const rgb=pixel(x,y);if(rgb.every(v=>v<50))textInk++}assert.ok(textInk>20)
   record.contentPixels={sticker:[255,0,0],tape:[0,255,255],stroke:[102,51,153],textInk}
  }
  return record.output.fileName
 }
 await scenario('current-save',5,async(page,record)=>{
  await page.getByRole('button',{name:'현재 페이지 내보내기',exact:true}).click();await page.getByRole('button',{name:'PDF',exact:true}).click();const name=await inspect(page,record,[1]);assert.match(name,/_p01_/)
  const src=await page.locator('iframe').getAttribute('src')
  await page.evaluate(()=>{window.showSaveFilePicker=async()=>{throw new DOMException('cancel','AbortError')}})
  await page.getByRole('button',{name:'PDF 파일 저장',exact:true}).click();await page.getByText('저장·공유를 취소했어요. 다시 시도할 수 있어요.',{exact:true}).waitFor();record.save.cancelled++
  await page.evaluate(()=>{window.showSaveFilePicker=async()=>{throw Error('ENOSPC')}})
  await page.getByRole('button',{name:'PDF 파일 저장',exact:true}).click();await page.getByText('저장 공간이 부족해요. 공간을 확보한 뒤 다시 저장해 주세요.',{exact:true}).waitFor();record.save.failed++
  await page.evaluate(()=>{window.__writes=0;window.__picks=0;window.showSaveFilePicker=async o=>{window.__picks++;return {name:o.suggestedName,createWritable:async()=>({write:async b=>{if(b.type!=='application/pdf')throw Error('type');window.__writes++;await new Promise(ok=>window.__finish=ok)},close:async()=>{},abort:async()=>{}})}}})
  await page.getByRole('button',{name:'PDF 파일 저장',exact:true}).evaluate(el=>{el.click();el.click()});await page.waitForFunction(()=>typeof window.__finish==='function')
  assert.equal(await page.getByRole('button',{name:'PDF 결과 닫기',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'페이지 다시 선택',exact:true}).isDisabled(),true)
  await page.evaluate(()=>window.__finish());await page.getByText(/저장을 완료했어요/).waitFor();assert.deepEqual(await page.evaluate(()=>[window.__picks,window.__writes]),[1,1]);record.save.saved++
  assert.equal(await page.locator('iframe').getAttribute('src'),src);assert.equal(await page.getByTestId('pdf-result-name').innerText(),name)
 })
 await scenario('selected-download',5,async(page,record)=>{
  await page.getByRole('button',{name:'페이지 골라 내보내기',exact:true}).click();for(const n of [3,5])await page.getByRole('checkbox',{name:`${n}페이지 선택`,exact:true}).click()
  const name=await inspect(page,record,[1,3,5]);assert.match(name,/_selected03_/)
  await page.evaluate(()=>{window.showSaveFilePicker=undefined});const download=page.waitForEvent('download');await page.getByRole('button',{name:'PDF 파일 저장',exact:true}).click();const d=await download;assert.equal(d.suggestedFilename(),name);assert.equal(await d.failure(),null);record.save.downloadStarted++
 })
 await scenario('range',6,async(page,record)=>{
  await page.getByRole('button',{name:'페이지 범위 내보내기',exact:true}).click();await page.getByLabel('시작 페이지',{exact:true}).fill('2');await page.getByLabel('끝 페이지',{exact:true}).fill('6');const name=await inspect(page,record,[2,3,4,5,6]);assert.match(name,/_p02-p06_/)
 })
 await scenario('all-20',20,async(page,record)=>{
  await page.getByRole('button',{name:'페이지 골라 내보내기',exact:true}).click();await page.getByRole('button',{name:'전체 선택',exact:true}).click();const name=await inspect(page,record,Array.from({length:20},(_,i)=>i+1));assert.match(name,/_all_/)
 })
 await scenario('limit-21',21,async(page,record)=>{
  await page.getByRole('button',{name:'페이지 골라 내보내기',exact:true}).click();assert.equal(await page.getByRole('button',{name:'전체 선택',exact:true}).isDisabled(),true);record.check='21장 전체 선택 차단'
 })
 await scenario('generation-cancel',20,async(page,record)=>{
  await page.getByRole('button',{name:'페이지 골라 내보내기',exact:true}).click();await page.getByRole('button',{name:'전체 선택',exact:true}).click();await page.getByRole('button',{name:'PDF 만들기',exact:true}).click()
  await page.getByRole('button',{name:'PDF 생성 취소',exact:true}).click();await page.getByText('PDF 생성을 취소했어요. 편집 내용은 그대로예요.',{exact:true}).waitFor({timeout:35000});assert.equal(await page.getByRole('button',{name:'PDF 파일 저장',exact:true}).count(),0);record.check='생성 취소는 성공/저장으로 표시하지 않고 재시도 진입점 유지'
 })
 await scenario('middle-failure',3,async(page,record)=>{
  await page.getByRole('button',{name:'페이지 골라 내보내기',exact:true}).click();await page.getByRole('button',{name:'전체 선택',exact:true}).click();await page.getByRole('button',{name:'PDF 만들기',exact:true}).click();await page.getByRole('button',{name:'같은 내용으로 다시 만들기',exact:true}).waitFor({timeout:190000});assert.equal(await page.getByRole('button',{name:'PDF 파일 저장',exact:true}).count(),0);record.check='중간 면 실패시 부분 PDF 저장 차단'
 },{broken:true})
 return {passed:records.every(r=>r.passed),browser:browser.version(),os:release(),runAt:new Date().toISOString(),records}
}
