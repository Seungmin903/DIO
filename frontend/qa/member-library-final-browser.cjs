// Prerequisites: Spring contract JSON in backend/build/contracts and Expo web export
// to frontend/.expo/member-contract-web with EXPO_PUBLIC_API_BASE_URL set.
// Run: node qa/member-library-final-browser.cjs; DIO_QA_BROWSER_CHANNEL=chromium
// uses Playwright Chromium (install it first); default msedge uses installed Edge.
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../.expo/member-contract-web'), out = path.resolve(__dirname, '.out/member-library-final');
// Use the actual Spring DTO shape. Only the isolated scenario data and HTTP outcomes vary.
const source = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../backend/build/contracts/member-diary-http.json'), 'utf8'));
const trashSource = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../backend/build/contracts/member-diary-trash-http.json'), 'utf8'));
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (file !== root && !file.startsWith(root + path.sep)) return res.writeHead(403).end();
  const target = file === root ? path.join(root, 'index.html') : file;
  fs.readFile(target, (e, data) => { if (e) return res.writeHead(404).end(); res.setHeader('Content-Type', { '.html':'text/html', '.js':'application/javascript', '.png':'image/png', '.svg':'image/svg+xml', '.ttf':'font/ttf' }[path.extname(target)] || 'application/octet-stream'); res.end(data); });
});
(async () => {
  let browser;
  try {
    fs.mkdirSync(out, { recursive:true }); await new Promise(r => server.listen(0, '127.0.0.1', r));
    browser = await chromium.launch({ ...(process.env.DIO_QA_BROWSER_CHANNEL==='chromium'?{}:{channel:process.env.DIO_QA_BROWSER_CHANNEL||'msedge'}), headless:true }); const results = [];
    for (const viewport of [{width:1280,height:800},{width:412,height:892},{width:667,height:375}]) {
      const context = await browser.newContext({ viewport }), p = await context.newPage(), errors = [], queries = [], deletes = new Map();
      p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); p.setDefaultTimeout(20000);
      const rows = Array.from({length:25}, (_,i) => ({ diary:{...source.created.diary,
        diaryId:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,diaryTitle:i===21?'서버 전용 검색':`API 다이어리 ${String(i+1).padStart(2,'0')}`,
        updatedAt:new Date(Date.parse(source.created.diary.updatedAt)-i*1000).toISOString(),
        myMembership:{isFavorite:i===23},...(i===24?{myRole:'EDITOR',canEdit:false}:{}),
        permissions:{...source.created.diary.permissions,canEditMetadata:i!==24,canTrash:i!==24}},pageCount:i+7,shared:i>=23}));
      const removed = new Set(), docKey = `dio:member:v1:101:doc:${rows[0].diary.diaryId}`;
      await context.addInitScript(key => { localStorage.setItem('dio:diary:list:v1','guest-kept');localStorage.setItem('dio:diary:search-history:v1','["guest-history"]');localStorage.setItem(key,'handwriting-kept'); }, docKey);
      await p.route('**/api/v1/**', async route => {
        const req=route.request(),u=new URL(req.url()),send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
        if(u.pathname.endsWith('/auth/login')) return send({accessToken:'qa-access',refreshToken:'qa-refresh',expiresIn:900,user:{userId:'101',email:'qa@dio.test',nickname:'QA'}});
        if(u.pathname.endsWith('/notifications/unread-count')) return send({unreadCount:0,actionableUnreadCount:0});
        if(u.pathname.endsWith('/notifications')) return send({items:[],hasNext:false,nextCursor:null});
        if(u.pathname.endsWith('/member/diaries/trash')) return send({items:[...removed].map(id=>({...trashSource.trash.items[0],diaryId:id,diaryTitle:rows.find(r=>r.diary.diaryId===id).diary.diaryTitle,canRestore:true,canPermanentlyDelete:true})),hasNext:false,nextCursor:null});
        if(u.pathname.endsWith('/member/diaries') && req.method()==='GET') {
          const q=u.searchParams.get('q')||'',sort=u.searchParams.get('sort'),filter=u.searchParams.get('filter'),favorite=u.searchParams.get('favorite')==='true',cursor=u.searchParams.get('cursor'),limit=Number(u.searchParams.get('limit'));
          assert.equal(limit,20); queries.push({q,sort,filter,favorite,cursor});
          let listed=rows.filter(r=>!removed.has(r.diary.diaryId) && r.diary.diaryTitle.includes(q) && (filter!=='shared'||r.shared) && (!favorite||r.diary.myMembership.isFavorite));
          if(sort==='pages') listed=listed.slice().sort((a,b)=>b.pageCount-a.pageCount);
          const start=Number(cursor||0),selected=listed.slice(start,start+limit),hasNext=start+limit<listed.length;
          return send({items:selected,hasNext,nextCursor:hasNext?String(start+limit):null});
        }
        const match=/\/member\/diaries\/([^/]+)$/.exec(u.pathname);
        if(match && req.method()==='GET') return send({...source.created,diary:rows.find(r=>r.diary.diaryId===match[1]).diary});
        if(match && req.method()==='DELETE') {
          assert.equal(req.postData(),null);assert.equal(u.search,'');const id=match[1],n=(deletes.get(id)||0)+1;deletes.set(id,n);
          if(id===rows[1].diary.diaryId && n===1) return send({status:503,code:'DIARY_PERSISTENCE_UNAVAILABLE',detail:'잠시 후 다시 확인해 주세요.'},503);
          if(id===rows[2].diary.diaryId) {rows[2].diary.permissions.canTrash=false;return send({status:403,code:'DIARY_OWNER_REQUIRED',detail:'권한이 변경됐어요.'},403);}
          removed.add(id);return route.fulfill({status:204});
        }
        errors.push(`Unexpected ${req.method()} ${u.pathname}`);return send({status:404,code:'QA_UNEXPECTED',detail:'unexpected'},404);
      });
      const button=name=>p.getByRole('button',{name,exact:true}),tab=name=>p.getByRole('tab',{name,exact:true}).first();
      await p.goto(`http://127.0.0.1:${server.address().port}`);
      await p.getByPlaceholder('이메일을 입력해 주세요').fill('qa@dio.test');await p.getByPlaceholder('비밀번호를 입력해 주세요',{exact:true}).fill('TestOnly123!');await button('로그인').click();
      await button('다음 다이어리 불러오기').waitFor();assert.equal(queries[0].filter,'all');assert.equal(queries[0].sort,'updated');
      await tab('한눈에 보기').click();await button('다음 다이어리 불러오기').click();await p.getByText('서버 전용 검색',{exact:true}).first().waitFor();assert.ok(queries.some(q=>q.cursor==='20'));
      await button('보관함 옵션').click();await p.getByRole('radio',{name:'페이지 많은 순',exact:true}).click();
      await p.waitForFunction(()=>[...document.querySelectorAll('[data-testid^="diary-page-count-"]')][0]?.textContent==='31페이지');
      assert.ok(queries.some(q=>q.sort==='pages'&&!q.cursor));
      await button('다이어리 검색').click();await p.getByRole('textbox',{name:'다이어리 제목 검색'}).fill('서버 전용');await p.getByText('서버 전용 검색',{exact:true}).first().waitFor();
      assert.ok(queries.some(q=>q.q==='서버 전용'&&!q.cursor));
      await p.getByRole('textbox',{name:'다이어리 제목 검색'}).press('Enter');
      await button('검색 닫기').click();await tab('공유 다이어리').click();
      await p.waitForFunction(()=>document.querySelectorAll('[data-testid^="diary-page-count-"]').length===2);assert.ok(queries.some(q=>q.filter==='shared'));
      { const c = await p.getByRole('button', { name: / 열기$/ }).first().boundingBox(); await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await p.mouse.down(); await p.waitForTimeout(900); await p.mouse.up(); }await button('전체 선택').click();
      await button('선택한 1개 휴지통으로 이동').waitFor();assert.equal(await p.getByRole('checkbox',{name:'API 다이어리 25 선택',exact:true}).isDisabled(),true);await button('선택 완료').click();
      // Return from a filtered editor to an all-list first page that excludes this diary.
      const {createDefaultDoc}=await import('../src/editor/state/defaultDoc.js');
      const opened=rows[23].diary,editorDoc={...createDefaultDoc({id:opened.diaryId,title:opened.diaryTitle}),memberAccountId:'101'};
      await p.evaluate(doc=>localStorage.setItem(`dio:member:v1:101:doc:${doc.id}`,JSON.stringify(doc)),editorDoc);
      await button(`${opened.diaryTitle} 열기`).click();await button('다이어리 홈').waitFor();await button('다이어리 홈').click();
      await button('다음 다이어리 불러오기').waitFor();await tab('스와이프 보기').click();
      await p.getByText('1 / 20',{exact:true}).waitFor();
      await tab('한눈에 보기').click();
      await tab('즐겨찾기').click();await p.waitForFunction(()=>document.querySelectorAll('[data-testid^="diary-page-count-"]').length===1);assert.ok(queries.some(q=>q.favorite));
      await tab('모든 다이어리').click();await button('보관함 옵션').click();await p.getByRole('radio',{name:'최근 수정순',exact:true}).click();await button('다음 다이어리 불러오기').waitFor();
      { const c = await p.getByRole('button', { name: / 열기$/ }).first().boundingBox(); await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await p.mouse.down(); await p.waitForTimeout(900); await p.mouse.up(); }await button('불러온 항목 모두 선택').click();
      await button('선택한 20개 휴지통으로 이동').click();await p.getByText('18개 이동 완료 · 2개 확인 필요',{exact:true}).waitFor();
      await button('실패한 항목만 다시 확인').click();await p.getByText('19개 이동 완료 · 1개 확인 필요',{exact:true}).waitFor();
      assert.equal(deletes.get(rows[1].diary.diaryId),2);assert.equal(deletes.get(rows[2].diary.diaryId),1);
      for(let i=0;i<20;i++) if(i!==1) assert.equal(deletes.get(rows[i].diary.diaryId),1);
      assert.equal(removed.size,19);assert.equal(await button('실패한 항목만 다시 확인').count(),0);
      assert.equal(await p.evaluate(k=>localStorage.getItem(k),docKey),'handwriting-kept');assert.equal(await p.evaluate(()=>localStorage.getItem('dio:diary:list:v1')),'guest-kept');
      assert.equal(await p.evaluate(()=>localStorage.getItem('dio:diary:search-history:v1')),'["guest-history"]');
      assert.ok((await p.evaluate(()=>localStorage.getItem('dio:member:v1:101:search-history'))).includes('서버 전용'));assert.deepEqual(errors,[]);
      await p.screenshot({path:path.join(out,`${viewport.width}-partial.png`)});
      results.push({viewport,queryCalls:queries.length,serverSearch:true,serverSort:true,serverFilters:true,nextPage:true,serverReturnPosition:true,partialRetry:true,successNotResent:true,permissionFailureNotRetried:true,accountHistory:true,localDocumentsPreserved:true,pageerrors:errors});
      await context.close();
    }
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
  } finally {await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
