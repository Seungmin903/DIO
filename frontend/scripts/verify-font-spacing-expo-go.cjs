// Isolated, loopback-only development manifest; never changes the user's Metro entrypoint.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const source = path.resolve(process.argv[2]), output = path.resolve(process.argv[3])
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA, 'Android/Sdk')
const adb = path.join(sdk, 'platform-tools/adb.exe'), id = require('node:crypto').randomUUID()
let finish, fail
const result = new Promise((resolve, reject) => { finish = resolve; fail = reject })
const server = http.createServer(async (req, res) => {
  console.log('QA_REQUEST', req.method, req.url.split('?')[0])
  try {
    if (req.url === '/font.ttf') {
      res.setHeader('Content-Type', 'font/ttf'); return fs.createReadStream(source).pipe(res)
    }
    if (req.url === '/report' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) { body += chunk; if (body.length > 16384) throw new Error('Oversized report') }
      const report = JSON.parse(body)
      fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2))
      res.end('ok'); finish(report); return
    }
    const upstream = await fetch('http://127.0.0.1:8082/', { headers: { 'expo-platform': 'android', accept: 'application/expo+json' }, signal: AbortSignal.timeout(15000) })
    const manifest = await upstream.json()
    manifest.id = id; manifest.scopeKey = `@anonymous/dio-font-spacing-qa-${id}`
    manifest.extra.expoClient.slug = 'dio-font-spacing-qa'
    manifest.extra.expoClient.hostUri = '10.0.2.2:8082'
    manifest.extra.expoClient.name = 'Font spacing QA'
    manifest.extra.expoClient.primaryColor = '#FFFFFF'
    manifest.extra.expoClient.extra = { ...manifest.extra.expoClient.extra, eas: { projectId: id } }
    manifest.extra.eas = { projectId: id }
    if (manifest.extra.expoGo) manifest.extra.expoGo.debuggerHost = '10.0.2.2:8082'
    if (manifest.extra.expoGo) manifest.extra.expoGo.mainModuleName = 'tests/fixtures/font-spacing-native.entry'
    manifest.launchAsset.key = `font-spacing-${id}`
    delete manifest.launchAsset.hash
    manifest.launchAsset.url = `http://10.0.2.2:8082/tests/fixtures/font-spacing-native.entry.bundle?platform=android&dev=true&hot=false&lazy=false&qa=${id}`
    res.setHeader('Content-Type', 'application/expo+json'); res.setHeader('expo-protocol-version', '0')
    res.end(JSON.stringify(manifest))
  } catch (error) { res.writeHead(500); res.end(error.message); fail(error) }
})
async function main() {
  await new Promise(resolve => server.listen(54845, '127.0.0.1', resolve))
  const timer = setTimeout(() => fail(new Error('Expo Go fixture timed out')), 180000)
  try {
    spawnSync(adb, ['-s', 'emulator-5554', 'shell', 'am', 'force-stop', 'host.exp.exponent'])
    const launch = spawnSync(adb, ['-s', 'emulator-5554', 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `exp://10.0.2.2:54845/?qa=${id}`, '-p', 'host.exp.exponent'], { encoding: 'utf8' })
    if (launch.status !== 0) throw new Error(launch.stderr || launch.stdout)
    console.log('QA_LAUNCHED', launch.stdout.trim())
    const report = await result
    assert.equal(report.status, 'passed', report.error)
    // Verify the actual installed host package, not the deprecated environment
    // constant (which can report "bare" for a custom development manifest).
    assert.equal(report.nativeApplicationId, 'host.exp.exponent')
    assert.equal(report.nativeGeneratorAvailable, false)
    assert.equal(report.fontsLoaded, 2); assert(report.distinctIds && report.sourceFontLinked)
    assert.equal(report.spacingVersion, 'ink-bounds-v1')
    assert(report.widths.corrected < report.widths.original * .8)
    console.log(JSON.stringify(report))
  } finally { clearTimeout(timer); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1; server.close() })
