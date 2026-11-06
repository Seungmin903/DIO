import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CATALOG_STORAGE_KEY, catalogTextFonts, createRemoteCatalog, parseCatalog, parseStickerPack } from '../src/shared/remoteAssets/remoteCatalog.js'
import { buildCatalog } from '../scripts/remote-content.mjs'
import * as builtinStickers from '../src/editor/builtinStickers.js'
import { getPickableTextFonts, getTextFonts, isKnownTextFontId, registerCatalogTextFonts } from '../src/editor/utils/text.js'

const { builtinStickerOf, registerRemoteStickerPack, retainRemoteStickerPacks, stickerPacks } = builtinStickers
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
// stickerLibrary.js 는 확장자 없는 import 를 쓰므로 builtin-stickers.test.js 처럼 babel 로 불러온다
function stickerLibrary(items, category, keyword) {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/stickerLibrary.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }
  const mocks = { './hooks/useCustomDecor': { RECENT_LIMIT: 12, stickerKey: s => s.builtin ?? s.src }, './builtinStickers': builtinStickers }
  new Function('require', 'module', 'exports', code)(id => mocks[id], module, module.exports)
  return module.exports.stickerLibrary(items, category, keyword)
}
const sha = 'a'.repeat(64)
const file = key => ({ key, size: 10, sha256: sha })
const sticker = { id: 'tulip', name: '튤립', w: 3, h: 2, paths: [['#ffffff', 'M0 0h3v1h-3z'], ['#E85D75', 'M1 1h1v1h-1z']] }

test('catalog.json 은 형식이 맞는 항목만 받고, 스키마 버전이 다르면 통째로 무시한다', () => {
  assert.equal(parseCatalog({ schemaVersion: 2, fonts: [] }), null)
  const parsed = parseCatalog({ schemaVersion: 1,
    fonts: [
      { id: 'hahmlet', label: '함렛', regular: file('catalog/fonts/hahmlet/A.1.ttf'), bold: file('catalog/fonts/hahmlet/B.1.ttf') },
      { id: 'Bad Id', label: 'x', regular: file('a.ttf') },
      { id: 'escape', label: '탈출', regular: file('../secret.ttf') },
      { id: 'nohash', label: '해시 없음', regular: { key: 'a.ttf', size: 1, sha256: 'xyz' } },
      { id: 'hahmlet', label: '중복', regular: file('c.ttf') },
    ],
    stickerPacks: [{ id: 'spring', name: '봄', file: file('catalog/stickers/spring/pack.1.json'), hidden: true }, { id: 'x', name: '', file: file('p.json') }],
  })
  assert.deepEqual(parsed.fonts.map(font => font.id), ['hahmlet'])
  assert.equal(parsed.fonts[0].bold.key, 'catalog/fonts/hahmlet/B.1.ttf')
  assert.deepEqual(parsed.stickerPacks.map(pack => [pack.id, pack.hidden]), [['spring', true]])
  const [font] = catalogTextFonts(parsed.fonts)
  assert.deepEqual([font.id, font.family, font.boldFamily], ['remote-hahmlet', 'DIOR_hahmlet', 'DIOR_hahmlet_Bold'])
  assert.equal(font.files.DIOR_hahmlet_Bold.key, 'catalog/fonts/hahmlet/B.1.ttf')
})

test('스티커 팩은 기본 스티커와 같은 모양으로 바꾸고 잘못된 그림은 뺀다', () => {
  const pack = parseStickerPack({ id: 'spring', name: '봄' }, { stickers: [sticker, { ...sticker, id: 'bad', paths: [['red', 'M0 0']] }, { ...sticker, id: 'big', w: 65 }, { ...sticker, id: 'inject', paths: [['#ffffff', 'M0 0"/><script>']] }] })
  assert.equal(pack.id, 'remote:spring')
  assert.deepEqual(pack.items.map(item => item.builtin), ['remote:spring:tulip'])
  assert.deepEqual(Object.keys(pack.items[0]).sort(), ['builtin', 'h', 'name', 'paths', 'w'])
})

