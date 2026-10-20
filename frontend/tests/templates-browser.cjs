const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../dist');
const artifacts = path.join(__dirname,'../.expo/template-test-results');
fs.mkdirSync(artifacts,{recursive:true});
const server = http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost');
  const file = path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(path.resolve(root)+path.sep)) {res.writeHead(403);res.end();return;}
  if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif'}[path.extname(file)]||'application/octet-stream'));
  fs.createReadStream(file).pipe(res);
});
// 독립 테스트 저장소에서 다이어리를 만들고, 재실행 때는 저장된 보관함 항목을 연다.
async function openDiary(page, title, stamp, seed) {
  await page.getByRole('button', {name:'새 다이어리',exact:true}).waitFor();
  if(await page.getByRole('button',{name:title+' 열기',exact:true}).count()) {
    await page.getByRole('button',{name:title+' 열기',exact:true}).click();
    await page.getByRole('button',{name:'다이어리 열기',exact:false}).click();
    return 'dio:editor:doc:v4:diary-'+stamp;
  }
  await page.getByRole('button', {name:'새 다이어리',exact:true}).click();
  await page.getByLabel('다이어리 이름',{exact:true}).fill(title);
  await page.evaluate(value => {window.__realNow=Date.now;Date.now=()=>value},stamp);
  try { await page.getByRole('button',{name:'다이어리 만들기',exact:false}).click(); }
  finally { await page.evaluate(()=>{Date.now=window.__realNow;delete window.__realNow}); }
  const key='dio:editor:doc:v4:diary-'+stamp;
  if(seed) await page.evaluate(({key,seed})=>localStorage.setItem(key,JSON.stringify(seed)),{key,seed});
  await page.getByRole('button',{name:'다이어리 열기',exact:false}).click();
  return key;
}
async function openPng(page) {
  await page.getByLabel('공유 및 내보내기',{exact:true}).click();
  await page.getByRole('button',{name:'현재 페이지 내보내기',exact:true}).click();
  await page.getByRole('button',{name:'PNG 미리보기',exact:true}).click();
}
async function assertPdfImages(bytes, sizes) {
  const {PDFDocument,PDFName,PDFRawStream,decodePDFRawStream}=require('pdf-lib');
  const pdf=await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),sizes.length);
  const images=pdf.context.enumerateIndirectObjects().map(([,object])=>object).filter(object=>object instanceof PDFRawStream&&String(object.dict.get(PDFName.of('Subtype')))==='/Image');
  assert.equal(images.length,sizes.length);
  images.forEach((image,index)=>{
    assert.deepEqual([Number(image.dict.get(PDFName.of('Width'))),Number(image.dict.get(PDFName.of('Height')))],sizes[index]);
    assert.equal(String(image.dict.get(PDFName.of('ColorSpace'))),'/DeviceRGB');
    const data=decodePDFRawStream(image).decode();
    let ink=0;
    for(let i=0;i<data.length;i+=3) if(Math.min(data[i],data[i+1],data[i+2])<200) ink++;
    assert.ok(ink>100,'PDF page contains rendered content');
  });
}
async function generatedPdfBytes(page) {
  await page.getByText('PDF 생성 완료',{exact:true}).waitFor({timeout:45000});
  const uri=await page.locator('iframe[title="생성된 PDF 미리보기"]').getAttribute('src');
  return Buffer.from(await page.evaluate(async uri=>Array.from(new Uint8Array(await (await fetch(uri)).arrayBuffer())),uri));
}
(async()=>{
  await new Promise(r=>server.listen(54831,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || (process.platform === 'win32' ? path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe') : undefined),headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
    await context.addInitScript(()=>{window.showSaveFilePicker=undefined});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR',m.text())});
    await page.goto('http://127.0.0.1:54831');
    const stamp=1770000000000;
    const key=await openDiary(page,'속지 병합 검증',stamp);
    await page.locator('[aria-label="선택 캔버스"] svg').waitFor();
    await page.screenshot({path:path.join(artifacts,'initial.png')});
    const canvas=page.locator('[aria-label="선택 캔버스"]');
    const click=label=>page.locator('[aria-label="'+label+'"]').click();
    const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
    const waitPages=async n=>{await page.waitForFunction(({count,key})=>JSON.parse(localStorage.getItem(key))?.pages.length===count,{count:n,key})};
    await click('3페이지');
    await canvas.locator('svg[id="2026-monthly-01-landscape"]').waitFor();
    await page.screenshot({path:path.join(artifacts,'monthly.png')});
    await click('4페이지');
    await canvas.locator('svg[id="2026-weekly-blocks-2025-12-29-landscape"]').waitFor();
    await page.screenshot({path:path.join(artifacts,'weekly.png')});
    const initialBox=await canvas.boundingBox();
    await canvas.dispatchEvent('wheel',{ctrlKey:true,deltaY:-30,clientX:initialBox.x+100,clientY:initialBox.y+100,bubbles:true});
    await page.waitForFunction(width=>document.querySelector('[aria-label="선택 캔버스"]').getBoundingClientRect().width>width+5,initialBox.width);
    await click('화면에 맞춤');
    await click('페이지 추가');
    await page.getByRole('button',{name:'취소',exact:true}).click();
    assert.equal(await saved(),null);
    const menus=['데일리 플래너','일기','포토·스크랩','자유 노트 · 무지','자유 노트 · 줄','자유 노트 · 모눈','자유 노트 · 도트'];
    for(let j=0;j<menus.length;j++){
      await click('페이지 추가');
      await page.getByRole('button',{name:menus[j],exact:true}).click();
      await waitPages(79+j);
      await canvas.locator('svg').waitFor();
      assert.ok((await canvas.locator('svg').first().getAttribute('id')).includes('reusable'));
    }
    let doc=await saved();
    assert.equal(doc.id,'diary-'+stamp);
    assert.equal(doc.title,'속지 병합 검증');
    assert.equal(doc.coverColor,'#6E92C6');
    assert.ok(await page.locator('[aria-label$="페이지"]').count()<40,'page list is virtualized');
    assert.equal(doc.pages.length,85);
    assert.equal(new Set(doc.pages.map(p=>p.id)).size,85);
    assert.equal(doc.pages.filter(p=>p.backgroundAssetId.includes('weekly')).length,53);
    await click('되돌리기'); await waitPages(84);
    await click('다시 실행'); await waitPages(85);
    // 가상화된 셀에서도 길게 눌러 순서를 바꾸고 실행 취소할 수 있다.
    const third=await page.locator('[aria-label="3페이지"]').boundingBox();
    const fourth=await page.locator('[aria-label="4페이지"]').boundingBox();
    const movedId=doc.pages[2].id;
    await page.mouse.move(third.x+40,third.y+40);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.move(fourth.x+40,fourth.y+70,{steps:8});
    await page.mouse.up();
    await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key))?.pages[3].id===id,{key,id:movedId});
    await click('되돌리기');
    await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key))?.pages[2].id===id,{key,id:movedId});
    await click('3페이지');
    await canvas.locator('svg[id="2026-monthly-01-landscape"]').waitFor();
    await click('스티커');
    await page.locator('[aria-label="커피"]').first().click();
    await click('보관함 닫기');
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.pages[2].objects.length===1,key);
    let sticker=(await saved()).pages[2].objects[0];
    assert.ok(Math.abs(sticker.x+sticker.w/2-512)<=80);
    assert.ok(Math.abs(sticker.y+sticker.h/2-384)<=60);
    await click('옵션');
    await page.getByRole('tab',{name:'배치',exact:true}).click();
    await page.getByRole('button',{name:'가운데',exact:true}).click();
    await page.getByRole('button',{name:'중간',exact:true}).click();
    await click('옵션 닫기');
    await page.waitForFunction(key=>{const o=JSON.parse(localStorage.getItem(key))?.pages[2].objects[0];return o?.x+o?.w/2===512&&o?.y+o?.h/2===384},key);
    doc=await saved();
    await page.screenshot({path:path.join(artifacts,'monthly-with-sticker.png')});
    await openPng(page);
    await page.getByText('1024 × 768 · PNG',{exact:true}).waitFor({timeout:30000});
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'PNG 파일 저장',exact:true}).click();
    const download=await downloadPromise;
    await download.saveAs(path.join(artifacts,'exported.png'));
    const png=fs.readFileSync(path.join(artifacts,'exported.png'));
    assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),768);
    await page.screenshot({path:path.join(artifacts,'export-preview.png')});
    await click('PNG 내보내기 닫기');
    for(const tool of ['펜','형광펜']){
      await click(tool);
      await click(tool); // 설정 창만 닫고 입력 도구 유지
      const input=page.locator('[aria-label="'+tool+' 입력 영역"]');
      const box=await input.boundingBox();
      await page.mouse.move(box.x+box.width-60,box.y+box.height-60);
      await page.mouse.down();
      await page.mouse.move(box.x+box.width+25,box.y+box.height+25,{steps:8});
      await page.mouse.up();
      await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.pages[2].objects.length===2,key);
      const stroke=(await saved()).pages[2].objects[1];
      assert.equal(stroke.type,'stroke');
      const points=stroke.points.map(p=>({x:p.x+stroke.x,y:p.y+stroke.y}));
      assert.ok(points.every(p=>p.x>=0&&p.y>=0&&p.x<=1024&&p.y<=768));
      assert.equal(points.at(-1).x,1024);
      assert.equal(points.at(-1).y,768);
      await click('되돌리기');
      await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.pages[2].objects.length===1,key);
      await click('선택');
    }
    await click('공유 및 내보내기');
    await page.getByRole('button',{name:'영역 선택 내보내기',exact:true}).click();
    await page.getByText('선택 1024.0 × 768.0 · 위치 0.0, 0.0',{exact:true}).waitFor();
    await page.getByRole('button',{name:'영역 선택 취소',exact:true}).click();
    await page.getByRole('button',{name:'페이지 범위 내보내기',exact:true}).click();
    await page.getByLabel('시작 페이지',{exact:true}).fill('2');
    await page.getByLabel('끝 페이지',{exact:true}).fill('3');
    await page.getByRole('button',{name:'PDF 만들기',exact:true}).click();
    await page.getByText('PDF 생성 완료',{exact:true}).waitFor({timeout:45000});
    await page.screenshot({path:path.join(artifacts,'pdf-ready.png')});
    const pdfUri=await page.locator('iframe[title="생성된 PDF 미리보기"]').getAttribute('src');
    const pdfBytes=await page.evaluate(async uri=>Array.from(new Uint8Array(await (await fetch(uri)).arrayBuffer())),pdfUri);
    fs.writeFileSync(path.join(artifacts,'templates.pdf'),Buffer.from(pdfBytes));
    await assertPdfImages(fs.readFileSync(path.join(artifacts,'templates.pdf')),[[2048,1536],[2048,1536]]);
    assert.ok(fs.statSync(path.join(artifacts,'templates.pdf')).size>10000);
    await page.getByRole('button',{name:'PDF 결과 닫기',exact:true}).click();
    assert.deepEqual(await saved(),doc);
    await page.reload();
    await openDiary(page,'속지 병합 검증',stamp);
    await canvas.locator('svg').waitFor();
    assert.deepEqual(await saved(),doc);
    assert.deepEqual(errors,[]);
    console.log('PASS new document: monthly/weekly, 7 reusable pages, cancel, zoom, drag reorder, pen/highlighter page bounds, undo/redo, sticker insertion/alignment, 1024x768 PNG, region dimensions, 2-page PDF, library/document reload.');
    await context.close();
    const legacy={id:'legacy',title:'기존 여행 보존',pages:[{id:'legacy-page',objects:[{id:'stamp',type:'sticker',emoji:'⭐',name:'기존 별',x:900,y:700,w:84,h:84,rotation:12}]}]};
    const oldContext=await browser.newContext({viewport:{width:1280,height:800}});
    await oldContext.addInitScript(doc=>localStorage.setItem('dio:editor:doc:v4',JSON.stringify(doc)),legacy);
    const old=await oldContext.newPage();
    await old.goto('http://127.0.0.1:54831');
    const oldKey=await openDiary(old,'기존 여행 보존',1770000000001,legacy);
    await old.getByText('기존 여행 보존',{exact:true}).waitFor();
    await old.locator('[aria-label="1페이지"]').waitFor();
    assert.equal(await old.locator('[aria-label="선택 캔버스"] svg[id^="2026"]').count(),0);
    assert.deepEqual(await old.evaluate(()=>JSON.parse(localStorage.getItem('dio:editor:doc:v4'))),legacy);
    await old.screenshot({path:path.join(artifacts,'legacy.png')});
    await old.locator('[aria-label="페이지 추가"]').click();
    await old.getByRole('button',{name:'일기',exact:true}).click();
    await old.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).pages.length===2,oldKey);
    assert.deepEqual((await old.evaluate(key=>JSON.parse(localStorage.getItem(key)),oldKey)).pages[0],legacy.pages[0]);
    await old.getByLabel('공유 및 내보내기',{exact:true}).click();
    await old.getByRole('button',{name:'페이지 범위 내보내기',exact:true}).click();
    await old.getByLabel('시작 페이지',{exact:true}).fill('1');
    await old.getByLabel('끝 페이지',{exact:true}).fill('2');
    await old.getByRole('button',{name:'PDF 만들기',exact:true}).click();
    const mixedPdf=await generatedPdfBytes(old);
    fs.writeFileSync(path.join(artifacts,'mixed-legacy-svg.pdf'),mixedPdf);
    await assertPdfImages(mixedPdf,[[2376,1680],[2048,1536]]);
    assert.deepEqual(await old.evaluate(()=>JSON.parse(localStorage.getItem('dio:editor:doc:v4'))),legacy);
    await oldContext.close();
    console.log('PASS mixed legacy/SVG PDF retains each page size and rendered content.');
    console.log('PASS legacy document and coordinates preserved when adding a new 4:3 page.');
    const failureContext=await browser.newContext({viewport:{width:1280,height:800}});
    const badDoc={id:'failure',title:'속지 실패 검사',pages:[{id:'bad',backgroundAssetId:'2026-reusable-diary-landscape',templateVersion:'1.0.0',canvasWidth:1024,canvasHeight:768,objects:[]}]};
    await failureContext.addInitScript(doc=>localStorage.setItem('dio:editor:doc:v4',JSON.stringify(doc)),badDoc);
    await failureContext.route('**/*2026-reusable-diary-landscape*.svg',route=>route.fulfill({status:404,body:'not found'}));
    const failure=await failureContext.newPage();
    await failure.goto('http://127.0.0.1:54831');
    await openDiary(failure,'속지 실패 검사',1770000000002,badDoc);
    await failure.locator('[aria-label="선택 캔버스"]').getByText('속지를 불러오지 못했어요. 다시 시도해 주세요.',{exact:true}).waitFor();
    await openPng(failure);
    await failure.getByText('속지를 준비하지 못했어요. 다시 시도해 주세요.',{exact:true}).waitFor();
    assert.equal(await failure.getByRole('button',{name:'PNG 파일 저장',exact:true}).count(),0);
    await failure.screenshot({path:path.join(artifacts,'export-error.png')});
    await failureContext.unroute('**/*2026-reusable-diary-landscape*.svg');
    await failure.getByRole('button',{name:'PNG 다시 만들기',exact:true}).click();
    await failure.getByText('1024 × 768 · PNG',{exact:true}).waitFor({timeout:30000});
    await failure.locator('[aria-label="PNG 내보내기 닫기"]').click();
    await failure.locator('[aria-label="선택 캔버스"]').getByRole('button',{name:'속지 다시 불러오기'}).click();
    await failure.locator('[aria-label="선택 캔버스"] svg').waitFor();
    await failureContext.close();
    console.log('PASS missing SVG blocks PNG save; export retry and canvas retry recover.');
  } finally { await browser.close();server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
