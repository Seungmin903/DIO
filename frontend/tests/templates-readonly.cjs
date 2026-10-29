const {chromium}=require('playwright-core');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
fs.mkdirSync(path.join(__dirname,'../.expo/template-test-results'),{recursive:true});
const server=http.createServer((req,res)=>{
 if(req.url.split('?')[0]!=='/') {const request=http.get('http://localhost:54832'+req.url,upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res)});request.on('error',e=>{res.writeHead(502);res.end(e.message)});return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root" style="display:flex;height:100vh"></div><script src="/tests/fixtures/templates.entry.bundle?platform=web&dev=false&minify=false&hot=false&lazy=false"></script></body></html>')
});
(async()=>{
await new Promise(r=>server.listen(54833,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || (process.platform === 'win32' ? path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe') : undefined),headless:true});
try {
 const ctx=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message)});
 await page.goto('http://127.0.0.1:54833');
 await page.waitForFunction(()=>window.__templateValidation,null,{timeout:120000});
 assert.deepEqual(await page.evaluate(()=>window.__templateValidation),{parsed:138});
 await page.locator('[aria-label="다이어리 읽기 캔버스"] svg').waitFor();
 assert.equal(await page.locator('[aria-label="페이지 추가"]').count(),0);
 await page.getByRole('button',{name:'다음 페이지',exact:true}).click();
 await page.getByRole('button',{name:'다음 페이지',exact:true}).click();
 await page.locator('[aria-label="다이어리 읽기 캔버스"] svg[id="2026-monthly-01-landscape"]').waitFor();
 await page.screenshot({path:path.join(__dirname,'../.expo/template-test-results/readonly-monthly.png')});
 assert.equal(await page.getByLabel('공유 및 내보내기',{exact:true}).count(),0);
 assert.equal(await page.getByLabel('되돌리기',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS read-only monthly display without editing or sharing controls, all 138 SVGs parsed.');
 await page.goto('http://127.0.0.1:54833?all');
 await page.waitForFunction(()=>window.__templateValidation,null,{timeout:120000});
 assert.deepEqual(await page.evaluate(()=>window.__templateValidation),{rendered:138});
 assert.deepEqual(errors,[]);
 console.log('PASS all 138 SVGs rendered successfully with the production PageBackground component.');
}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