test('원격 스티커 팩은 보관함 기본 분류 · 검색 · 그리기에 들어가고, 숨긴 팩은 보관함에서만 빠진다', () => {
  const items = { folders: [], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [] }
  registerRemoteStickerPack(parseStickerPack({ id: 'spring', name: '봄' }, { stickers: [sticker] }))
  registerRemoteStickerPack({ ...parseStickerPack({ id: 'old', name: '옛 팩' }, { stickers: [{ ...sticker, id: 'leaf', name: '솔방울' }] }), hidden: true })
  const library = stickerLibrary(items, 'remote:spring', '')
  assert.deepEqual(library.orderable.map(item => item.id), ['builtin:dio-moa', 'remote:spring'])
  assert.equal(library.pack.name, '봄')
  assert.deepEqual(stickerLibrary(items, null, '튤립').packMatches.map(item => item.builtin), ['remote:spring:tulip'])
  assert.equal(stickerLibrary(items, null, '솔방울').packMatches.length, 0) // 숨긴 팩은 검색에도 없다
  assert.equal(builtinStickerOf('remote:old:leaf').name, '솔방울') // 이미 붙인 스티커는 계속 그린다
  retainRemoteStickerPacks(['remote:spring'])
  assert.equal(builtinStickerOf('remote:old:leaf'), null)
  assert.ok(builtinStickerOf('moa_basic')) // 기본 스티커는 그대로
  retainRemoteStickerPacks([])
  assert.equal(stickerPacks().length, 1)
})

test('원격 글꼴은 글꼴 목록에 들어가고, 숨긴 글꼴은 고르는 목록에서만 빠진다', () => {
  const fonts = catalogTextFonts(parseCatalog({ schemaVersion: 1, fonts: [
    { id: 'hahmlet', label: '함렛', regular: file('a.ttf') }, { id: 'retired', label: '옛 글꼴', regular: file('b.ttf'), hidden: true },
  ] }).fonts)
  registerCatalogTextFonts(fonts)
  assert.ok(getTextFonts().some(font => font.id === 'remote-retired'))
  assert.ok(getPickableTextFonts().some(font => font.id === 'remote-hahmlet'))
  assert.ok(!getPickableTextFonts().some(font => font.id === 'remote-retired'))
  registerCatalogTextFonts([])
  assert.equal(isKnownTextFontId('remote-hahmlet'), true) // 목록을 아직 못 받아도 문서 내보내기는 막지 않는다
  assert.equal(isKnownTextFontId('nanum-gothic'), true)
  assert.equal(isKnownTextFontId('unknown-font'), false)
})

test('목록 불러오기: 저장본을 먼저 쓰고, 새 목록이 바뀌었으면 적용 · 저장한다. 받지 못해도 저장본은 남는다', async () => {
  const saved = JSON.stringify({ schemaVersion: 1, fonts: [{ id: 'old', label: '옛', regular: file('a.ttf') }], stickerPacks: [] })
  const fresh = JSON.stringify({ schemaVersion: 1, fonts: [{ id: 'new', label: '새', regular: file('b.ttf') }], stickerPacks: [{ id: 'spring', name: '봄', file: file('p.json') }] })
  const store = new Map([[CATALOG_STORAGE_KEY, saved]])
  const storage = { getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value) } }
  const applied = [], packs = [], retained = []
  const deps = { storage, readText: async () => JSON.stringify({ stickers: [sticker] }),
    applyFonts: fonts => applied.push(fonts.map(font => font.id)), applyStickerPack: pack => packs.push(pack.id), retainStickerPacks: ids => retained.push(ids) }

  await createRemoteCatalog({ ...deps, fetchCatalog: async () => fresh }).load()
  assert.deepEqual(applied, [['remote-old'], ['remote-new']])
  assert.deepEqual(packs, ['remote:spring'])
  assert.equal(store.get(CATALOG_STORAGE_KEY), fresh)

  applied.length = 0
  await createRemoteCatalog({ ...deps, fetchCatalog: async () => { throw new Error('offline') } }).load()
  assert.deepEqual(applied, [['remote-new']]) // 오프라인: 저장본

  applied.length = 0
  await createRemoteCatalog({ ...deps, fetchCatalog: async () => '<html>' }).load()
  assert.deepEqual(applied, [['remote-new']]) // 깨진 응답은 저장하지 않는다
  assert.equal(store.get(CATALOG_STORAGE_KEY), fresh)
})

