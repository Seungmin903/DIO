// 사진 틀 검증: Metro(PHOTO_FRAME_REVIEW_METRO_PORT, 기본 8096)를 띄운 뒤 node tests/photo-frames-browser.cjs
const {chromium}=require('playwright-core');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.join(__dirname,'../.expo/photo-frames-review-results');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta charset="utf-8"><body style="margin:0"><div id="root"></div><script src="/tests/fixtures/photo-frames-review.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>');return;}
 const proxy=http.get(`http://127.0.0.1:${process.env.PHOTO_FRAME_REVIEW_METRO_PORT||8096}${req.url}`,upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res)});proxy.on('error',e=>{res.writeHead(502);res.end(e.message)});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1820,height:900}});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.__photoFrameReview,null,{timeout:180000});
  await page.waitForTimeout(400);await page.screenshot({path:path.join(out,'overview.png')});
  const drawer=page.getByTestId('drawer'),options=page.getByTestId('options'),stage=page.getByTestId('stage');
  // 불러오기가 사진 틀보다 위, 안내 문구 없음
  const uploadY=(await drawer.getByRole('button',{name:'사진 · GIF 불러오기',exact:true}).boundingBox()).y;
  const frameY=(await drawer.getByText('사진 틀',{exact:true}).boundingBox()).y;assert.ok(uploadY<frameY);
  assert.equal(await drawer.getByText(/붙어요|들어가요|골라요/).count(),0);
  assert.equal(await drawer.getByText('최근 불러온 사진').count(),0);
  // 보관함: 없음 없이 9종 (티켓 4종). 옵션 패널에는 틀 고르기가 없다
  const names=['폴라로이드','필름','우표','공연 티켓','영화 티켓','경기 티켓','탑승권','인생네컷 (4칸)','필름 4컷 (4칸)'];
  for(const group of ['사진 틀','티켓','네컷']) assert.equal(await drawer.getByText(group,{exact:true}).count(),1,group);
  for(const name of names){
   assert.equal(await drawer.getByRole('button',{name:`사진 틀 ${name}`,exact:true}).count(),1,name);
  }
  assert.equal(await drawer.getByRole('button',{name:'사진 틀 없음',exact:true}).count(),0);
  assert.equal(await options.getByRole('button',{name:/^사진 틀 /}).count(),0);
  // 사진 틀을 누르면 바로 빈 틀이 붙는다
  await drawer.getByRole('button',{name:'사진 틀 탑승권',exact:true}).click();
  let added=await page.evaluate(()=>window.__photoFrameReview.added);assert.deepEqual(added.at(-1),{kind:'frame',frame:'ticketBoarding'});
  // 빈 자리 + : 빈 한 장 틀 · 4칸 틀의 빈 칸
  await stage.getByRole('button',{name:'우표에 사진 넣기',exact:true}).click();
  await stage.getByRole('button',{name:'인생네컷 4번 칸에 사진 넣기',exact:true}).click();
  const filled=await page.evaluate(()=>window.__photoFrameReview.filled);assert.deepEqual(filled,[['stamp',null],['fourcut',3]]);
  assert.equal(await stage.getByRole('button',{name:/폴라로이드.*사진 넣기/}).count(),0,'사진이 든 틀에는 + 가 없다');
  // 빈 자리를 위에 놓인 요소가 덮으면 + 를 띄우지 않는다 (아래에 깔린 틀의 + 가 위로 올라오지 않게)
  await page.evaluate(()=>window.__photoFrameSet(list=>{const s=list.find(o=>o.frame==='stamp');return [...list,{id:'cover',type:'sticker',x:s.x+s.w/2-30,y:s.y+s.h/2-30,w:60,h:60,rotation:0}]}));
  await page.waitForTimeout(150);
  assert.equal(await stage.getByRole('button',{name:'우표에 사진 넣기',exact:true}).count(),0,'덮인 + 는 숨긴다');
  await page.evaluate(()=>window.__photoFrameSet(list=>list.filter(o=>o.id!=='cover')));await page.waitForTimeout(150);
  assert.equal(await stage.getByRole('button',{name:'우표에 사진 넣기',exact:true}).count(),1);
  // 옵션 패널: 칸 사진 비우기 → 인생네컷 칸이 빈다
  await options.getByRole('button',{name:'2번 칸',exact:true}).click();
  await options.getByRole('button',{name:'2번 칸 비우기',exact:true}).click();
  const cells=await page.evaluate(()=>window.__photoFrameReview.objects.find(o=>o.frame==='fourcut').cells.map(c=>c?.name??null));
  assert.deepEqual(cells,['샘플 a',null,'샘플 c',null]);
  assert.equal(await stage.getByRole('button',{name:'인생네컷 2번 칸에 사진 넣기',exact:true}).count(),1,'비운 칸에 + 가 생긴다');
  await page.waitForTimeout(200);await page.screenshot({path:path.join(out,'after-clear.png')});
  // 찬 칸 자르기: 비율 고르기 없이 확대만, 적용하면 그 칸의 crop 만 바뀐다
  await options.getByRole('button',{name:'1번 칸',exact:true}).click();
  await options.getByRole('button',{name:'1번 칸 자르기',exact:true}).click();
  await page.getByText('1번 칸 자르기',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'1:1',exact:true}).count(),0);
  await page.getByLabel('사진 확대',{exact:true}).first().click();
  await page.screenshot({path:path.join(out,'cell-crop.png')});
  await page.getByText('적용',{exact:true}).click();
  const crop=await page.evaluate(()=>window.__photoFrameReview.objects.find(o=>o.frame==='fourcut').cells[0].crop);
  assert.ok(crop.zoom>1,JSON.stringify(crop));
  // 폰 폭에서도 틀 칸이 잘리지 않는다
  await page.setViewportSize({width:390,height:900});await page.waitForTimeout(200);
  await drawer.screenshot({path:path.join(out,'drawer-390.png')});
  for(const box of await drawer.getByRole('button',{name:/^사진 틀 /}).evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {w:b.width,h:b.height}}))) assert.ok(box.w>=60&&box.h>=44,JSON.stringify(box));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,out}));
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exit(1)});
