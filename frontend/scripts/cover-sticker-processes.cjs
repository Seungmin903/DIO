const { spawnSync } = require('node:child_process')
const { finished } = require('node:stream/promises')

function watchProcess(child) {
  let error
  child.once('error', value => { error = value })
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({code, signal, error})))
  return {child, closed}
}

async function within(promise, milliseconds) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('QA process did not close')), milliseconds)
    })])
  } finally { clearTimeout(timer) }
}

async function stopProcess(processInfo) {
  if (!processInfo) return
  const {child, closed} = processInfo
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true, stdio:'ignore'})
    else { try { process.kill(-child.pid, 'SIGTERM') } catch {} }
  }
  try { await within(closed, 10000) } catch {
    if (process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
    await within(closed, 5000)
  }
}

async function closeProcessLog(processInfo, log) {
  try { await stopProcess(processInfo) } finally {
    processInfo?.child.stdout?.unpipe(log)
    processInfo?.child.stderr?.unpipe(log)
    // close는 stdout/stderr까지 닫힌 뒤 발생한다. 마지막 출력을 받은 뒤 파일을 닫는다.
    const done = finished(log)
    log.end()
    await done
  }
}

module.exports = {watchProcess, stopProcess, closeProcessLog}