test('remote-content 폴더에서 catalog.json 과 해시 이름 파일을 만들고, 형식 오류를 모두 알린다', t => {
  const dir = mkdtempSync(join(tmpdir(), 'dio-remote-content-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ttf = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(60, 7)])
  mkdirSync(join(dir, 'fonts', 'hahmlet'), { recursive: true })
  writeFileSync(join(dir, 'fonts', 'hahmlet', 'font.json'), JSON.stringify({ label: '함렛', regular: 'Hahmlet-Regular.ttf', order: 2 }))
  writeFileSync(join(dir, 'fonts', 'hahmlet', 'Hahmlet-Regular.ttf'), ttf)
  writeFileSync(join(dir, 'fonts', 'hahmlet', 'OFL.txt'), 'license')
  mkdirSync(join(dir, 'stickers', 'spring'), { recursive: true })
  writeFileSync(join(dir, 'stickers', 'spring', 'pack.json'), JSON.stringify({ name: '봄', stickers: [sticker] }))

  const ok = buildCatalog(dir)
  assert.deepEqual(ok.errors, [])
  assert.match(ok.catalog.fonts[0].regular.key, /^catalog\/fonts\/hahmlet\/Hahmlet-Regular\.[a-f0-9]{16}\.ttf$/)
  assert.equal(ok.catalog.fonts[0].regular.size, ttf.length)
  assert.match(ok.catalog.stickerPacks[0].file.key, /^catalog\/stickers\/spring\/pack\.[a-f0-9]{16}\.json$/)
  assert.ok(ok.uploads.some(upload => upload.key === 'catalog/fonts/hahmlet/OFL.txt'))
  assert.deepEqual(parseCatalog(ok.catalog).fonts.map(font => font.id), ['hahmlet'])

  mkdirSync(join(dir, 'fonts', 'nolicense'))
  writeFileSync(join(dir, 'fonts', 'nolicense', 'font.json'), JSON.stringify({ label: '무', regular: 'A.ttf' }))
  writeFileSync(join(dir, 'fonts', 'nolicense', 'A.ttf'), ttf)
  mkdirSync(join(dir, 'fonts', 'notfont'))
  writeFileSync(join(dir, 'fonts', 'notfont', 'font.json'), JSON.stringify({ label: '가짜', regular: 'A.ttf' }))
  writeFileSync(join(dir, 'fonts', 'notfont', 'A.ttf'), 'not a font')
  writeFileSync(join(dir, 'fonts', 'notfont', 'OFL.txt'), 'license')
  mkdirSync(join(dir, 'stickers', 'broken'))
  writeFileSync(join(dir, 'stickers', 'broken', 'pack.json'), JSON.stringify({ name: '깨짐', stickers: [sticker, { ...sticker, id: 'bad', w: 0 }] }))
  const bad = buildCatalog(dir)
  assert.equal(bad.errors.length, 3)
  assert.match(bad.errors.join('\n'), /nolicense: 라이선스/)
  assert.match(bad.errors.join('\n'), /notfont\/A\.ttf: TTF\/OTF/)
  assert.match(bad.errors.join('\n'), /broken: .*\(bad\)/)
})
