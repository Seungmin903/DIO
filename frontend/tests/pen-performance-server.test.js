import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
test('성능 QA는 로그 토큰과 제한된 Metro 경로만 허용한다', { timeout: 10000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-feedback-test-'))
  const reportLog = path.join(directory, 'reports.ndjson')
  const child = spawn(process.execPath, [fileURLToPath(new URL('../qa/pen-performance-server.cjs', import.meta.url))], {
    env: { ...process.env, DIO_QA_HOST: '127.0.0.1', DIO_QA_PORT: '0', DIO_QA_METRO_PORT: '1', DIO_QA_REPORT_LOG: reportLog }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  const exited = new Promise(resolve => child.once('exit', resolve))
  try {
    const port = await new Promise((resolve, reject) => {
      let output = ''
      child.once('error', reject)
      child.stdout.on('data', data => { output += data; const m = output.match(/127\.0\.0\.1:(\d+)/); if (m) resolve(Number(m[1])) })
    })
    const base = 'http://127.0.0.1:' + port
    const html = await (await fetch(base)).text()
    const storageHtml = await (await fetch(base + '/?qa=storage-integration')).text()
    assert.ok(storageHtml.includes('/qa/storage-integration.entry.bundle'))
    assert.ok((await (await fetch(base + '/?qa=large-integration')).text()).includes('/qa/large-integration.entry.bundle'))
    const token = html.match(/X-DIO-QA-Token':'([a-f0-9]+)'/)[1]
    assert.equal((await fetch(base + '/perf-reports')).status, 403)
    assert.equal((await fetch(base + '/perf-report', { method: 'POST', body: '{}' })).status, 403)
    assert.equal((await fetch(base + '/perf-report', { method: 'POST', headers: { 'X-DIO-QA-Token': 'wrong' }, body: '{}' })).status, 403)
    assert.deepEqual(await (await fetch(base + '/perf-reports', { headers: { 'X-DIO-QA-Token': token } })).json(), [])
    assert.equal((await fetch(base + '/perf-report', { method: 'POST', headers: { 'X-DIO-QA-Token': token }, body: '{' })).status, 400)
    for (const path of ['/status', '/symbolicate', '/index.bundle', '/assets/%2e%2e%5cstatus']) assert.equal((await fetch(base + path)).status, 404, path)
    assert.equal((await fetch(base + '/qa/pen-performance.entry.bundle')).status, 502)
    assert.equal((await fetch(base + '/qa/storage-integration.entry.bundle')).status, 502)
    assert.equal((await fetch(base + '/qa/large-integration.entry.bundle')).status, 502)
    assert.equal((await fetch(base + '/assets/image.png')).status, 502)
    const send = () => fetch(base + '/perf-report', { method: 'POST', headers: { 'X-DIO-QA-Token': token }, body: JSON.stringify({type:'feedback', recordId:'test',value:'slow'}) })
    const saved = await send()
    assert.equal(saved.status,204);assert.equal(saved.headers.get('X-DIO-QA-Saved'),'1')
    assert.equal(JSON.parse(fs.readFileSync(reportLog,'utf8').trim()).recordId,'test')
    fs.unlinkSync(reportLog);fs.mkdirSync(reportLog)
    const failed=await send();assert.equal(failed.status,500);assert.equal(failed.headers.get('X-DIO-QA-Saved'),null)
  } finally { child.kill(); await exited; if (fs.existsSync(reportLog)) { if (fs.statSync(reportLog).isDirectory()) fs.rmdirSync(reportLog); else fs.unlinkSync(reportLog) }; fs.rmdirSync(directory) }
})
