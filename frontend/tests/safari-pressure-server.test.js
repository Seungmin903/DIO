import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { get } from 'node:http'
import { fileURLToPath } from 'node:url'

test('잘못된 인코딩 요청 뒤에도 QA 서버와 수집된 보고를 유지한다', { timeout: 10000 }, async () => {
  const token = randomUUID()
  const child = spawn(process.execPath, [fileURLToPath(new URL('../qa/safari-pressure-server.cjs', import.meta.url))], {
    env: { ...process.env, DIO_QA_HOST: '127.0.0.1', DIO_QA_PORT: '0', DIO_QA_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  const exited = new Promise(resolve => child.once('exit', resolve))
  try {
    const port = await new Promise((resolve, reject) => {
      let output = ''
      child.once('error', reject)
      child.once('exit', code => reject(new Error('QA server exited: ' + code)))
      child.stdout.on('data', data => {
        output += data
        const match = output.match(/127\.0\.0\.1:(\d+)/)
        if (match) resolve(Number(match[1]))
      })
    })
    const base = 'http://127.0.0.1:' + port
    assert.equal((await fetch(base + '/qa-reports')).status, 403)
    assert.equal((await fetch(base + '/qa-report', { method: 'POST', body: '{}' })).status, 403)
    const headers = { 'X-DIO-QA-Token': token }
    await fetch(base + '/qa-report', { method: 'POST', headers, body: JSON.stringify({ type: 'test', samples: 2 }) })
    for (const path of ['/%', '/%00', '/%00/report', '/%0a']) {
      const status = await new Promise((resolve, reject) => {
        get({ host: '127.0.0.1', port, path }, res => { res.resume(); resolve(res.statusCode) }).on('error', reject)
      })
      assert.equal(status, 400, path)
    }
    const response = await fetch(base + '/qa-reports', { headers })
    assert.equal(response.status, 200)
    const reports = await response.json()
    assert.equal(reports.length, 1)
    assert.equal(reports[0].samples, 2)
    assert.equal(child.exitCode, null)
  } finally { child.kill(); await exited }
})
