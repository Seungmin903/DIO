import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { REMOTE_ASSET_MANIFEST } from '../src/shared/remoteAssets/manifest.js'
import { assetBaseUrl, isRemoteAsset, remoteAsset, remoteAssetUrl, RemoteAssetError } from '../src/shared/remoteAssets/remoteAssets.js'
import { fetchRemoteAsset } from '../src/shared/remoteAssets/remoteAssetFile.web.js'
import * as text from '../src/editor/utils/text.js'
import * as planners from '../src/editor/templates/planners.js'
import * as remoteAssets from '../src/shared/remoteAssets/remoteAssets.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))

test('매니페스트는 assets/ 의 현재 파일과 같고(크기·해시) 객체 키에 해시가 들어 있다', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/build-remote-assets.mjs', import.meta.url)), '--check'], { stdio: 'pipe' })
  const entries = Object.entries(REMOTE_ASSET_MANIFEST)
  assert.equal(entries.length, 267) // 글꼴 5 + 2026 속지 262
  for (const [path, entry] of entries.filter(([path]) => path.startsWith('fonts/'))) {
    const data = readFileSync(new URL('../assets/' + path, import.meta.url))
    assert.equal(entry.size, data.length, path)
    assert.equal(entry.sha256, createHash('sha256').update(data).digest('hex'), path)
  }
  for (const [path, entry] of entries) {
    assert.ok(entry.key.includes('.' + entry.sha256.slice(0, 16) + '.'), path)
    assert.ok(!path.includes('2026-reusable-') && !path.includes('pretendard'), '기본 에셋은 번들에 남긴다: ' + path)
  }
})

test('remoteAsset 은 매니페스트에 없는 파일을 거부하고 주소를 만든다', () => {
  const asset = remoteAsset('fonts/maruburi/MaruBuri-Regular.ttf')
  assert.ok(isRemoteAsset(asset))
  assert.equal(isRemoteAsset(1), false)
  assert.throws(() => remoteAsset('fonts/maruburi/없음.ttf'), /매니페스트에 없는/)
  assert.equal(remoteAssetUrl(asset, 'https://cdn.example.com/static-assets'), 'https://cdn.example.com/static-assets/' + asset.key)
  assert.throws(() => remoteAssetUrl(asset, null), RemoteAssetError)
})

test('에셋 주소: 출시 빌드는 HTTPS 만, 개발은 비어 있으면 로컬 서버(에뮬레이터 10.0.2.2)', () => {
  assert.equal(assetBaseUrl({ configured: 'https://cdn.example.com/static-assets/', dev: false }), 'https://cdn.example.com/static-assets')
  assert.equal(assetBaseUrl({ configured: 'http://cdn.example.com', dev: false }), null)
  assert.equal(assetBaseUrl({ configured: '', dev: false }), null)
  assert.equal(assetBaseUrl({ configured: 'http://192.168.0.10:8090', dev: true }), 'http://192.168.0.10:8090')
  assert.equal(assetBaseUrl({ configured: undefined, dev: true, os: 'android' }), 'http://10.0.2.2:8090')
  assert.equal(assetBaseUrl({ configured: undefined, dev: true, os: 'web', hostname: 'localhost' }), 'http://localhost:8090')
})

test('웹은 원격 에셋을 CloudFront 주소로 바로 쓴다', async t => {
  const previous = process.env.EXPO_PUBLIC_ASSET_BASE_URL
  process.env.EXPO_PUBLIC_ASSET_BASE_URL = 'https://cdn.example.com/static-assets'
  t.after(() => { if (previous === undefined) delete process.env.EXPO_PUBLIC_ASSET_BASE_URL; else process.env.EXPO_PUBLIC_ASSET_BASE_URL = previous })
  const asset = remoteAsset('templates/2026/SVG/2026-cover-portrait.svg')
  assert.equal(await fetchRemoteAsset(asset), 'https://cdn.example.com/static-assets/' + asset.key)
})

test('원격 글꼴을 받지 못하면 기본 글꼴로 두고, 잠시 뒤 다음 요청에서 다시 받는다', async t => {
  const downloads = []
  let online = false
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/textFonts.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'expo-font') return { loadAsync: async () => {} }
    if (id === '../utils/text') return text
    if (id === '../templates/planners.js') return planners
    if (id === '../../handwriting/library.js') return { refreshPersonalFonts: async () => [] }
    if (id === '../../shared/remoteAssets/remoteAssets.js') return remoteAssets
    if (id === '../../shared/remoteAssets/remoteAssetFile') return { fetchRemoteAsset: async asset => {
      downloads.push(asset.path)
      if (!online) throw new RemoteAssetError('offline')
      return 'file:///remote/' + asset.path
    } }
    if (/\.(ttf|otf)$/.test(id)) return id
    return require(id)
  }, module, module.exports)
  mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => mock.timers.reset())

  await module.exports.ensureTextFonts(['gowun-dodum'])
  assert.deepEqual(downloads, ['fonts/gowundodum/GowunDodum-Regular.ttf'])
  assert.match(text.textFontSnapshot('gowun-dodum'), /GowunDodum:error/)
  await module.exports.ensureTextFonts(['gowun-dodum']) // 대기 시간 안에는 다시 받지 않는다(렌더마다 요청이 와도)
  assert.equal(downloads.length, 1)

  online = true
  mock.timers.tick(module.exports.REMOTE_RETRY_MS)
  await module.exports.ensureTextFonts(['gowun-dodum'])
  assert.equal(downloads.length, 2)
  assert.doesNotMatch(text.textFontSnapshot('gowun-dodum'), /GowunDodum:error/)

  // 내보내기: 원격 글꼴을 못 받으면 한 번 바로 다시 받고, 그래도 못 받으면 기본 글꼴로 조용히 내보내지 않고 알린다
  online = false
  const before = downloads.length
  const snapshot = { objects: [{ type: 'text', text: '가', font: 'maruburi', bold: false }], template: null }
  await assert.rejects(module.exports.ensureExportFonts(snapshot), /글꼴을 받지 못했어요/)
  assert.equal(downloads.length - before, 2) // 첫 시도 + 바로 다시 받기
  online = true
  await module.exports.ensureExportFonts(snapshot) // 연결되면 대기 시간 없이 바로 성공한다
  assert.equal(downloads.length - before, 3)
  await module.exports.ensureExportFonts({ objects: [], template: null }) // 번들 글꼴만 쓰면 통과
})
