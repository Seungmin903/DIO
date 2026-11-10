import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

// handwriting/sharedFonts.js · library.js 를 기기 모듈(expo-font · 파일 · 저장소) 대신 기록용 가짜로 읽는다
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const compile = path => expo('@babel/core').transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const sharedCode = compile('../src/handwriting/sharedFonts.js'), libraryCode = compile('../src/handwriting/library.js')
const fileId = 'a1b2c3d4-0000-4000-8000-00000000f001', mediaFileId = '30000000-0000-4000-8000-000000000001'
const family = `DIOHW_${fileId.replaceAll('-', '')}`

function load({ failLoads = new Set(), mine = [] } = {}) {
  const log = [], disk = new Map(), registered = new Map(), loaded = new Set()
  const text = {
    registerSharedTextFonts: fonts => fonts.forEach(font => registered.set(font.id, font)),
    clearSharedTextFonts: ids => { log.push(['clear', ids ?? null]); for (const id of ids ?? [...registered.keys()]) registered.delete(id) },
    loadedFontFamily: id => { const font = registered.get(id); return font && loaded.has(font.family) ? font.family : null },
    markTextFontLoaded: name => loaded.add(name),
    markTextFontFailed: name => log.push(['failed', name]),
    registerPersonalTextFonts() {},
    getTextFonts: () => [...registered.values()],
  }
  const files = {
    cachedSharedFontUri: async () => null, saveSharedFontBytes: async () => 'uri', sharedFontUploadBody: async () => ({}),
    removeSharedFontBytes: async id => log.push(['remove', id]),
    clearSharedFontBytes: async () => log.push(['clear-files']),
    releaseSharedFontUris: () => log.push(['release']),
    readFontBytes: async uri => new TextEncoder().encode(`bytes:${uri}`),
  }
  const stubs = {
    'expo-font': { loadAsync: async map => { const [name] = Object.keys(map); if (failLoads.has(name)) throw Error('bad font'); log.push(['load', name, map[name].uri]) } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value) } } },
    '../editor/utils/text.js': text,
    './storage.js': { loadFontLibrary: async () => mine },
    './files': files,
    './fontFormat.js': { toBase64: bytes => Buffer.from(bytes).toString('base64') },
  }
  const run = (code, extra = {}) => { const module = { exports: {} }; new Function('require', 'module', 'exports', code)(id => extra[id] ?? stubs[id] ?? require(id), module, module.exports); return module.exports }
  const shared = run(sharedCode)
  const library = run(libraryCode, { './sharedFonts.js': shared })
  return { shared, library, log, disk, registered }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('친구 폰트를 받아 등록하면 그 글꼴로 그리고, 내 폰트가 없어도 그 파일로 내보낸다', async () => {
  const { shared, library } = load()
  await shared.sharedFontLibrary.register([{ fileId, mediaFileId, uri: 'file://shared/a.ttf' }])
  assert.equal(shared.sharedFontLibrary.has(fileId), true)
  assert.equal(shared.sharedFontUri(fileId), 'file://shared/a.ttf')
  const css = await library.personalFontExportCSS([{ type: 'text', font: `personal-${fileId}` }])
  assert.match(css, new RegExp(`font-family:'${family}'`))
  assert.ok(css.includes(Buffer.from('bytes:file://shared/a.ttf').toString('base64')))
})

test('세션을 닫으면 받은 친구 폰트로 더는 내보내지 않는다', async () => {
  const { shared, library, log } = load()
  await shared.sharedFontLibrary.register([{ fileId, mediaFileId, uri: 'file://shared/a.ttf' }])
  shared.releaseSharedFonts()
  assert.deepEqual(log.filter(entry => entry[0] === 'clear' || entry[0] === 'release'), [['clear', null], ['release']])
  assert.equal(shared.sharedFontUri(fileId), null)
  await assert.rejects(library.personalFontExportCSS([{ type: 'text', font: `personal-${fileId}` }]), /폰트/)
})

test('기기가 읽지 못한 친구 폰트는 캐시를 지우고 부른 쪽에 알린다', async () => {
  const { shared, log } = load({ failLoads: new Set([family]) })
  const failed = []
  await shared.sharedFontLibrary.register([{ fileId, mediaFileId, uri: 'file://shared/a.ttf' }], (...args) => failed.push(args))
  assert.deepEqual(failed, [[fileId, mediaFileId]])
  assert.ok(log.some(entry => entry[0] === 'remove' && entry[1] === mediaFileId))
  assert.equal(shared.sharedFontUri(fileId), null)
  assert.equal(shared.sharedFontLibrary.has(fileId), false)
})

test('다른 계정으로 열면 이전 계정이 받은 폰트 파일을 지우고, 같은 계정이면 그대로 둔다', async () => {
  const { shared, log, disk } = load()
  await shared.claimSharedFonts('1@https://api')
  assert.equal(log.filter(entry => entry[0] === 'clear-files').length, 1) // 처음(주인 기록 없음)에도 남은 파일을 비운다
  await shared.claimSharedFonts('1@https://api')
  assert.equal(log.filter(entry => entry[0] === 'clear-files').length, 1)
  await shared.claimSharedFonts('2@https://api')
  assert.equal(log.filter(entry => entry[0] === 'clear-files').length, 2)
  assert.equal(disk.get('dio:shared-fonts:owner:v1'), '2@https://api')
})

test('다툼이 생긴 친구 폰트는 등록을 해제한다', async () => {
  const { shared, log } = load()
  await shared.sharedFontLibrary.register([{ fileId, mediaFileId, uri: 'file://shared/a.ttf' }])
  shared.sharedFontLibrary.unregister([fileId])
  assert.deepEqual(log.find(entry => entry[0] === 'clear'), ['clear', [`personal-${fileId}`]])
  assert.equal(shared.sharedFontUri(fileId), null)
  await settle()
})
