const { chromium } = require('playwright-core')
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const source = ['files.web.js', 'workflowPersistence.js'].map(file => fs.readFileSync(path.join(__dirname, '../src/handwriting', file), 'utf8').replace(/^export /gm, '')).join('\n')
const script = source + `
window.workflowTestStore = createWorkflowPersistence({
  storage: {getItem: async key => localStorage.getItem(key), setItem: async (key,text) => { if(text.length>1024) throw Error('large AsyncStorage value'); localStorage.setItem(key,text) }},
  blobs: workflowBlobs, uuid: () => crypto.randomUUID()
});`
const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Workflow storage regression</title>') })
;(async () => {
  await new Promise(resolve => server.listen(54842, '127.0.0.1', resolve))
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined), headless: true })
  try {
    const context = await browser.newContext(), page = await context.newPage()
    await page.addInitScript({ content: script })
    await page.goto('http://127.0.0.1:54842')
    const result = await page.evaluate(async () => {
      const text = '한글'.repeat(700000), preview = 'data:image/png;base64,' + 'a'.repeat(200000)
      const entries = [0,1].map(i => ({id:`font-${i}`,status:'draft',draft:{samples:{값:text}},preview:{안:preview}}))
      await window.workflowTestStore.save(entries)
      const pointer = localStorage.getItem('dio-handwriting-workflow-v3')
      return {size:new TextEncoder().encode(JSON.stringify(entries)).length,pointerBytes:pointer.length}
    })
    assert(result.size > 6 * 1024 * 1024); assert(result.pointerBytes < 150)
    await page.reload()
    const restored = await page.evaluate(async () => {
      const entries = await window.workflowTestStore.load()
      entries[0].status = 'paused'; await window.workflowTestStore.save(entries)
      const request = indexedDB.open('dio-handwriting-workflow', 1)
      const db = await new Promise(resolve => {request.onsuccess=()=>resolve(request.result)})
      const count = await new Promise(resolve => {const tx=db.transaction('records'),r=tx.objectStore('records').count();r.onsuccess=()=>resolve(r.result)})
      db.close()
      return {entries:entries.length,characters:entries[0].draft.samples.값.length,preview:entries[1].preview.안.length,records:count}
    })
    assert.deepEqual(restored,{entries:2,characters:1400000,preview:200022,records:3})
    console.log('PASS real IndexedDB: >6MB write, small AsyncStorage pointer, reload, metadata update, obsolete index cleanup', JSON.stringify(result))
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})().catch(error => { console.error(error); process.exitCode = 1 })
