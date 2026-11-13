const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
 const server = await chromium.launchServer({channel:process.env.DIO_QA_BROWSER_CHANNEL || undefined,headless:true})
 try {
 const browser = await chromium.connect(server.wsEndpoint())
 for (const width of [430,1100]) for (const failure of [false,true]) {
 const page = await browser.newPage({viewport:{width,height:800}})
 page.on('pageerror', error=>console.error('PAGE:',error.message))
 await page.route('**/rename-qa*', route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body,#root{height:100%;margin:0}</style><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/tests/fixtures/diary-rename.entry.bundle?platform=web&dev=true&hot=false"></script>'}))
 await page.goto('http://localhost:8095/rename-qa'+(failure?'?fail':''))
 await page.getByRole('button',{name:'다이어리 이름 바꾸기'}).click({timeout:120000})
 const input = page.getByRole('textbox',{name:'다이어리 이름'})
 await input.fill('새 이름'); await input.press('Enter'); await page.mouse.click(10,200)
 await page.waitForTimeout(300)
 assert.equal(await page.getByTestId('calls').textContent(),'1')
 assert.equal(await page.getByTestId('saved').textContent(),failure?'기존 이름':'새 이름')
 const notice = await page.getByTestId('notice').textContent()
 assert.equal(notice,failure?'이름을 바꾸지 못했어요: 저장 실패':'')
 console.log(`PASS ${width}px ${failure?'failure notice':'successful rename'} once`)
 await page.close()
 }
 } finally { await server.kill() }
})().catch(error=>{console.error(error);process.exitCode=1})



