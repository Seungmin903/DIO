import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isGifUri, svgStillKey } from '../src/editor/utils/svgImageSource.js'
import * as svgImageSource from '../src/editor/utils/svgImageSource.js'
import { createStillCache, shortKey } from '../src/editor/utils/svgStillCache.js'
import * as svgStillCache from '../src/editor/utils/svgStillCache.js'
import * as mediaReferences from '../src/editor/utils/mediaReferences.js'

// Android 의 react-native-svg <Image> 는 움직이는 GIF 를 받으면 비트맵이 null 이라 앱이 죽는다.
// 그래서 SVG 이미지로 그리는 곳(사진 테이프 · 모양 틀 사진)은 기기에서 GIF 대신 첫 장면 PNG 를 넘긴다.

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

test('보관소 참조가 없는 예전 주소도 GIF 인지 알아본다', () => {
  assert.equal(isGifUri('data:image/gif;base64,R0lGODlh'), true)
  assert.equal(isGifUri('file:///cache/sticker.GIF'), true)
  assert.equal(isGifUri('https://cdn.example/a.gif?v=2'), true)
  assert.equal(isGifUri('data:image/png;base64,iVBOR'), false)
  assert.equal(isGifUri('file:///cache/gif-folder/photo.png'), false)
  assert.equal(isGifUri(null), false)
})

test('기기에서 SVG 이미지로 그리는 GIF 만 첫 장면으로 바꾼다', () => {
  const base = { platform: 'android', enabled: true, uri: 'file:///media/m1.gif', id: 'm1', extension: 'gif' }
  assert.equal(svgStillKey(base), 'media:m1')
  assert.equal(svgStillKey({ ...base, platform: 'ios' }), 'media:m1')
  assert.equal(svgStillKey({ ...base, platform: 'web' }), null) // 브라우저는 GIF 를 잘 그린다
  assert.equal(svgStillKey({ ...base, enabled: false }), null) // SVG 로 그리지 않는 곳은 변환하지 않는다
  assert.equal(svgStillKey({ ...base, uri: null }), null) // 아직 주소가 없다
  assert.equal(svgStillKey({ ...base, uri: 'file:///media/m1.png', extension: 'png' }), null)
  assert.equal(svgStillKey({ ...base, extension: undefined }), 'media:m1') // 확장자 정보가 없으면 주소로 본다
  // 예전 data URI 는 그대로 키로 쓰지 않고 줄인다
  const dataUri = `data:image/gif;base64,${'A'.repeat(100000)}`
  const legacy = svgStillKey({ platform: 'android', enabled: true, uri: dataUri })
  assert.match(legacy, /^legacy:/)
  assert.ok(legacy.length < 40)
  assert.equal(legacy, `legacy:${shortKey(dataUri)}`)
  assert.notEqual(shortKey(dataUri), shortKey(`${dataUri}B`))
})

test('같은 GIF 는 한 번만 만들고, 만들어지면 새 스냅샷으로 알린다', async () => {
  let made = 0
  const cache = createStillCache({ make: async ({ id }) => { made++; return { uri: `file:///still-${id}.png` } } })
  let notified = 0
  cache.subscribe(() => notified++)
  const releaseA = cache.retain('media:m1', { id: 'm1' })
  const releaseB = cache.retain('media:m1', { id: 'm1' })
  const pending = cache.get('media:m1')
  assert.equal(pending.status, 'pending')
  await flush()
  assert.equal(made, 1)
  const ready = cache.get('media:m1')
  assert.deepEqual(ready, { status: 'ready', uri: 'file:///still-m1.png' })
  assert.notEqual(ready, pending)
  assert.ok(notified >= 1)
  releaseA(); releaseB(); releaseB() // 두 번 놓아도 한 번만 센다
  assert.equal(cache.get('media:m1').status, 'ready')
})

test('쓰는 화면이 있는 동안은 실패를 기억해 변환을 되풀이하지 않는다', async () => {
  let made = 0
  const cache = createStillCache({ make: async () => { made++; throw new Error('broken gif') } })
  const first = cache.retain('media:bad', { id: 'bad' })
  await flush()
  assert.equal(cache.get('media:bad').status, 'failed')
  cache.retain('media:bad', { id: 'bad' })() // 같은 GIF 를 쓰는 다른 화면
  await flush()
  assert.equal(made, 1)
  assert.equal(cache.get('media:bad').status, 'failed')
  first()
})

test('쓰는 화면이 모두 사라지면 실패 기록을 지워 다음에 다시 만든다(일시적 오류 회복)', async () => {
  let made = 0
  const cache = createStillCache({ make: async ({ id }) => { if (++made === 1) throw new Error('blob not ready'); return { uri: `file:///${id}.png` } } })
  const release = cache.retain('media:late', { id: 'late' })
  await flush()
  assert.equal(cache.get('media:late').status, 'failed')
  release()
  assert.equal(cache.get('media:late'), undefined)
  const again = cache.retain('media:late', { id: 'late' })
  await flush()
  assert.equal(made, 2)
  assert.deepEqual(cache.get('media:late'), { status: 'ready', uri: 'file:///late.png' })
  again()
})

