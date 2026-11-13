import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const { watchProcess, closeProcessLog } = createRequire(import.meta.url)('../scripts/cover-sticker-processes.cjs')

function collector() {
  const chunks = [], errors = []
  const log = new Writable({write(chunk, _encoding, next) { chunks.push(chunk.toString()); next() }})
  log.on('error', error => errors.push(error))
  return {log, chunks, errors}
}

test('exit 뒤 close 전의 마지막 stdout/stderr를 모두 받은 뒤 로그를 닫는다', async () => {
  const child = Object.assign(new EventEmitter(), {exitCode:0, signalCode:null, stdout:new PassThrough(), stderr:new PassThrough()})
  const info = watchProcess(child), {log, chunks, errors} = collector()
  child.stdout.pipe(log, {end:false}); child.stderr.pipe(log, {end:false})
  let done = false
  const cleanup = closeProcessLog(info, log).then(() => { done = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(done, false)
  assert.equal(log.writableEnded, false)
  child.stdout.write('last output\n'); child.stderr.write('last error\n')
  child.stdout.end(); child.stderr.end(); child.emit('close', 0, null)
  await cleanup
  assert.equal(chunks.join(''), 'last output\nlast error\n')
  assert.equal(log.writableFinished, true)
  assert.deepEqual(errors, [])
})

test('실제 프로세스의 종료 직전 로그를 보존하며 정리를 마친다', async () => {
  const child = spawn(process.execPath, ['-e', "process.stdout.write('out');process.stderr.write('err')"], {stdio:['ignore','pipe','pipe'], windowsHide:true})
  const info = watchProcess(child), {log, chunks, errors} = collector()
  child.stdout.pipe(log, {end:false}); child.stderr.pipe(log, {end:false})
  const result = await info.closed
  assert.equal(result.code, 0)
  await closeProcessLog(info, log)
  assert.ok(chunks.join('').includes('out')); assert.ok(chunks.join('').includes('err'))
  assert.deepEqual(errors, [])
})
