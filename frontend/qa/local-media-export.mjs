import { STORAGE_KEYS, MEDIA_DB } from '../src/editor/utils/storageContract.js'

// 외부 Playwright 실행기에서 runLocalMediaQa(browser, options)를 호출한다.
// 전용 새 BrowserContext만 사용한다. 사용자 탭의 localStorage/IndexedDB는 수정하지 않는다.
export async function runLocalMediaQa(browser, { baseUrl, fixtureDir, outputDir, manifest, baseCommit = 'unspecified', dateKST }) {
  const url=new URL(baseUrl)
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password)throw Error('QA는 http://127.0.0.1의 전용 서버만 허용합니다.')
  const path={join:(...parts)=>parts.join('/')}
  const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true})
  let page=await context.newPage()
  const report={baseCommit,dateKST,fixtureKind:'synthetic PNG quadrants / generated two-frame GIFs',cases:[],pending:['iPhone/iPad/Android 실기기 사진첩 저장·권한·강제 종료','72번 필기·텍스트 데이터 모델/구현'],scope:'실제 가져오기·자동 저장·웹 재실행·PNG 다운로드. 변형 좌표는 고정 fixture를 저장소에 넣어 렌더러를 검증하며 편집 제스처 검증은 아님.'}
  report.fixtures=manifest
  // 보관함에서 만든 다이어리의 편집 문서는 doc 키 뒤에 `:<diaryId>`를 붙여 저장된다.
  // 출력 크기는 페이지마다 다르므로(114번 속지: canvasWidth/canvasHeight) 실제 문서에서 읽는다.
  const TITLE='QA 75 저장 복원'
  let PAGE=null
  let key=null
  report.storageContract={keys:STORAGE_KEYS,mediaDb:MEDIA_DB}
  const ensure=(condition,message)=>{if(!condition)throw Error(message)}
  const share=()=>page.getByLabel('공유 및 내보내기',{exact:true})
  async function createDiary() {
    await page.getByRole('button',{name:'새 다이어리'}).first().click()
    await page.getByLabel('다이어리 이름').fill(TITLE)
    await page.getByRole('button',{name:/다이어리 만들기/}).last().click()
    await share().waitFor({timeout:15000})
    const list=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'[]'),STORAGE_KEYS.diaries)
    const diary=list.find(d=>d.title===TITLE)
    ensure(diary,'Diary list was not saved')
    return `${STORAGE_KEYS.doc}:${diary.id}`
  }
  // 새로고침·새 탭 뒤에는 보관함에서 같은 다이어리를 다시 연다.
  async function openDiary() {
    await page.getByRole('button',{name:`${TITLE} 열기`}).first().click({timeout:15000})
    await share().waitFor({timeout:15000})
  }
  // 편집기 확대(Ctrl+휠). 확대되면 '화면에 맞춤' 버튼이 나타나므로 실제 확대 여부를 확인한다.
  async function zoomEditor() {
    await page.mouse.move(586,436)
    await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control')
    await page.getByLabel('화면에 맞춤',{exact:true}).waitFor({timeout:5000})
  }
  async function readMedia() {
    return page.evaluate(async(mediaDb)=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(mediaDb.name,mediaDb.version);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
      const tx=db.transaction(['metadata','blobs']),ms=tx.objectStore('metadata').getAll(),bs=tx.objectStore('blobs').getAll(),ks=tx.objectStore('blobs').getAllKeys()
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)})
      const records=[]
      for(const meta of ms.result){const blob=bs.result[ks.result.indexOf(meta.mediaFileId)];const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');records.push({...meta,sha256:hash})}
      db.close();return records
    },MEDIA_DB)
  }
  async function chooseFiles(names) {
    await page.getByRole('button',{name:'사진',exact:true}).click()
    // OS chooser 자체는 별도 검증. hidden input으로 실제 File들을 앱 importer에 전달한다.
    await page.evaluate(()=>{window.__qaOriginalInputClick=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type!=='file')return window.__qaOriginalInputClick.call(this)}})
    try {
      await page.getByRole('button',{name:/사진 · GIF 불러오기/}).click()
      await page.locator('input[type=file]').setInputFiles(names.map(n=>path.join(fixtureDir,n)))
    } finally {
      await page.evaluate(()=>{HTMLInputElement.prototype.click=window.__qaOriginalInputClick;delete window.__qaOriginalInputClick})
    }
  }
  async function exportPng(name) {
    await page.evaluate(()=>{window.showSaveFilePicker=undefined})
    const started=Date.now()
    await share().click({timeout:10000})
    await page.getByRole('button',{name:'현재 페이지 내보내기',exact:true}).click()
    await page.getByRole('button',{name:'PNG 미리보기',exact:true}).click()
    await page.getByLabel('PNG 파일 저장',{exact:true}).waitFor({state:'visible',timeout:35000})
    const generationMs=Date.now()-started
    const pixels=await page.evaluate(async()=>{
      const node=document.querySelector('[aria-label="완성 페이지 PNG"]'),image=node.matches('img')?node:node.querySelector('img')
      await image.decode()
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0)
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data
      const pixel=(x,y)=>[...data.slice((y*canvas.width+x)*4,(y*canvas.width+x)*4+4)]
      const binary=await (await fetch(image.src)).arrayBuffer()
      return {pngBytes:binary.byteLength,pngHeader:[...new Uint8Array(binary).slice(0,8)],width:canvas.width,height:canvas.height,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join(''),samples:{quadRed:pixel(100,100),quadGreen:pixel(400,100),quadBlue:pixel(100,300),crop:pixel(630,147),gifRed:pixel(110,495),gifGreen:pixel(180,530),outsideRotated:pixel(79,430),overlapFront:pixel(165,510)}}
    })
    const downloading=page.waitForEvent('download')
    await page.getByLabel('PNG 파일 저장',{exact:true}).click()
    const download=await downloading
    const destination=path.join(outputDir,name+'.png');await download.saveAs(destination)
    ensure(pixels.pngHeader.join(',')==='137,80,78,71,13,10,26,10','Downloaded source is not PNG')
    ensure(pixels.width===PAGE.width&&pixels.height===PAGE.height,'Incorrect output dimensions')
    await page.getByText('다운로드를 시작했어요.',{exact:false}).waitFor()
    await page.getByLabel('PNG 내보내기 닫기',{exact:true}).click()
    return {generationMs,downloadName:download.suggestedFilename(),downloadBytes:pixels.pngBytes,pixels}
  }
  try {
    await page.goto(baseUrl)
    report.browser=await page.evaluate(()=>navigator.userAgent)
    key=await createDiary()
    report.storageContract.docKey=key
    const importStart=Date.now()
    await chooseFiles(manifest.filter(f=>f.width>0).map(f=>f.name))
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'null')?.pages?.[0]?.objects?.length===4,key,{timeout:60000})
    report.import={success:1,attempts:1,ms:Date.now()-importStart}
    PAGE=await page.evaluate(key=>{const p=JSON.parse(localStorage.getItem(key)).pages[0];return {width:p.canvasWidth??1188,height:p.canvasHeight??840,template:p.backgroundAssetId??null}},key)
    report.page=PAGE
    report.savedMedia=await readMedia()
    for(const m of report.savedMedia)ensure(manifest.find(f=>f.name===m.originalName)?.sha256===m.sha256,'Stored original changed: '+m.originalName)
    const expected=await page.evaluate((key)=>{
      const doc=JSON.parse(localStorage.getItem(key));const byName=Object.fromEntries(doc.pages[0].objects.map(o=>[o.name,o]))
      doc.pages[0].objects=[
        {...byName['photo-quadrants'],x:50,y:50,w:400,h:300,rotation:0,frame:'shape',shape:'rect'},
        {...byName['photo-large'],x:500,y:50,w:260,h:195,rotation:30,frame:'shape',shape:'rect',crop:{fx:0.75,fy:0.25,zoom:2}},
        {...byName['first-red'],x:80,y:450,w:100,h:100,rotation:25,frame:'shape',shape:'rect'},
        {...byName['first-green'],x:130,y:480,w:100,h:100,rotation:-15,frame:'shape',shape:'rect'},
      ];localStorage.setItem(key,JSON.stringify(doc));return JSON.stringify(doc)
    },key)
    for(let round=1;round<=3;round++) {
      const start=Date.now()
      if(round===3){await page.close();page=await context.newPage();await page.goto(baseUrl)}else await page.reload()
      await openDiary()
      await page.waitForFunction(()=>{const imgs=[...document.querySelectorAll('img')];return imgs.length>=4&&imgs.every(i=>i.complete&&i.naturalWidth>0)},{},{timeout:30000})
      const restoreMs=Date.now()-start
      ensure(await page.evaluate(key=>localStorage.getItem(key),key)===expected,'Document changed during reload')
      const restored=await readMedia()
      ensure(restored.length===4&&restored.every(m=>report.savedMedia.find(v=>v.mediaFileId===m.mediaFileId)?.sha256===m.sha256),'Original changed during reload')
      if(round===2)await zoomEditor()
      const result=await exportPng('tablet-'+round)
      const rgb=(name)=>result.pixels.samples[name].join(',')
      ensure(rgb('quadRed')==='224,48,48,255'&&rgb('quadGreen')==='32,176,80,255'&&rgb('quadBlue')==='40,88,224,255','Photo quadrant mismatch')
      ensure(rgb('crop')==='32,176,80,255','Crop/rotation mismatch')
      ensure(rgb('gifRed')==='255,0,0,255'&&rgb('gifGreen')==='0,255,0,255','GIF first frame mismatch')
      ensure(rgb('outsideRotated')==='255,255,255,255'&&rgb('overlapFront')==='0,255,0,255','Rotation boundary or z-order mismatch')
      report.cases.push({name:'tablet-'+round,restartMode:round===3?'close-and-new-tab':'reload',viewport:[1280,800],objects:4,gifs:2,restoreMs,...result})
      if(round>1)ensure(result.pixels.hash===report.cases[0].pixels.hash,'Output changed after replay/reload/zoom')
    }
    await page.setViewportSize({width:412,height:892})
    try {const result=await exportPng('narrow-web');report.cases.push({name:'narrow-web',viewport:[412,892],objects:4,gifs:2,...result});ensure(result.pixels.hash===report.cases[0].pixels.hash,'Viewport changed output')}
    catch(error){report.cases.push({name:'narrow-web',status:'failed',error:error.message})}
    await page.setViewportSize({width:1280,height:800})
    // UI 오류로 모달이 남았으면 닫는다.
    const close=page.getByLabel('PNG 내보내기 닫기',{exact:true});if(await close.count())await close.click()
    await page.evaluate((key)=>{const doc=JSON.parse(localStorage.getItem(key)),base=doc.pages[0].objects;doc.pages[0].objects=Array.from({length:20},(_,i)=>({...base[i%4],id:'stress-'+i,x:40+(i%5)*220,y:40+Math.floor(i/5)*185,w:150,h:110}));localStorage.setItem(key,JSON.stringify(doc))},key)
    await page.reload();await openDiary()
    report.cases.push({name:'20-elements',viewport:[1280,800],objects:20,gifs:10,...await exportPng('20-elements')})
    report.mediaAfter=await readMedia()
    ensure(report.mediaAfter.every(m=>report.savedMedia.find(v=>v.mediaFileId===m.mediaFileId)?.sha256===m.sha256),'Source modified after stress export')
    const before=await page.evaluate(key=>localStorage.getItem(key),key)
    await chooseFiles(['photo-quadrants.png','corrupt.png'])
    await page.getByRole('button',{name:'이미지 다시 선택',exact:true}).waitFor({timeout:15000})
    await page.waitForTimeout(2200)
    const after=await page.evaluate(key=>localStorage.getItem(key),key)
    const afterMedia=await readMedia()
    report.corruptBatch={documentPreserved:before===after,originalCount:afterMedia.length,persistentRetry:await page.getByRole('button',{name:'이미지 다시 선택',exact:true}).isVisible()}
    ensure(before===after&&afterMedia.length===4,'Invalid batch left partial data')
  } catch(error) {report.fatal={message:error.message,stack:error.stack};await page.screenshot({path:path.join(outputDir,'failure.png'),fullPage:true}).catch(()=>{})}
  finally {
    await context.close()
  }
  return report
}
