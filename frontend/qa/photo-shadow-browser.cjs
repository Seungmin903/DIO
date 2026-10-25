const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../.expo/photo-shadow-web'),out=path.resolve(__dirname,'.out/photo-shadow');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file===root?path.join(root,'index.html'):file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',file===root?'text/html':file.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(data)})});
(async()=>{let browser;try{
 const {STORAGE_KEYS}=await import('../src/editor/utils/storageContract.js');
 const {createDefaultDoc}=await import('../src/editor/state/defaultDoc.js');
 const diary={id:'qa-photo-shadow',title:'사진 그림자 확인',color:'#CED9EE',pattern:'linen',type:'개인',createdAt:'2026-10-26T00:00:00Z'};
 const png=new Uint8Array(80*80*4);for(let i=0;i<png.length;i+=4){png[i]=180;png[i+1]=210;png[i+2]=230;png[i+3]=255;}
 const src='data:image/png;base64,'+Buffer.from(require('upng-js').encode([png.buffer],80,80,0)).toString('base64');
 const doc=createDefaultDoc(diary);
 const kinds=[{frame:'shape',shape:'heart'},{frame:'shape',shape:'star'},{frame:'stamp'}];
 doc.pages[0].objects=Array.from({length:6},(_,i)=>({id:'shadow-'+i,type:'photo',name:'사진',x:80+(i%3)*300,y:i<3?100:360,w:180,h:160,rotation:0,src,imageWidth:80,imageHeight:80,crop:{fx:0.5,fy:0.5,zoom:1},shadow:true,shadowInset:i>=3,shadowColor:'#FF0000',shadowBlur:8,shadowOpacity:0.8,shadowSpread:4,shadowDistance:12,...kinds[i%3]}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'msedge',headless:true});fs.mkdirSync(out,{recursive:true});
 for(const viewport of [{width:1280,height:800},{width:412,height:892}]){
  const context=await browser.newContext({viewport});
  await context.addInitScript(({keys,diary,doc})=>{if(!localStorage.getItem('qa:shadow:seeded')){localStorage.setItem(keys.diaries,JSON.stringify([diary]));localStorage.setItem(keys.doc+':'+diary.id,JSON.stringify(doc));localStorage.setItem('qa:shadow:seeded','1')}},{keys:STORAGE_KEYS,diary,doc});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  const enter=async()=>{await page.getByRole('button',{name:'게스트로 시작하기',exact:true}).click();await page.getByRole('button',{name:'사진 그림자 확인 열기',exact:true}).click();await page.getByRole('button',{name:'다이어리 홈',exact:true}).waitFor()};
  await enter();await page.waitForFunction(()=>document.querySelectorAll('filter[id*="photo-shadow"]').length>=6);
  const ids=await page.locator('filter[id*="photo-shadow"]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length);
  assert.ok(await page.locator('mask[id*="photo-shadow"]').count()>=3);
  await page.screenshot({path:path.join(out,`photo-shadow-${viewport.width}.png`)});
  await page.reload();await enter();await page.waitForFunction(()=>document.querySelectorAll('filter[id*="photo-shadow"]').length>=6);
  assert.deepEqual(errors,[]);console.log(`PASS ${viewport.width}: 하트·별·우표 안팎 그림자 연결·고유 ID·Reload, pageerror 0`);await context.close();
 }
}finally{await browser?.close();server.close()}})().catch(error=>{console.error(error);process.exitCode=1;server.close()});
