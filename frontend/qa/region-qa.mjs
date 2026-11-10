import assert from 'node:assert/strict'
import { UNDATED_TEMPLATES } from '../src/editor/templates/undated.js'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { release, arch } from 'node:os'
import { setRegion, touchGesture } from './region-gestures.mjs'
const UPNG = createRequire(new URL('../package.json', import.meta.url))('upng-js')
const largeViewport = { width: 1800, height: 1000 }
const template = UNDATED_TEMPLATES.find(({ id }) => id === 'undated-monthly-landscape')

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
  }, { keys, gif, broken, kind, templateId: template.id, templateVersion: template.templateVersion })
  const downloadImage = async (page, button) => {
    const [download] = await Promise.all([page.waitForEvent('download',{timeout:35000}), button.click()])
    assert.equal(await download.failure(),null)
    const bytes = await readFile(await download.path())
    const decoded=UPNG.decode(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))
    assert.equal(await page.getByRole('button',{name:'PNG 파일 저장',exact:true}).count(),0)
    return {width:decoded.width,height:decoded.height,filename:download.suggestedFilename(),rgba:new Uint8Array(UPNG.toRGBA8(decoded)[0])}
  }
  const openRegion = async page => {
    await page.getByLabel('공유 및 내보내기',{exact:true}).click()
    await page.getByRole('button',{name:'영역 선택 내보내기',exact:true}).click()
  }
  const generate = async page => {
    const quality=page.getByRole('button',{name:'화질 안내 확인 후 계속',exact:true});if(await quality.isVisible())await quality.click()
    const start=performance.now()
    const value=await downloadImage(page,page.getByRole('button',{name:'선택 영역 확정',exact:true}))
    assert.match(value.filename,/_region_(free|square|portrait|story)_/)
    const result={...value,ms:Math.round(performance.now()-start),hash:createHash('sha256').update(Buffer.from(value.rgba)).digest('hex')}
    activeRecord.renders.push({width:result.width,height:result.height,ms:result.ms,hash:result.hash})
    activeRecord.save.downloadStarted++
    return result
  }
  const back = openRegion
  async function scenario(name, viewport, dpr, action, broken=false) {
    const context=await browser.newContext({viewport,deviceScaleFactor:dpr,acceptDownloads:true,hasTouch:true})
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
    const record={name,viewport,dpr,passed:false,checks:[],renders:[],save:{saved:0,failed:0,cancelled:0,downloadStarted:0}}
    activeRecord=record
    try {
      await page.goto(baseURL);const fixture=await fixtures(page,broken,name);record.assets=fixture.assets;record.elements=fixture.elements
      await page.reload();await page.getByText('영역 QA 119',{exact:true}).first().click()
      await action({page,record,openRegion,setRegion,generate,back})
      assert.equal(await page.evaluate(k=>localStorage.getItem(k),`${keys.doc}:qa119`),fixture.original,'원본 문서 보존')
      assert.deepEqual(errors,[],'pageerror 없음');record.passed=true
      if(screenshotDir)await page.screenshot({path:`${screenshotDir}/${name}.png`})
    } catch(error){record.error=error.stack;if(screenshotDir)await page.screenshot({path:`${screenshotDir}/${name}-failed.png`}).catch(()=>{})}
    finally{records.push(record);console.log(name,record.passed?'PASS':record.error);await context.close()}
  }
  let baseline
  const region={x:100,y:100,width:400,height:400}
  for(const [name,viewport,dpr,scale]of [
    ['baseline',largeViewport,1,1],
    ['zoom-out',largeViewport,1,0.5],
    ['zoom-in',largeViewport,1,2],
    ['desktop-dpr2',largeViewport,2,1],
  ])await scenario(name,viewport,dpr,async({page,record})=>{
    await openRegion(page)
    await setRegion(page,region)
    const overlay=page.getByTestId('export-region-overlay'), bounds=await overlay.boundingBox()
    if(scale!==1){
      const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2
      await touchGesture(page,[[x-50,y],[x+50,y]],[[x-50*scale,y],[x+50*scale,y]])
      const after=await overlay.boundingBox()
      assert.ok(Math.abs(after.width/bounds.width-scale)<0.02,JSON.stringify({bounds,after,scale}))
    }
    const out=await generate(page)
    assert.deepEqual([out.width,out.height],[800,800]);if(!baseline)baseline=out.hash;assert.equal(out.hash,baseline)
    const at=(a,b)=>Array.from(out.rgba.slice((b*out.width+a)*4,(b*out.width+a)*4+4))
    assert.deepEqual([at(100,100),at(700,100),at(100,700),at(700,700)],[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,0,255]])
    record.region=region;record.zoom=scale;record.output={width:out.width,height:out.height,hash:out.hash,ms:out.ms};record.checks.push('DPR과 선택 화면의 두 손가락 확대·축소에 독립적인 동일 픽셀')
    if(name==='baseline'){
      await back(page);await setRegion(page,region);await page.getByRole('button',{name:'정사각형 1:1',exact:true}).click()
      const fixed=await generate(page);assert.deepEqual([fixed.width,fixed.height],[1080,1080]);assert.match(fixed.filename,/_region_square_/)
      await page.getByLabel('공유 및 내보내기',{exact:true}).waitFor()
      assert.equal(await page.getByRole('button',{name:'선택 영역 확정',exact:true}).count(),0)
      record.checks.push('별도 미리보기 없이 정사각형 1080×1080 다운로드 후 편집 화면 유지')
    }
  })
  await scenario('composition',largeViewport,1,async({page,record})=>{
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
  await scenario('bounds-presets',largeViewport,1,async({page,record})=>{
    await openRegion(page)
    for(const r of [{x:1248,y:768,width:32,height:32},{x:0,y:0,width:32,height:32}]){
      await setRegion(page,r);const out=await generate(page);assert.deepEqual([out.width,out.height],[64,64]);record.checks.push(`최소/경계 ${JSON.stringify(r)} ->64×64`);await back(page)
    }
    await setRegion(page,{x:100,y:100,width:400,height:500});await page.getByRole('button',{name:'세로 피드 4:5',exact:true}).click()
    const fixed=page.getByTestId('export-region-frame')
    const before=await fixed.boundingBox()
    const handle=await page.getByTestId('region-handle-se').boundingBox()
    const x=handle.x+handle.width/2,y=handle.y+handle.height/2
    await touchGesture(page,[[x,y]],[[x-60,y]])
    const after=await fixed.boundingBox()
    assert.ok(after.width < before.width && Math.abs(after.width/after.height-0.8)<0.001,JSON.stringify({before,after}))
    let out=await generate(page);assert.deepEqual([out.width,out.height],[1080,1350]);await back(page)
    await setRegion(page,{x:100,y:100,width:200,height:250});await page.getByRole('button',{name:'세로 피드 4:5',exact:true}).click()
    assert.equal(await page.getByRole('button',{name:'선택 영역 확정',exact:true}).isDisabled(),true)
    out=await generate(page);assert.deepEqual([out.width,out.height],[1080,1350]);await back(page)
    await page.getByRole('button',{name:'스토리 9:16',exact:true}).click();out=await generate(page);assert.deepEqual([out.width,out.height],[1080,1920]);record.checks.push('세로/스토리 고정 출력 크기');await back(page)
    for(const name of ['화면 이동','영역 조정','새 영역 그리기','영역 화면 확대','영역 수치 조정','피드 비율 안내','스토리 비율 안내']){
      assert.equal(await page.getByRole('button',{name,exact:true}).count(),0)
    }
    for(const name of ['자유','정사각형 1:1','세로 피드 4:5','스토리 9:16']){
      assert.equal(await page.getByRole('button',{name,exact:true}).count(),1)
    }
    assert.equal(await page.getByText('게시 비율 참고',{exact:true}).count(),0)
    record.checks.push('비율 프리셋은 유지하고 게시 참고와 조작 버튼은 제거')
    await page.getByRole('button',{name:'영역 선택 취소',exact:true}).click()
    out=await downloadImage(page,page.getByRole('button',{name:'PNG 만들기',exact:true}))
    assert.deepEqual([out.width,out.height],[2560,1600]);record.checks.push('내보내기 메뉴 복귀 및 전체 PNG 2560×1600')
  })
  await scenario('touch-resize-and-pan',{width:412,height:892},2,async({page,record})=>{
    await openRegion(page)
    const overlay=page.getByTestId('export-region-overlay')
    const bounds=await overlay.boundingBox()
    const corner=await page.getByTestId('region-handle-se').boundingBox()
    const x=corner.x+corner.width/2,y=corner.y+corner.height/2
    await touchGesture(page,[[x,y]],[[x-80,y-50]])
    const frame=page.getByTestId('export-region-frame'), selected=await frame.boundingBox()
    assert.ok(selected.width < bounds.width-65 && selected.height < bounds.height-40)
    const mx=selected.x+selected.width/2,my=selected.y+selected.height/2
    await touchGesture(page,[[mx,my]],[[mx+25,my+20]])
    const movedSelection=await frame.boundingBox()
    assert.ok(Math.abs(movedSelection.x-selected.x-25)<2 && Math.abs(movedSelection.y-selected.y-20)<2)
    assert.ok(Math.abs(movedSelection.width-selected.width)<1 && Math.abs(movedSelection.height-selected.height)<1)
    const center=[bounds.x+bounds.width/2,bounds.y+bounds.height/2]
    const [cx,cy]=center
    await touchGesture(page,[[cx-30,cy],[cx+30,cy]],[[cx-5,cy+30],[cx+55,cy+30]])
    const moved=await overlay.boundingBox()
    assert.ok(Math.abs(moved.x-bounds.x-25)<2 && Math.abs(moved.y-bounds.y-30)<2)
    const after=await frame.boundingBox()
    assert.ok(Math.abs(after.width-selected.width)<1 && Math.abs(after.height-selected.height)<1)
    assert.ok(Math.abs(after.x-movedSelection.x-25)<2 && Math.abs(after.y-movedSelection.y-30)<2)
    record.checks.push('한 손가락 모서리 조절·영역 이동, 두 손가락으로 영역 좌표를 유지한 채 보기 이동')
  })
  await scenario('touch-corner-to-pinch',largeViewport,1,async({page,record})=>{
    await openRegion(page)
    const overlay=page.getByTestId('export-region-overlay'), bounds=await overlay.boundingBox()
    const corner=await page.getByTestId('region-handle-nw').boundingBox()
    const x=corner.x+corner.width/2,y=corner.y+corner.height/2
    await touchGesture(page,[[x+40,y+40],[x+140,y+140]],[[x+45,y+45],[x+195,y+195]],{initialSingle:[x,y]})
    await page.getByText('1280 × 800',{exact:true}).waitFor()
    assert.ok((await overlay.boundingBox()).width > bounds.width*1.4)
    record.checks.push('모서리에 손가락을 댄 상태에서 두 번째 손가락을 추가하면 확대')
  })
  await scenario('invalid-element',{width:1280,height:800},1,async({page,record})=>{
    await openRegion(page);await page.getByRole('button',{name:'선택 영역 확정',exact:true}).click()
    const alert=page.getByRole('alert').filter({hasText:'아직 내보낼 수 없는 요소가 있어요.'});await alert.waitFor();assert.ok(await alert.isVisible());assert.equal(await page.getByRole('button',{name:'PNG 파일 저장',exact:true}).count(),0);record.checks.push('확정 오류가 선택 Modal 안 alert로 표시됨')
  })
  await scenario('template-crop',largeViewport,1,async({page,record})=>{
    await openRegion(page);const whole=await generate(page);assert.deepEqual([whole.width,whole.height],[2048,1536]);await back(page)
    const r={x:200,y:160,width:400,height:300};await setRegion(page,r,1024,768);const crop=await generate(page)
    let max=0,different=0,total=0,ink=0
    for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++)for(let c=0;c<4;c++){
      const actual=crop.rgba[(y*crop.width+x)*4+c],expected=whole.rgba[((y+r.y*2)*whole.width+x+r.x*2)*4+c]
      const delta=Math.abs(actual-expected);max=Math.max(max,delta);if(delta>2)different++;total++;if(c<3&&actual<240)ink++
    }
    assert.ok(ink>100);assert.ok(different/total<0.001,`template crop mismatch ${different}/${total}`)
    record.templateComparison={different,total,max,tolerance:2};record.checks.push('1024×768 SVG 속지를 재배치/축소하지 않고 전체 2배의 같은 구역으로 클리핑')
  })
  await scenario('missing-media',largeViewport,1,async({page,record})=>{
    await openRegion(page);await setRegion(page,region)
    let downloads=0;page.on('download',()=>downloads++)
    await page.getByRole('button',{name:'선택 영역 확정',exact:true}).click()
    await page.getByText(/이미지를 준비하지 못했어요|원본 이미지를 찾을 수 없어요/).waitFor({timeout:35000})
    assert.equal(downloads,0)
    await back(page);record.checks.push('영역 밖 누락 소재도 다운로드 중단, 편집 화면에서 다시 선택 가능')
  },true)
  return {browser:browser.version(),platform:process.platform,osRelease:release(),arch:arch(),runAt:new Date().toISOString(),records,passed:records.every(r=>r.passed)}
}
