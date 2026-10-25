const {chromium}=require('playwright-core');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.join(__dirname,'../.expo/shapes-review-results');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta charset="utf-8"><body style="margin:0"><div id="root"></div><script src="/tests/fixtures/editor-shapes-review.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>');return;}
 const proxy=http.get(`http://127.0.0.1:${process.env.SHAPE_REVIEW_METRO_PORT||8096}${req.url}`,upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res)});proxy.on('error',e=>{res.writeHead(502);res.end(e.message)});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const results=[],errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.__setShapeReview,null,{timeout:120000});
  const configure=async patch=>{await page.evaluate(patch=>window.__setShapeReview(patch),patch);await page.waitForTimeout(80)};
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});await configure({mode:'insert'});
   const tabs=page.getByRole('tab');assert.equal(await tabs.count(),7);
   const boxes=await tabs.evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();const text=node.firstElementChild;const r=text.getBoundingClientRect();return {width:b.width,height:r.height,label:node.textContent,whiteSpace:getComputedStyle(text).whiteSpace}}));
   for(const box of boxes){assert.ok(box.width>=64);assert.ok(box.height<25);assert.equal(box.whiteSpace,'nowrap')}
   await page.screenshot({path:path.join(out,`categories-${width}.png`)});results.push({width,categories:boxes});
  }
  await page.setViewportSize({width:1280,height:900});await configure({mode:'sample'});
  const bounds=await page.evaluate(()=>{
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');document.body.appendChild(svg);
   const result=window.__reviewShapes.map(shape=>{const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',shape.path);svg.appendChild(path);const b=path.getBBox();path.remove();return {id:shape.id,x:b.x,y:b.y,right:b.x+b.width,bottom:b.y+b.height}});svg.remove();return result;
  });
  for(const b of bounds)assert.ok(b.x>=-0.01&&b.y>=-0.01&&b.right<=100.01&&b.bottom<=100.01,JSON.stringify(b));results.push({pathsWithinBounds:bounds.length});
  const original=await page.evaluate(()=>window.__shapeReviewState.object);
  const geometry=()=>page.getByTestId('shape-sample').evaluate(node=>{const svg=[...node.querySelectorAll('svg')].at(-1);const b=svg.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,path:svg.querySelector('path').getAttribute('transform')}});
  const before=await geometry();
  await configure({object:{...original,shadow:true,shadowSpread:5,shadowBlur:12,shadowDistance:10,shadowDirection:'br'}});
  assert.deepEqual(await geometry(),before);await page.screenshot({path:path.join(out,'shadow.png')});results.push({shadowGeometryStable:true});
  await configure({mode:'options'});assert.equal(await page.getByRole('button',{name:'원',exact:true}).count(),0);
  await page.getByRole('tab',{name:'배치',exact:true}).click();await page.getByRole('button',{name:'좌우 반전',exact:true}).click();await page.waitForFunction(()=>window.__shapeReviewState.object.flipX===true);
  await page.screenshot({path:path.join(out,'options-layout.png')});
  await page.getByRole('textbox',{name:'각도 숫자 입력',exact:true}).waitFor({state:'visible',timeout:5000});results.push({singleShapeOptions:true});
  await configure({mode:'format'});
  const textY=()=>page.getByTestId('shape-sample').getByText('안녕 도형 ABC',{exact:true}).first().boundingBox();
  await page.getByRole('button',{name:'위 정렬',exact:true}).click();const top=await textY();
  await page.getByRole('button',{name:'아래 정렬',exact:true}).click();const bottom=await textY();assert.ok(bottom.y-top.y>100);results.push({verticalAlignmentDistance:bottom.y-top.y});
  await configure({mode:'edit'});const input=page.getByRole('textbox',{name:'도형 내부 글',exact:true});await input.fill('웹 도형 글 수정 확인');await input.blur();await page.waitForFunction(()=>window.__shapeReviewState.object.text==='웹 도형 글 수정 확인');results.push({webEditing:true});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
