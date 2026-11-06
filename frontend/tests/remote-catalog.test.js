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

test('원격 속지: 목록 해석 · 속지 고르기 탭 · 앱 속지 ID · 그림 파일 기다리기', async () => {
  const { registerRemoteTemplates, waitForRemoteTemplateFile } = await import('../src/editor/templates/remoteTemplates.js')
  const { papersIn, paperById, countAssetId } = await import('../src/diary/utils/paperChoice.js')
  const { getTemplate } = await import('../src/editor/templates/catalog.js')
  const parsed = parseCatalog({ schemaVersion: 1, templates: [
    { id: 'spring-note', name: '봄 노트', group: 'note', landscape: file('l.svg'), portrait: file('p.svg') },
    { id: 'old', name: '옛 속지', group: 'diary', landscape: file('l2.svg'), portrait: file('p2.svg'), hidden: true },
    { id: 'nogroup', name: '분류 없음', group: 'misc', landscape: file('a.svg'), portrait: file('b.svg') },
    { id: 'half', name: '한 방향만', group: 'note', landscape: file('a.svg') },
  ] })
  assert.deepEqual(parsed.templates.map(item => item.id), ['spring-note', 'old'])

  const waiting = waitForRemoteTemplateFile('remote-spring-note-portrait', 1000) // 목록이 들어오면 풀린다
  registerRemoteTemplates(parsed.templates)
  assert.equal((await waiting).key, 'p.svg')
  assert.ok(papersIn('note').some(paper => paper.id === 'remote:spring-note'))
  assert.ok(!papersIn('diary').some(paper => paper.id === 'remote:old')) // 숨긴 속지는 탭에 없다
  assert.equal(paperById('remote:old').name, '옛 속지') // 이미 고른 줄에서는 그대로
  assert.equal(countAssetId('remote:spring-note', 'portrait'), 'remote-spring-note-portrait')
  assert.equal(getTemplate('remote-spring-note-landscape').name, '봄 노트')
  registerRemoteTemplates([])
  assert.equal(paperById('remote:spring-note').name, '추가 속지') // 목록을 못 받아도 줄은 유지
  assert.equal(await waitForRemoteTemplateFile('remote-spring-note-portrait', 10), null)
})

test('remote-content 속지: 방향별 SVG 크기와 금지 요소를 검사한다', t => {
  const dir = mkdtempSync(join(tmpdir(), 'dio-remote-templates-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const svg = (w, h, body = '<rect width="10" height="10"/>') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`
  const add = (id, meta, files) => {
    mkdirSync(join(dir, 'templates', id), { recursive: true })
    writeFileSync(join(dir, 'templates', id, 'template.json'), JSON.stringify(meta))
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'templates', id, name), text)
  }
  add('spring-note', { name: '봄 노트', group: 'note', landscape: 'l.svg', portrait: 'p.svg' }, { 'l.svg': svg(1024, 768), 'p.svg': svg(768, 1024) })
  const ok = buildCatalog(dir)
  assert.deepEqual(ok.errors, [])
  assert.match(ok.catalog.templates[0].portrait.key, /^catalog\/templates\/spring-note\/p\.[a-f0-9]{16}\.svg$/)
  assert.equal(parseCatalog(ok.catalog).templates.length, 1)

  add('swapped', { name: '방향 바뀜', group: 'note', landscape: 'p.svg', portrait: 'l.svg' }, { 'l.svg': svg(1024, 768), 'p.svg': svg(768, 1024) })
  add('script', { name: '스크립트', group: 'note', landscape: 'l.svg', portrait: 'p.svg' }, { 'l.svg': svg(1024, 768, '<script>x</script>'), 'p.svg': svg(768, 1024, '<image href="https://x/y.png"/>') })
  add('badgroup', { name: '분류', group: 'misc', landscape: 'l.svg', portrait: 'p.svg' }, { 'l.svg': svg(1024, 768), 'p.svg': svg(768, 1024) })
  const bad = buildCatalog(dir)
  assert.match(bad.errors.join('\n'), /swapped\/p\.svg: landscape 속지는 viewBox="0 0 1024 768"/)
  assert.match(bad.errors.join('\n'), /script\/l\.svg: script/)
  assert.match(bad.errors.join('\n'), /script\/p\.svg: script/)
  assert.match(bad.errors.join('\n'), /badgroup: group/)
})

test('원격 속지로 회원 다이어리를 만들면 서버 요청에 remoteTemplate 이 실리고, 돌아온 페이지는 같은 속지로 열린다', async () => {
  const { diaryCreateInput } = await import('../src/diary/services/diaryCreateInput.js')
  const { toServerInitialPageSelections, localTemplateReference } = await import('../src/editor/templates/serverCatalog.js')
  const { createServerPage, decodeServerPage } = await import('../src/collaboration/serverPages.js')
  const input = diaryCreateInput({ title: '봄', color: '#A9BFA6', pageSize: 'portrait',
    templateConfig: { orientation: 'portrait', sections: [{ kind: 'pages', items: [{ assetId: 'remote-spring-note-portrait', count: 2 }], repeat: 1 }] },
    paperAppearance: { backgroundColor: '#FFF8E7', layoutColor: '#33476B' } })
  assert.equal(input.initialPages.length, 2)
  assert.equal(input.initialPages[0].templateConfig.remoteTemplate, 'spring-note')
  const [selection] = toServerInitialPageSelections(input.initialPages)
  assert.equal(selection.templateCode, 'dio-remote-portrait')
  assert.equal(localTemplateReference(selection.templateCode, selection.templateVersion, JSON.parse(selection.configurationJson)).backgroundAssetId, 'remote-spring-note-portrait')

  // 편집기에서 페이지 추가: 범용 행 + remoteTemplate 으로 만들고, 응답을 같은 속지로 읽는다
  const diaryId = '11111111-1111-4111-8111-111111111111', pageId = '22222222-2222-4222-8222-222222222222'
  const disk = new Map(), calls = []
  const storage = { getItem: async k => disk.get(k) ?? null, setItem: async (k, v) => disk.set(k, v), removeItem: async k => disk.delete(k) }
  const transport = async request => {
    calls.push(request)
    const p = { pageId, diaryId, templateId: 7, title: null, sortKey: 1, canvasWidth: request.body.canvasWidth, canvasHeight: request.body.canvasHeight,
      gridVisible: false, gridColor: null, version: 1, templateCode: request.body.templateConfig.templateCode, templateVersion: request.body.templateConfig.templateVersion, templateConfig: request.body.templateConfig }
    return { page: p }
  }
  const page = await createServerPage({ transport, diaryId, backgroundAssetId: 'remote-spring-note-landscape', storage, key: 'pending', createId: () => '33333333-3333-4333-8333-333333333333' })
  assert.equal(calls[0].body.templateConfig.templateCode, 'dio-remote-landscape')
  assert.equal(calls[0].body.templateConfig.remoteTemplate, 'spring-note')
  assert.equal(page.backgroundAssetId, 'remote-spring-note-landscape')
  assert.equal(decodeServerPage({ page: (await transport({ body: calls[0].body })).page, elements: [] }, diaryId).backgroundAssetId, 'remote-spring-note-landscape')
})
