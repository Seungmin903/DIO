import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as text from '../src/editor/utils/text.js'
import * as planners from '../src/editor/templates/planners.js'
import * as remoteAssets from '../src/shared/remoteAssets/remoteAssets.js'
import { RemoteAssetError } from '../src/shared/remoteAssets/remoteAssets.js'

// 글꼴 고르기 목록의 받기 상태(받기 전 → 받는 중 → 받음, 실패 → 다시 받기)와 진행률을 실제 textFonts.js 로 확인한다.
// 원격 파일 받기는 대역으로 두고, 테스트가 받기를 끝내거나(res) 실패시킨다(rej)
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const saved = new Set(), failing = new Set(), progress = new Map(), progressListeners = new Set(), downloads = [], gates = new Map()
const remoteFile = {
  fetchRemoteAsset: asset => {
    downloads.push(asset.path)
    if (failing.has(asset.key)) return Promise.reject(new RemoteAssetError('cache gone, offline'))
    if (saved.has(asset.key)) return Promise.resolve('file:///' + asset.path)
    return new Promise((resolve, reject) => gates.set(asset.path, {
      res: () => { saved.add(asset.key); resolve('file:///' + asset.path) },
      rej: () => reject(new RemoteAssetError('offline')),
    }))
  },
  isRemoteAssetSaved: asset => saved.has(asset.key),
  markRemoteAssetSaved: () => {},
  forgetRemoteAssetSaved: asset => saved.delete(asset.key),
  remoteAssetProgress: asset => progress.get(asset.key),
  subscribeRemoteAssetProgress: listener => { progressListeners.add(listener); return () => progressListeners.delete(listener) },
}
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/textFonts.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
new Function('require', 'module', 'exports', code)(id => {
  if (id === 'expo-font') return { loadAsync: async () => {} }
  if (id === '../utils/text') return text
  if (id === '../templates/planners.js') return planners
  if (id === '../../handwriting/library.js') return { refreshPersonalFonts: async () => [] }
  if (id === '../../shared/remoteAssets/remoteAssets.js') return remoteAssets
  if (id === '../../shared/remoteAssets/remoteAssetFile') return remoteFile
  if (/\.(ttf|otf)$/.test(id)) return id
  return require(id)
}, { exports: {} }, {})

const flush = () => new Promise(resolve => setImmediate(resolve))
const fileOf = path => remoteAssets.remoteAsset(path)
const DODUM = 'fonts/gowundodum/GowunDodum-Regular.ttf'
const BATANG = 'fonts/gowunbatang/GowunBatang-Regular.ttf', BATANG_BOLD = 'fonts/gowunbatang/GowunBatang-Bold.ttf'
const MARU = 'fonts/maruburi/MaruBuri-Regular.ttf', MARU_BOLD = 'fonts/maruburi/MaruBuri-Bold.ttf'

test('받지 않은 원격 글꼴은 목록 미리보기가 받지 않고 기본 글꼴로 보이며, 받기를 누르면 받는 중(진행률) → 받음으로 바뀐다', async () => {
  assert.equal(text.textFontStatus('gowun-dodum'), 'download')
  assert.equal(text.textFontPreviewFamily('gowun-dodum', 'android'), 'sans-serif')
  assert.equal(text.textFontPreviewFamily('gowun-dodum', 'ios'), 'System')
  assert.equal(downloads.length, 0, '목록을 그리기만 해서는 원격 글꼴을 받지 않는다')
  assert.equal(text.textFontProgress('gowun-dodum'), null, '받기 전에는 진행률이 없다')

  const job = text.downloadTextFont('gowun-dodum')
  assert.deepEqual(downloads, [DODUM])
  assert.equal(text.textFontStatus('gowun-dodum'), 'downloading')
  assert.equal(text.textFontProgress('gowun-dodum'), null, '진행률을 아직 모르면(웹 · 첫 알림 전) null')
  await flush() // 받기 시작 알림을 먼저 비운다
  const stateListener = mock.fn(), progressListener = mock.fn()
  const stopState = text.subscribeTextFonts(stateListener), stopProgress = text.subscribeTextFontProgress(progressListener)
  progress.set(fileOf(DODUM).key, fileOf(DODUM).size / 2)
  progressListeners.forEach(notify => notify())
  await flush()
  assert.equal(text.textFontProgress('gowun-dodum'), 0.5)
  assert.equal(progressListener.mock.callCount(), 1, '진행이 바뀌면 진행 막대만 다시 그린다')
  assert.equal(stateListener.mock.callCount(), 0, '진행마다 글꼴 상태 구독자(캔버스 글자 · 목록 전체)를 깨우지 않는다')
  stopState(); stopProgress()

  progress.delete(fileOf(DODUM).key)
  gates.get(DODUM).res()
  assert.equal(text.textFontStatus('gowun-dodum'), 'downloading')
  assert.equal(text.textFontProgress('gowun-dodum'), 1, '다 받아 저장한 뒤 등록이 끝날 때까지 막대는 꽉 찬 채로 남는다(도는 표시로 바뀌지 않는다)')
  await job
  assert.equal(text.textFontStatus('gowun-dodum'), 'ready')
  assert.equal(text.textFontPreviewFamily('gowun-dodum', 'android'), 'GowunDodum', '받은 뒤에는 그 글꼴로 보인다')
})

