// CI와 로컬이 같은 실제 CoverArt 브라우저 검증을 실행한다.
const { spawn, spawnSync } = require('node:child_process')
const { createWriteStream, mkdirSync } = require('node:fs')
const path = require('node:path')
const { once } = require('node:events')
const cwd = path.resolve(__dirname, '..')
const port = Number(process.env.DIO_QA_PORT || 8095)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid DIO_QA_PORT')
const base = `http://127.0.0.1:${port}`
const artifactDir = path.join(cwd, '.expo/cover-sticker-ci')
mkdirSync(artifactDir, { recursive: true })
const log = createWriteStream(path.join(artifactDir, 'metro.log'))
let metro, browser
async function running() {
  try { return (await fetch(`${base}/status`, {signal:AbortSignal.timeout(1000)})).ok } catch { return false }
}
function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true, stdio:'ignore'})
  else { try { process.kill(-child.pid, 'SIGTERM') } catch {} }
}
async function main() {
  if (await running()) throw Error(`QA port ${port} is already in use; choose another DIO_QA_PORT`)
  const cli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin/cli')
  metro = spawn(process.execPath, [cli, 'start', '--offline', '--port', String(port), '--max-workers', '2'], {
    cwd, detached:process.platform !== 'win32', windowsHide:true,
    env:{...process.env, CI:'1', EXPO_NO_DOTENV:'1'}, stdio:['ignore','pipe','pipe'],
  })
  metro.stdout.pipe(log, {end:false}); metro.stderr.pipe(log, {end:false})
  const deadline = Date.now() + 180000
  while (!(await running())) {
    if (metro.exitCode !== null || metro.signalCode !== null) throw Error('Metro exited; see .expo/cover-sticker-ci/metro.log')
    if (Date.now() > deadline) throw Error('Metro startup timed out; see .expo/cover-sticker-ci/metro.log')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  browser = spawn(process.execPath, ['tests/cover-sticker-controls-browser.cjs', base], {
    cwd, detached:process.platform !== 'win32', windowsHide:true, stdio:'inherit',
  })
  const [code] = await once(browser, 'exit')
  if (code !== 0) throw Error(`Cover sticker browser verification failed (${code})`)
}
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { stop(browser); stop(metro); log.end(); process.exit(1) })
main().catch(error => { console.error(error); process.exitCode=1 }).finally(() => { stop(browser); stop(metro); log.end() })