test('다 쓴 뒤에 실패가 오면 기록하지 않는다', async () => {
  const cache = createStillCache({ make: async () => { throw new Error('broken gif') } })
  cache.retain('media:gone', { id: 'gone' })()
  await flush()
  assert.equal(cache.get('media:gone'), undefined)
  assert.equal(cache.size(), 0)
})

test('안 쓰는 첫 장면이 상한을 넘으면 오래된 것부터 지우고(파일 삭제), 쓰는 중인 것은 남긴다', async () => {
  const disposed = []
  const cache = createStillCache({ limit: 1, make: async ({ id }) => ({ uri: `file:///${id}.png`, id }), dispose: (resource) => disposed.push(resource.id) })
  const keep = cache.retain('media:a', { id: 'a' }) // 계속 쓴다
  cache.retain('media:b', { id: 'b' })()
  await flush()
  cache.retain('media:c', { id: 'c' })()
  await flush()
  assert.deepEqual(disposed, ['b'])
  assert.equal(cache.get('media:a').status, 'ready')
  assert.equal(cache.get('media:b'), undefined)
  assert.equal(cache.get('media:c').status, 'ready')
  // a 를 다 쓰면 a 가 가장 최근에 쓴 것이라 남고, 더 오래된 c 를 지운다
  keep()
  assert.deepEqual(disposed, ['b', 'c'])
  assert.equal(cache.get('media:a').status, 'ready')
  assert.equal(cache.size(), 1)
})

// 훅: react 를 아주 단순하게 흉내 내(효과는 바로 실행, 외부 저장소는 바로 읽기) 분기를 확인한다
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const hookCode = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/hooks/useSvgImageUri.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
function loadHook({ platform, extension = 'gif', make }) {
  const cleanups = []
  const mocks = {
    react: { useEffect: (fn) => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup) }, useSyncExternalStore: (_, get) => get() },
    'react-native': { Platform: { OS: platform } },
    '../services/mediaStore': { mediaService: { get: async (id) => ({ blob: id, media: { extension } }) } },
    '../utils/exportImage': { exportImage: make, readLegacyExportImage: async (uri) => ({ blob: uri }) },
    '../utils/mediaReferences.js': mediaReferences,
    './useMediaUri': { useMediaEntry: () => ({ media: { extension } }) },
    '../utils/svgImageSource.js': svgImageSource,
    '../utils/svgStillCache.js': svgStillCache,
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', hookCode)((id) => mocks[id], module, module.exports)
  return { useSvgImageUri: module.exports.useSvgImageUri, cleanups }
}

test('훅: 웹이나 GIF 가 아니면 주소를 그대로, 기기의 GIF 는 첫 장면이 생길 때까지 비워 둔다', async () => {
  const web = loadHook({ platform: 'web', make: async () => assert.fail('웹은 변환하지 않는다') })
  assert.deepEqual(web.useSvgImageUri({ mediaFileId: 'm1' }, 'blob:gif'), { uri: 'blob:gif', failed: false })
  const png = loadHook({ platform: 'android', extension: 'png', make: async () => assert.fail('PNG 는 변환하지 않는다') })
  assert.deepEqual(png.useSvgImageUri({ mediaFileId: 'm2' }, 'file:///m2.png'), { uri: 'file:///m2.png', failed: false })

  const sizes = []
  const native = loadHook({ platform: 'android', make: async ({ blob, size }) => { sizes.push(size); return { uri: `file:///still-${blob}.png` } } })
  assert.deepEqual(native.useSvgImageUri({ mediaFileId: 'hook1' }, 'file:///hook1.gif'), { uri: null, failed: false })
  await flush()
  assert.deepEqual(native.useSvgImageUri({ mediaFileId: 'hook1' }, 'file:///hook1.gif'), { uri: 'file:///still-hook1.png', failed: false })
  assert.equal(sizes.length, 1)
  assert.ok(sizes[0].width <= 2048)
  // SVG 로 그리지 않는 곳(enabled: false)은 GIF 그대로 (View 로 그리면 움직인다)
  assert.deepEqual(native.useSvgImageUri({ mediaFileId: 'hook1' }, 'file:///hook1.gif', { enabled: false }), { uri: 'file:///hook1.gif', failed: false })
})

test('훅: 첫 장면을 만들지 못하면 failed 로 그 항목의 키를 알린다(항목마다 다른 값)', async () => {
  const native = loadHook({ platform: 'android', make: async () => { throw new Error('broken') } })
  native.useSvgImageUri({ mediaFileId: 'hook-bad' }, 'file:///bad.gif')
  native.useSvgImageUri({ mediaFileId: 'hook-bad2' }, 'file:///bad2.gif')
  await flush()
  const first = native.useSvgImageUri({ mediaFileId: 'hook-bad' }, 'file:///bad.gif')
  const second = native.useSvgImageUri({ mediaFileId: 'hook-bad2' }, 'file:///bad2.gif')
  assert.equal(first.uri, null)
  assert.equal(typeof first.failed, 'string')
  assert.equal(typeof second.failed, 'string')
  // 실패한 A 에서 실패한 B 로 바뀌면 failed 값이 달라져, 알림 effect 가 B 도 다시 알린다
  assert.notEqual(first.failed, second.failed)
})