test('받지 못한 원격 글꼴은 받지 못함으로 보이고, 다시 누르면 대기 시간 없이 본 서체 · 굵은 서체를 다시 받는다', async t => {
  mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => mock.timers.reset())
  const before = downloads.length
  const first = text.downloadTextFont('gowun-batang')
  assert.deepEqual(downloads.slice(before), [BATANG, BATANG_BOLD], '굵은 서체도 함께 받는다')
  gates.get(BATANG).rej(); gates.get(BATANG_BOLD).rej()
  await first
  assert.equal(text.textFontStatus('gowun-batang'), 'error')
  assert.equal(text.textFontPreviewFamily('gowun-batang', 'android'), 'sans-serif')

  const again = text.downloadTextFont('gowun-batang') // REMOTE_RETRY_MS 가 지나지 않았어도 바로 다시 받는다
  assert.deepEqual(downloads.slice(before + 2), [BATANG, BATANG_BOLD])
  assert.equal(text.textFontStatus('gowun-batang'), 'downloading', '다시 받는 중에는 받지 못함 대신 받는 중')
  // 진행률은 본 서체 + 굵은 서체 바이트를 더해 계산한다
  progress.set(fileOf(BATANG).key, fileOf(BATANG).size); progress.set(fileOf(BATANG_BOLD).key, 0)
  assert.equal(text.textFontProgress('gowun-batang'), fileOf(BATANG).size / (fileOf(BATANG).size + fileOf(BATANG_BOLD).size))
  progress.clear()
  gates.get(BATANG).res(); gates.get(BATANG_BOLD).res()
  await again
  assert.equal(text.textFontStatus('gowun-batang'), 'ready')
})

test('이미 기기에 받아 둔 원격 글꼴은 받기 표시 없이 미리보기가 바로 불러온다', async () => {
  saved.add(fileOf(MARU).key); saved.add(fileOf(MARU_BOLD).key)
  assert.equal(text.textFontStatus('maruburi'), 'loading', '받아 둔 글꼴은 받기(download)가 아니라 불러오는 중')
  text.textFontPreviewFamily('maruburi', 'android') // 미리보기가 기기 파일을 불러오기 시작한다
  assert.ok(downloads.includes(MARU))
  await flush(); await flush()
  assert.equal(text.textFontStatus('maruburi'), 'ready')
})

test('앱에 든 글꼴은 받기 표시가 없고, 불러오기에 실패해도 받지 못함(다시 받기)으로 보이지 않는다', () => {
  assert.notEqual(text.textFontStatus('poor-story'), 'download')
  text.markTextFontFailed('PoorStory')
  assert.equal(text.textFontStatus('poor-story'), 'ready')
  assert.equal(text.textFontStatus('personal-00000000-0000-0000-0000-000000000000'), 'ready', '목록에 없는 글꼴은 받을 것이 없다')
})

test('받은 것으로 기억했지만 불러오지 못한 원격 글꼴(웹 캐시가 지워진 채 오프라인 등)은 기억을 지워 다음부터 받기 표시를 보인다', async () => {
  const file = { remote: true, path: 'fonts/test/Test.ttf', key: 'fonts/test/Test.0123.ttf', size: 10, sha256: '0'.repeat(64) }
  text.registerCatalogTextFonts([{ id: 'remote-test', label: '테스트', family: 'DIOR_test', remote: true, files: { DIOR_test: file } }])
  saved.add(file.key); failing.add(file.key)
  assert.equal(text.textFontStatus('remote-test'), 'loading', '받은 것으로 기억한 글꼴은 받기 표시 없이 불러온다')
  text.textFontPreviewFamily('remote-test', 'android')
  await flush(); await flush()
  assert.equal(saved.has(file.key), false, '불러오지 못하면 받은 것으로 기억한 표시를 지운다')
  assert.equal(text.textFontStatus('remote-test'), 'error')
  const before = downloads.length
  assert.equal(text.textFontPreviewFamily('remote-test', 'android'), 'sans-serif')
  assert.equal(downloads.length, before, '받지 못한 글꼴은 목록이 다시 받지 않는다(받기 버튼으로만)')
})

test('본 서체는 받았는데 굵은 서체를 받지 못하면 받지 못함으로 보이고, 다시 받기는 굵은 서체만 다시 받는다', async () => {
  const regular = { remote: true, path: 'fonts/test/Bold-Regular.ttf', key: 'fonts/test/Bold-Regular.1.ttf', size: 10, sha256: '1'.repeat(64) }
  const boldFile = { remote: true, path: 'fonts/test/Bold-Bold.ttf', key: 'fonts/test/Bold-Bold.1.ttf', size: 10, sha256: '2'.repeat(64) }
  text.registerCatalogTextFonts([{ id: 'remote-bold', label: '굵게 시험', family: 'DIOR_bold', boldFamily: 'DIOR_bold_Bold', remote: true, files: { DIOR_bold: regular, DIOR_bold_Bold: boldFile } }])
  const before = downloads.length
  const first = text.downloadTextFont('remote-bold')
  assert.deepEqual(downloads.slice(before), [regular.path, boldFile.path])
  gates.get(regular.path).res()
  await flush(); await flush()
  assert.equal(text.textFontStatus('remote-bold'), 'downloading', '굵은 서체를 받는 동안은 받는 중')
  gates.get(boldFile.path).rej()
  await first
  assert.equal(text.textFontStatus('remote-bold'), 'error', '굵은 서체를 받지 못하면 받지 못함')

  const again = text.downloadTextFont('remote-bold')
  assert.deepEqual(downloads.slice(before + 2), [boldFile.path], '받은 본 서체는 다시 받지 않는다')
  gates.get(boldFile.path).res()
  await again
  assert.equal(text.textFontStatus('remote-bold'), 'ready')
})
