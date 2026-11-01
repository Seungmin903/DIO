const { chromium } = require('playwright-core');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const out = path.join(__dirname, '../.expo/decoration-studio-results');
fs.mkdirSync(out, {recursive:true});
const server = http.createServer((req,res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type','text/html');
    res.end('<html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div id="root" style="display:flex;height:100vh"></div><script src="/tests/fixtures/decoration-studio.entry.bundle?platform=web&dev=false&minify=false&lazy=false&hot=false"></script></body></html>');
  } else http.get(`http://127.0.0.1:${process.env.EXPO_QA_PORT || 8081}${req.url}`,upstream=>{
    res.writeHead(upstream.statusCode,upstream.headers); upstream.pipe(res);
  }).on('error',error=>{res.writeHead(502);res.end(error.message)});
});
(async()=>{
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error('PLAYWRIGHT_EXECUTABLE_PATH에 설치된 Chromium 계열 브라우저의 실행 파일 경로를 지정해 주세요. 실행 조건: docs/decoration-studio.md');
  }
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true,executablePath});
    const {STORAGE_KEYS}=await import('../src/editor/utils/storageContract.js');
    for (const [width,height] of [[1280,800],[1024,768],[390,844],[844,390],[320,740]]) {
      const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[];
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(120000);
      page.on('pageerror',error=>errors.push(error.message));
      await context.addInitScript(({key})=>{
        if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify({folders:[{id:'qa-folder',name:'테스트 스티커',items:[{emoji:'🌼'},{emoji:'⭐'}]}]}));
      },{key:STORAGE_KEYS.customDecor});
      const button=name=>page.getByRole('button',{name,exact:true});
      const navigate=name=>page.getByLabel(name,{exact:true});
      async function enter() {
        await button('게스트로 시작하기').click({timeout:120000});
        await navigate('꾸미기 공방').click();
        await button('내 폰트 만들기').waitFor();
      }
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await enter();
      const navBox=await navigate('꾸미기 공방').boundingBox();
      assert.ok(navBox.width>=44 && navBox.height>=44);
      assert.equal(await button('스티커 시트 분리').isDisabled(),true);
      await page.getByText('아직 만든 폰트가 없어요',{exact:true}).waitFor();
      await page.screenshot({path:path.join(out,`studio-${width}.png`)});
      await button('내 폰트 만들기').click();
      await page.getByText('내 손글씨 36자로 만드는 한글 폰트',{exact:true}).waitFor();
      await button('닫기').click();
      await button('내 폰트 만들기').waitFor();
      const cutoutBox=await button('사진 속 대상 오리기').boundingBox();
      await button('사진 속 대상 오리기').click({position:{x:cutoutBox.width/2,y:cutoutBox.height-8}});
      await button('사진 선택').waitFor();
      await button('스티커 만들기 닫기').click();
      await button('테스트 스티커 스티커 폴더').click();
      await button('1번 스티커 삭제').click();
      await button('취소').click();
      assert.equal(await button('2번 스티커 삭제').count(),1);
      await button('1번 스티커 삭제').click();
      await button('삭제').click();
      assert.equal(await button('2번 스티커 삭제').count(),0);
      await button('스티커 폴더 목록').click();
      await page.getByText('1개 스티커',{exact:true}).waitFor();
      await navigate(width<900 && Math.min(width,height)<600 ? '다이어리' : '모든 다이어리').click();
      await navigate('꾸미기 공방').click();
      await page.getByText('1개 스티커',{exact:true}).waitFor();
      await page.reload(); await enter();
      await page.getByText('1개 스티커',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${width}x${height}: actual App navigation/font/cutout/cancel/delete/persistence`);
      await context.close();
    }
  } finally {await browser?.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
