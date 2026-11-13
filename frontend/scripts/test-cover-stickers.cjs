// CI와 로컬이 같은 실제 CoverArt 브라우저 검증을 실행한다.
const { spawn } = require('node:child_process')
const { createWriteStream, mkdirSync } = require('node:fs')
const path = require('node:path')
const { watchProcess, stopProcess, closeProcessLog } = require('./cover-sticker-processes.cjs')
const cwd = path.resolve(__dirname, '..')
const port = Number(process.env.DIO_QA_PORT || 8095)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid DIO_QA_PORT')
const base = `http://127.0.0.1:${port}`
const artifactDir = path.join(cwd, '.expo/cover-sticker-ci')
mkdirSync(artifactDir, { recursive: true })
const log = createWriteStream(path.join(artifactDir, 'metro.log'))
log.on('error', error => { console.error('QA log error:', error.message); process.exitCode=1 })
let metro, browser
let cleanupPromise
function cleanup() {
  return cleanupPromise ??= (async () => {
    try { await stopProcess(browser) } finally { await closeProcessLog(metro, log) }
  })()
}
async function running() {
  try { return (await fetch(`${base}/status`, {signal:AbortSignal.timeout(1000)})).ok } catch { return false }
}
async function main() {
  if (await running()) throw Error(`QA port ${port} is already in use; choose another DIO_QA_PORT`)
  const cli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin/cli')
  metro = watchProcess(spawn(process.execPath, [cli, 'start', '--offline', '--port', String(port), '--max-workers', '2'], {
    cwd, detached:process.platform !== 'win32', windowsHide:true,
    env:{...process.env, CI:'1', EXPO_NO_DOTENV:'1'}, stdio:['ignore','pipe','pipe'],
  }))
  metro.child.stdout.pipe(log, {end:false}); metro.child.stderr.pipe(log, {end:false})
  const deadline = Date.now() + 180000
  while (!(await running())) {
    if (metro.child.exitCode !== null || metro.child.signalCode !== null) throw Error('Metro exited; see .expo/cover-sticker-ci/metro.log')
    if (Date.now() > deadline) throw Error('Metro startup timed out; see .expo/cover-sticker-ci/metro.log')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  browser = watchProcess(spawn(process.execPath, ['tests/cover-sticker-controls-browser.cjs', base], {
    cwd, detached:process.platform !== 'win32', windowsHide:true, stdio:'inherit',
  }))
  const {code, error} = await browser.closed
  if (error) throw error
  if (code !== 0) throw Error(`Cover sticker browser verification failed (${code})`)
}
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => {
  cleanup().catch(console.error).finally(() => process.exit(1))
})
main().catch(error => { console.error(error); process.exitCode=1 })
  .finally(cleanup).catch(error => { console.error(error); process.exitCode=1 })
