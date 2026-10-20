import assert from 'node:assert/strict'
import { ANNUAL_PAGE_IDS, TEMPLATE_VERSION } from '../src/editor/templates/catalog.js'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { release, arch } from 'node:os'
const UPNG = createRequire(new URL('../package.json', import.meta.url))('upng-js')

export async function runRegionQa(browser, { baseURL, keys, gif, screenshotDir }) {
  const records = []
  let activeRecord
  const fixtures = async (page, broken = false, kind) => page.evaluate(({ keys, gif, broken, kind, templateId, templateVersion }) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 400
    const x = canvas.getContext('2d')
    for (const [color, a, b] of [['#ff0000',0,0],['#00ff00',200,0],['#0000ff',0,200],['#ffff00',200,200]]) { x.fillStyle=color; x.fillRect(a,b,200,200) }
    const src = canvas.toDataURL()
    const photo = { id:'quad',type:'photo',x:100,y:100,w:400,h:400,rotation:0,frame:'shape',shape:'rect',src,imageWidth:400,imageHeight:400,crop:{zoom:1,fx:0.5,fy:0.5} }
    const objects = [photo,
      {...photo,id:'rotate',x:520,y:100,w:300,h:240,rotation:30,crop:{zoom:1.4,fx:0.35,fy:0.65}},
      {...photo,id:'overlap',x:620,y:180,w:120,h:120},
      {...photo,id:'gif',x:950,y:120,w:80,h:80,src:gif,imageWidth:4,imageHeight:4},
      {id:'text',type:'text',x:100,y:600,w:300,h:70,rotation:0,baseWidth:300,text:'영역 QA 119\n다이어리 기록',color:'#111111'},
      {id:'stroke',type:'stroke',x:500,y:600,w:200,h:50,rotation:0,baseWidth:200,baseHeight:50,strokeWidth:6,penKind:'ballpoint',color:'#663399',points:[{x:10,y:25},{x:190,y:25}]},
    ]
    if (broken) objects.push({...photo,id:'missing',x:1150,y:700,w:50,h:50,mediaFileId:'qa-119-missing',src:'media:qa-119-missing'})
    if(kind==='invalid-element')objects[0].type='qa-unsupported'
    const fixturePage = kind==='template-crop' ? {id:'p119',canvasWidth:1024,canvasHeight:768,backgroundAssetId:templateId,templateVersion,objects:[]} : {id:'p119',canvasWidth:1280,canvasHeight:800,objects}
    localStorage.setItem(keys.diaries,JSON.stringify([{id:'qa119',title:'영역 QA 119',color:'#CED9EE'}]))
    localStorage.setItem(`${keys.doc}:qa119`,JSON.stringify({id:'qa119',title:'영역 QA 119',pages:[fixturePage]}))
    return {elements:fixturePage.objects.length,assets:fixturePage.objects.filter(o=>['photo','sticker','tape'].includes(o.type)).length, original:localStorage.getItem(`${keys.doc}:qa119`)}
  }, { keys, gif, broken, kind, templateId: ANNUAL_PAGE_IDS[0], templateVersion: TEMPLATE_VERSION })
  const image = async page => {
    const png = await page.getByLabel('완성 페이지 PNG',{exact:true}).evaluate(async el => {
      const i=el.tagName==='IMG'?el:el.querySelector('img'); await i.decode()
      const c=document.createElement('canvas'); c.width=i.naturalWidth;c.height=i.naturalHeight
      c.getContext('2d').drawImage(i,0,0);return c.toDataURL()
    })
    const bytes=Buffer.from(png.split(',')[1],'base64')
    const decoded=UPNG.decode(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))
    return {width:decoded.width,height:decoded.height,png,rgba:new Uint8Array(UPNG.toRGBA8(decoded)[0])}
  }
  const openRegion = async page => {
    await page.getByLabel('공유 및 내보내기',{exact:true}).click()
    await page.getByRole('button',{name:'영역 선택 내보내기',exact:true}).click()
  }
  const setRegion = async (page, r) => {
    await page.getByRole('button',{name:'영역 수치 조정',exact:true}).click()
    for (const [k,v] of Object.entries(r)) await page.getByLabel(`영역 ${k}`,{exact:true}).fill(String(v))
    await page.getByRole('button',{name:'영역 수치 적용',exact:true}).click()
  }
  const generate = async page => {
    const quality=page.getByRole('button',{name:'화질 안내 확인 후 계속',exact:true});if(await quality.isVisible())await quality.click()
    const start=performance.now()
    await page.getByRole('button',{name:'선택 영역 확정',exact:true}).click()
    await page.getByRole('button',{name:'PNG 파일 저장',exact:true}).waitFor({timeout:35000})
    const value=await image(page)
    const result={...value,ms:Math.round(performance.now()-start),hash:createHash('sha256').update(Buffer.from(value.rgba)).digest('hex')}
    activeRecord.renders.push({width:result.width,height:result.height,ms:result.ms,hash:result.hash,regionText:await page.getByText(/^영역 [0-9]/).last().innerText()})
    return result
  }
  const back = async page => page.getByRole('button',{name:'영역 다시 선택',exact:true}).click()
  async function scenario(name, viewport, dpr, action, broken=false) {
    const context=await browser.newContext({viewport,deviceScaleFactor:dpr,acceptDownloads:true,hasTouch:true})
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
    const record={name,viewport,dpr,passed:false,checks:[],renders:[],save:{saved:0,failed:0,cancelled:0,downloadStarted:0}}
    activeRecord=record
    try {
      await page.goto(baseURL);const fixture=await fixtures(page,broken,name);record.assets=fixture.assets;record.elements=fixture.elements
      await page.reload();await page.getByText('영역 QA 119',{exact:true}).first().click()
      await action({page,record,openRegion,setRegion,generate,image,back})
      assert.equal(await page.evaluate(k=>localStorage.getItem(k),`${keys.doc}:qa119`),fixture.original,'원본 문서 보존')
      assert.deepEqual(errors,[],'pageerror 없음');record.passed=true
      if(screenshotDir)await page.screenshot({path:`${screenshotDir}/${name}.png`})
    } catch(error){record.error=error.stack;if(screenshotDir)await page.screenshot({path:`${screenshotDir}/${name}-failed.png`}).catch(()=>{})}
    finally{records.push(record);console.log(name,record.passed?'PASS':record.error);await context.close()}
  }
  let baseline
  const region={x:100,y:100,width:400,height:400}
  for(const [name,viewport,dpr,scale]of [
    ['baseline',{width:1280,height:800},1,1],
    ['zoom-out',{width:1280,height:800},1,0.5],
    ['zoom-in',{width:1280,height:800},1,2],
    ['mobile-dpr2',{width:412,height:892},2,1],
  ])await scenario(name,viewport,dpr,async({page,record})=>{
    await openRegion(page)
    if(scale===0.5)for(let i=0;i<4;i++)await page.getByRole('button',{name:'영역 화면 축소',exact:true}).click()
    if(scale===2)for(let i=0;i<4;i++)await page.getByRole('button',{name:'영역 화면 확대',exact:true}).click()
    const actualZoom=await page.getByRole('button',{name:'영역 화면 확대',exact:true}).locator('..').innerText()
    record.scroll = await page.getByTestId('region-horizontal-scroll').evaluate(el => { el.scrollLeft=120;return {left:el.scrollLeft,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth} })
    await page.getByTestId('region-vertical-scroll').evaluate(el => {el.scrollTop=80})
    await setRegion(page,region);const out=await generate(page)
    assert.deepEqual([out.width,out.height],[800,800]);if(!baseline)baseline=out.hash;assert.equal(out.hash,baseline)
    const at=(a,b)=>Array.from(out.rgba.slice((b*out.width+a)*4,(b*out.width+a)*4+4))
    assert.deepEqual([at(100,100),at(700,100),at(100,700),at(700,700)],[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,0,255]])
    record.region=region;record.zoomText=actualZoom;record.output={width:out.width,height:out.height,hash:out.hash,ms:out.ms};record.checks.push('viewport/DPR/선택 줌에 독립적인 동일 픽셀')
    if(name==='baseline'){
      await page.evaluate(()=>{window.showSaveFilePicker=async()=>{throw new DOMException('cancel','AbortError')}})
      await page.getByRole('button',{name:'PNG 파일 저장',exact:true}).click();await page.getByText('저장을 취소했어요. 다시 저장할 수 있어요.',{exact:true}).waitFor();record.save.cancelled++
      await page.evaluate(()=>{window.showSaveFilePicker=async()=>{throw new Error('ENOSPC')}})
      await page.getByRole('button',{name:'PNG 파일 저장',exact:true}).click();await page.getByText('저장 공간이 부족해요. 공간을 확보한 뒤 다시 저장해 주세요.',{exact:true}).waitFor();record.save.failed++
      await page.evaluate(()=>{window.__qaWrites=0;window.__qaPicks=0;window.showSaveFilePicker=async o=>{window.__qaPicks++;return {name:o.suggestedName,createWritable:async()=>({write:async()=>{window.__qaWrites++;await new Promise(ok=>{window.__qaRelease=ok})},close:async()=>{},abort:async()=>{}})}}})
      await page.getByRole('button',{name:'PNG 파일 저장',exact:true}).evaluate(el=>{el.click();el.click()})
      await page.getByText('저장 중…',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'PNG 내보내기 닫기',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'영역 다시 선택',exact:true}).isDisabled(),true)
      await page.waitForFunction(()=>typeof window.__qaRelease==='function');await page.evaluate(()=>window.__qaRelease());await page.getByText(/저장을 완료했어요/).waitFor();assert.deepEqual(await page.evaluate(()=>[window.__qaPicks,window.__qaWrites]),[1,1]);record.save.saved++;record.checks.push('중복 저장 2회 클릭에도 picker/write 각 1회, 저장 중 닫기·재선택 비활성')
      record.checks.push('저장 picker 취소/실패/재시도는 브라우저 mock 검증이며 실제 OS 저장 아님')
      await back(page);await page.getByRole('button',{name:'정사각형 1:1',exact:true}).click();const fixed=await generate(page);assert.deepEqual([fixed.width,fixed.height],[1080,1080]);record.checks.push('영역 재선택/정사각형 1080×1080')
      await page.evaluate(()=>{window.showSaveFilePicker=undefined});const download=page.waitForEvent('download');await page.getByRole('button',{name:'PNG 파일 저장',exact:true}).click();const d=await download;assert.match(d.suggestedFilename(),/_region_square_/);assert.equal(await d.failure(),null);record.save.downloadStarted++;record.download=d.suggestedFilename()
      await page.getByRole('button',{name:'PNG 내보내기 닫기',exact:true}).click();await page.getByLabel('공유 및 내보내기',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'선택 영역 확정',exact:true}).count(),0);record.checks.push('PNG 닫기는 편집 화면 복귀, 영역 다시 선택과 구분')
    }
  })
  await scenario('composition',{width:1280,height:800},1,async({page,record})=>{
    await openRegion(page);const whole=await generate(page);assert.deepEqual([whole.width,whole.height],[2560,1600])
    const r={x:480,y:80,width:400,height:320};await back(page);await setRegion(page,r);const crop=await generate(page)
    let max=0,different=0,total=0
    for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++)for(let c=0;c<4;c++){
      const delta=Math.abs(crop.rgba[(y*crop.width+x)*4+c]-whole.rgba[((y+r.y*2)*whole.width+x+r.x*2)*4+c]);max=Math.max(max,delta);if(delta>2)different++;total++
    }
    assert.ok(different/total<0.001,`rotation/crop/overlap diff=${different}/${total}`)
    record.region=r;record.output={width:crop.width,height:crop.height,hash:crop.hash,ms:crop.ms};record.comparison={different,total,max,tolerance:2};record.checks.push('회전/크롭/겹침 결과를 전체 자유 2배 PNG의 같은 구역과 비교')
    await back(page);await setRegion(page,{x:950,y:120,width:80,height:80});const gifOut=await generate(page);assert.deepEqual(Array.from(gifOut.rgba.slice((80*gifOut.width+80)*4,(80*gifOut.width+80)*4+4)),[255,0,0,255]);record.checks.push('GIF 0번 빨간 프레임')
    await back(page);await setRegion(page,{x:100,y:580,width:650,height:120});const text=await generate(page);const ink=[];for(let y=0;y<text.height;y++)for(let x=0;x<text.width;x++){const k=(y*text.width+x)*4;if(text.rgba[k]<200&&text.rgba[k+1]<200&&text.rgba[k+2]<200)ink.push(x)}assert.ok(ink.some(x=>x<500));assert.ok(ink.some(x=>x>800));record.checks.push('기본 문자열/펜 획 픽셀 존재 확인: 72 전체 검증 대체 아님')
  })
  await scenario('bounds-presets',{width:1280,height:800},1,async({page,record})=>{
    await openRegion(page)
    for(const r of [{x:1248,y:768,width:32,height:32},{x:0,y:0,width:32,height:32}]){
      await setRegion(page,r);const out=await generate(page);assert.deepEqual([out.width,out.height],[64,64]);record.checks.push(`최소/경계 ${JSON.stringify(r)} ->64×64`);await back(page)
    }
    await setRegion(page,{x:100,y:100,width:400,height:500});await page.getByRole('button',{name:'세로 피드 4:5',exact:true}).click();let out=await generate(page);assert.deepEqual([out.width,out.height],[1080,1350]);await back(page)
    await page.getByRole('button',{name:'스토리 9:16',exact:true}).click();out=await generate(page);assert.deepEqual([out.width,out.height],[1080,1920]);record.checks.push('세로/스토리 고정 출력 크기');await back(page)
    await page.getByRole('button',{name:'자유',exact:true}).click();await setRegion(page,{x:0,y:0,width:31,height:32});await page.getByText('최소 32×32·페이지 경계·프리셋 비율을 확인해 주세요.',{exact:true}).waitFor();record.checks.push('31 논리 단위 입력 거부')
    await page.getByRole('button',{name:'영역 선택 취소',exact:true}).click();await page.getByRole('button',{name:'현재 페이지 내보내기',exact:true}).click();await page.getByRole('button',{name:'PNG 미리보기',exact:true}).click();await page.getByRole('button',{name:'PNG 파일 저장',exact:true}).waitFor();out=await image(page);assert.deepEqual([out.width,out.height],[1280,800]);record.checks.push('공유 메뉴 복귀 및 기존 전체 PNG 1280×800')
  })
  await scenario('reverse-drag',{width:1280,height:800},1,async({page,record})=>{
    await openRegion(page);await page.getByRole('button',{name:'새 영역 그리기',exact:true}).click()
    const overlay=page.getByTestId('export-region-overlay');await overlay.scrollIntoViewIfNeeded();const b=await overlay.boundingBox(),z=b.width/1280
    await page.mouse.move(b.x+500*z,b.y+500*z);await page.mouse.down();await page.mouse.move(b.x+100*z,b.y+100*z,{steps:12});await page.mouse.up()
    const selection=await page.getByText(/^선택 .*예상 PNG/).innerText();record.gestureSelection=selection
    assert.match(selection,/선택 400\.0 × 400\.0/)
    await page.getByRole('button',{name:'새 영역 그리기',exact:true}).click()
    await page.mouse.move(b.x+250*z,b.y+250*z);await page.mouse.down();await page.mouse.move(b.x+250*z+2,b.y+250*z+2);await page.mouse.up()
    assert.equal(await page.getByText(/^선택 .*예상 PNG/).innerText(),selection)
    record.checks.push('사진 위에서 역방향 마우스 드래그 좌표, 최소 미만 새 드래그의 이전 영역 복원')
  })
  await scenario('touch-scroll',{width:412,height:892},2,async({page,record})=>{
    await openRegion(page);for(let i=0;i<5;i++)await page.getByRole('button',{name:'영역 화면 확대',exact:true}).click()
    const scroll=page.getByTestId('region-horizontal-scroll');await scroll.scrollIntoViewIfNeeded();const b=await scroll.boundingBox()
    const cdp=await page.context().newCDPSession(page),y=Math.min(850,b.y+80),start=Math.min(370,b.x+b.width-20),end=b.x+30
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]})
    for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/12,y}]})
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200)
    const moved=await scroll.evaluate(el=>({left:el.scrollLeft,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}));assert.ok(moved.left>0,JSON.stringify(moved));record.touchScroll=moved;record.checks.push('Chromium CDP 한 손가락 가로 스크롤 에뮬레이션: 실제 태블릿 검증 아님')
  })
  await scenario('invalid-element',{width:1280,height:800},1,async({page,record})=>{
    await openRegion(page);await page.getByRole('button',{name:'선택 영역 확정',exact:true}).click()
    const alert=page.getByRole('alert').filter({hasText:'아직 내보낼 수 없는 요소가 있어요.'});await alert.waitFor();assert.ok(await alert.isVisible());assert.equal(await page.getByRole('button',{name:'PNG 파일 저장',exact:true}).count(),0);record.checks.push('확정 오류가 선택 Modal 안 alert로 표시됨')
  })
  await scenario('template-crop',{width:1280,height:800},1,async({page,record})=>{
    await openRegion(page);const whole=await generate(page);assert.deepEqual([whole.width,whole.height],[2048,1536]);await back(page)
    const r={x:200,y:160,width:400,height:300};await setRegion(page,r);const crop=await generate(page)
    let max=0,different=0,total=0,ink=0
    for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++)for(let c=0;c<4;c++){
      const actual=crop.rgba[(y*crop.width+x)*4+c],expected=whole.rgba[((y+r.y*2)*whole.width+x+r.x*2)*4+c]
      const delta=Math.abs(actual-expected);max=Math.max(max,delta);if(delta>2)different++;total++;if(c<3&&actual<240)ink++
    }
    assert.ok(ink>100);assert.ok(different/total<0.001,`template crop mismatch ${different}/${total}`)
    record.templateComparison={different,total,max,tolerance:2};record.checks.push('1024×768 SVG 속지를 재배치/축소하지 않고 전체 2배의 같은 구역으로 클리핑')
  })
  await scenario('missing-media',{width:1280,height:800},1,async({page,record})=>{
    await openRegion(page);await setRegion(page,region);await page.getByRole('button',{name:'선택 영역 확정',exact:true}).click();await page.getByText('파일은 저장되지 않았어요. 편집 내용은 그대로 유지돼요.',{exact:true}).waitFor({timeout:35000});assert.equal(await page.getByRole('button',{name:'PNG 파일 저장',exact:true}).count(),0)
    await page.getByRole('button',{name:'PNG 다시 만들기',exact:true}).click();await page.getByText('파일은 저장되지 않았어요. 편집 내용은 그대로 유지돼요.',{exact:true}).waitFor({timeout:35000});await back(page);record.checks.push('영역 밖 누락 소재도 중단, 저장 버튼 없음, 같은 snapshot 재시도, 영역 재선택 가능')
  },true)
  return {browser:browser.version(),platform:process.platform,osRelease:release(),arch:arch(),runAt:new Date().toISOString(),records,passed:records.every(r=>r.passed)}
}
