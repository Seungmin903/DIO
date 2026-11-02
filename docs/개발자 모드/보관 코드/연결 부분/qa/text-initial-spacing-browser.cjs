// 전용 origin·합성 문서로 새 텍스트의 실제 입력 높이를 검증한다.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../.expo/text-spacing-web');
const server = http.createServer((req,res) => {
  const file = path.resolve(root, '.' + new URL(req.url,'http://localhost').pathname);
  if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file===root?path.join(root,'index.html'):file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',file===root?'text/html':file.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(data)});
});
(async()=>{let browser;try{
  const {STORAGE_KEYS}=await import('../src/editor/utils/storageContract.js');
  const {createDefaultDoc}=await import('../src/editor/state/defaultDoc.js');
  const diary={id:'qa-spacing',title:'여백 확인',color:'#CED9EE',pattern:'linen',type:'개인',createdAt:'2026-10-26T00:00:00Z'};
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:1280,height:800},{width:412,height:892}]){
    const context=await browser.newContext({viewport});
    await context.addInitScript(({keys,diary,doc})=>{localStorage.setItem(keys.diaries,JSON.stringify([diary]));localStorage.setItem(keys.doc+':'+diary.id,JSON.stringify(doc))},{keys:STORAGE_KEYS,diary,doc:createDefaultDoc(diary)});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button',{name:'개발자 모드로 시작',exact:true}).click();
    await page.getByRole('button',{name:'여백 확인 열기',exact:true}).click();
    await page.getByRole('button',{name:'텍스트',exact:true}).click();
    const closeSettings=page.getByLabel('텍스트 설정 닫기',{exact:true});
    if(await closeSettings.isVisible())await closeSettings.click();
    await page.getByLabel('드래그하여 텍스트 상자 만들기',{exact:true}).click({position:{x:70,y:70}});
    const input=page.getByRole('textbox',{name:'캔버스 텍스트 내용',exact:true});
    await input.fill('Dynamic');
    await page.waitForTimeout(200);
    const one=await input.evaluate(node=>({height:node.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(node).lineHeight)}));
    assert.ok(one.height<=one.lineHeight+2,JSON.stringify(one));
    await input.fill('Dynamic\n한글 둘째 줄\n셋째 줄');
    await page.waitForTimeout(200);
    const multi=await input.boundingBox();assert.ok(multi.height>one.height*2);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport,one,multiHeight:multi.height,errors}));
    await context.close();
  }
}finally{await browser?.close();server.close()}})().catch(error=>{console.error(error);process.exitCode=1;server.close()});
