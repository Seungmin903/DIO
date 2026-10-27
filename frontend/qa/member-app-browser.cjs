// Own local database and isolated browser context only. Never print credentials.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const runtime = process.env.DIO_MEMBER_QA_RUNTIME_DIR ? path.resolve(process.env.DIO_MEMBER_QA_RUNTIME_DIR) : path.resolve(__dirname, '../../.local-data/member-app');
const metadata = JSON.parse(fs.readFileSync(path.join(runtime, 'runtime.json'), 'utf8').replace(/^\uFEFF/, ''));
const env = Object.fromEntries(fs.readFileSync(path.join(runtime, 'backend.env'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(line => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
if (env.DIO_MEMBER_OWNED_DATABASE !== 'true' || !/^(dio_member_app|dio_member_integration_[a-f0-9]{12})$/.test(metadata.database)) throw new Error('Owned local member QA runtime required');
const root = path.resolve(__dirname, '../.expo/member-app-web');
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.ttf':'font/ttf' };
const server = http.createServer((req,res) => {
  const file = path.resolve(root, '.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file!==root && !file.startsWith(root+path.sep)) return res.writeHead(403).end();
  const target=file===root?path.join(root,'index.html'):file;
  fs.readFile(target,(e,body)=>{ if(e) return res.writeHead(404).end(); res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream'); res.end(body); });
});
(async()=>{
  let browser;
  try {
    await new Promise(resolve=>server.listen(metadata.webPort,'127.0.0.1',resolve));
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:800}}), page=await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${metadata.webPort}`);
    let listPages=0;
    const paginate=async target=>target.route('**/api/v1/member/diaries?*',async route=>{
      const url=new URL(route.request().url());url.searchParams.set('limit','1');listPages++;
      await route.continue({url:url.toString()});
    });
    await paginate(page);
    const login=async(target=page)=>{
      await target.getByPlaceholder('이메일을 입력해 주세요').fill(env.DIO_MEMBER_QA_EMAIL);
      await target.getByPlaceholder('비밀번호를 입력해 주세요',{exact:true}).fill(env.DIO_MEMBER_QA_PASSWORD);
      await target.getByRole('button',{name:'로그인',exact:true}).click();
      await target.getByRole('button',{name:/^(회원 목록 새로고침|이전 생성 확인)$/}).waitFor();
      // The carousel virtualizes cards. A populated phone library may not mount
      // its trailing create card, so select the normal grid before locating cards.
      await target.getByRole('tab',{name:'한눈에 보기',exact:true}).click();
      await target.getByRole('button',{name:'새 다이어리 만들기',exact:true}).waitFor();
    };
    await login();
    console.log('STAGE login');
    await page.evaluate(()=>localStorage.setItem('dio:diary:list:v1','guest-sentinel'));
    const title=`회원 앱 QA ${Date.now()}`;
    let lost=true, first=null, replay=null; const keys=[];
    await page.route('**/api/v1/member/diaries',async route=>{
      if(route.request().method()!=='POST') return route.continue();
      keys.push(route.request().headers()['idempotency-key']);
      const response=await route.fetch();
      console.log('STAGE create HTTP',response.status());
      assert.equal(response.status(),201);
      const result=await response.json();
      if(lost){lost=false;first=result;await route.abort('failed');}
      else {replay=result; assert.equal(response.headers()['idempotency-replayed'],'true');await route.fulfill({response});}
    });
    page.on('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'새 다이어리 만들기',exact:true}).click();
    await page.getByRole('textbox',{name:'다이어리 이름',exact:true}).fill(title);
    await page.getByRole('button',{name:'내지 구성 선택하기',exact:true}).click();
    await page.getByRole('button',{name:'이 구성으로 시작',exact:true}).click();
    console.log('STAGE submitted');
    await page.getByRole('button',{name:'이 구성으로 시작 닫기',exact:true}).first().waitFor();
    await page.getByRole('button',{name:'이 구성으로 시작 닫기',exact:true}).last().click();
    await page.getByRole('button',{name:'이전 생성 확인',exact:true}).waitFor();
    console.log('STAGE lost');
    // Reload loses in-memory login while pending key survives in account storage.
    await page.reload(); await login();
    await page.getByRole('button',{name:'이전 생성 확인',exact:true}).click();
    await page.getByRole('button',{name:'다이어리 홈',exact:true}).click();
    await page.getByRole('button',{name:`${title} 열기`,exact:true}).waitFor();
    assert.equal(keys.length,2); assert.equal(keys[0],keys[1]); assert.deepEqual(first,replay);
    const stored=await page.evaluate(id=>Object.entries(localStorage).filter(([key])=>key.startsWith('dio:member:v1:')&&key.endsWith(':doc:'+id)).map(([,raw])=>JSON.parse(raw)),first.diary.diaryId);
    assert.equal(stored.length,1);
    assert.deepEqual(stored[0].pages.map(p=>p.id),first.pageIds);
    assert.equal(stored[0].id,first.diary.diaryId);
    let releaseDetail, capturedDetail;
    const detailGate=new Promise(resolve=>{releaseDetail=resolve});
    const detailReady=new Promise(resolve=>{capturedDetail=resolve});
    let holdDetail=true;
    const detailPath='**/api/v1/member/diaries/'+first.diary.diaryId;
    const delayDetail=async route=>{
      if(route.request().method()!=='GET'||!holdDetail) return route.continue();
      holdDetail=false;
      const response=await route.fetch();assert.equal(response.status(),200);
      capturedDetail();await detailGate;await route.fulfill({response});
    };
    await page.route(detailPath,delayDetail);
    await page.getByRole('button',{name:`${title} 열기`,exact:true}).click();
    await detailReady;
    await page.getByRole('button',{name:`${title} 수정`,exact:true}).click();
    await page.getByRole('textbox',{name:'다이어리 이름',exact:true}).fill(title+' 수정');
    const patched=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/member/diaries/'));
    await page.getByRole('button',{name:'완료하기',exact:true}).click();
    assert.equal((await patched).status(),200);
    await page.getByRole('button',{name:`${title} 수정 열기`,exact:true}).waitFor();
    releaseDetail();
    await page.getByRole('button',{name:'다이어리 홈',exact:true}).click();
    await page.getByRole('button',{name:`${title} 수정 열기`,exact:true}).waitFor();
    const indexAfterLateGet=await page.evaluate(id=>{
      const key=Object.keys(localStorage).find(k=>k.startsWith('dio:member:v1:')&&k.endsWith(':index'));
      return JSON.parse(localStorage.getItem(key)).find(d=>d.id===id);
    },first.diary.diaryId);
    assert.equal(indexAfterLateGet.title,title+' 수정');
    await page.unroute(detailPath,delayDetail);
    console.log('MEMBER_RACE_QA: delayed real GET after successful PATCH preserves new title and cached index');
    await page.getByRole('button',{name:`${title} 수정 열기`,exact:true}).click();
    await page.getByRole('button',{name:'다이어리 홈',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('dio:diary:list:v1')),'guest-sentinel');
    assert.ok(first.pageIds.length > 1, 'QA selection must have multiple server pages');
    await page.setViewportSize({width:412,height:892});
    await page.getByRole('button',{name:'페이지 목록',exact:true}).click();
    await page.getByRole('button',{name:'2페이지',exact:true}).click();
    const viewRecord = await page.evaluate(id=>{
      const key=Object.keys(localStorage).find(k=>k.startsWith('dio:member:v1:')&&k.endsWith(':doc:'+id));
      return {doc:key,view:'dio:editor:view:v1:'+key};
    },first.diary.diaryId);
    await page.waitForFunction(({key,pageId})=>JSON.parse(localStorage.getItem(key)||'null')===pageId,{key:viewRecord.view,pageId:first.pageIds[1]});
    const beforeViewOnly = await page.evaluate(key=>localStorage.getItem(key),viewRecord.doc);
    await page.reload(); await login();
    await page.getByRole('button',{name:`${title} 수정 열기`,exact:true}).click();
    await page.getByText(`PAGE 2 / ${first.pageIds.length}`,{exact:true}).waitFor();
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),viewRecord.doc),beforeViewOnly);
    console.log('MEMBER_DEVELOP_QA: phone viewport, persisted last viewed server page, document unchanged passed');
    const second=await browser.newContext({viewport:{width:1280,height:800}}), fresh=await second.newPage();
    await paginate(fresh);await fresh.goto(`http://127.0.0.1:${metadata.webPort}`);await login(fresh);
    await fresh.getByRole('button',{name:`${title} 수정 열기`,exact:true}).waitFor();
    let message='';fresh.on('dialog',async dialog=>{message=dialog.message();await dialog.accept()});
    await fresh.getByRole('button',{name:`${title} 수정 열기`,exact:true}).click();
    await fresh.waitForTimeout(300);
    assert.match(message,/편집 문서를 찾지 못했어요/);
    assert.equal(await fresh.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('dio:member:v1:')&&k.includes(':doc:')).length),0);
    assert.ok(listPages>=2);
    console.log('MEMBER_APP_QA: login, durable retry/replay, server diary/page IDs, PATCH, editor open, guest isolation passed');
    console.log('MEMBER_LIST_QA: cursor pages, fresh-device server discovery, missing document preserved passed');
    assert.deepEqual(errors,[]);
  } catch(e) { console.error(e.message.split('\n')[0]); console.error((e.stack||'').split('\n').filter(line=>line.includes('member-app-browser.cjs')).join('\n')); process.exitCode=1; }
  finally { await browser?.close(); server.close(); }
})();
