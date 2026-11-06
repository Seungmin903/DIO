import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as builtinStickers from '../src/editor/builtinStickers.js'
import { BUILTIN_CANVAS, BUILTIN_CELL, BUILTIN_PACK, BUILTIN_STICKERS, builtinStickerOf } from '../src/editor/builtinStickers.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { decodeElement, encodeElement, sharedObject } from '../src/collaboration/canvasElements.js'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const load = (file, mocks) => {
  const { code } = babel.transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => mocks[id], module, module.exports)
  return module.exports
}
const objects = () => load('../src/editor/utils/objects.js', {
  '../constants': {}, './editorShapes': {}, './common': { clamp: (v) => v, createId: () => '00000000-0000-4000-8000-000000000001' }, './photoStrip': {}, '../widgets/dday': { ddayStyleOf: () => ({}) }, '../widgets/memo': {}, '../builtinStickers': builtinStickers,
})
const library = (items, category, keyword) => load('../src/editor/stickerLibrary.js', {
  './hooks/useCustomDecor': { RECENT_LIMIT: 12, stickerKey: (s) => s.builtin ?? s.src },
  './builtinStickers': builtinStickers,
}).stickerLibrary(items, category, keyword)
const decor = { folders: [], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [] }

test('기본 스티커는 모아 4 · 디오 4 · 소품 12, 모두 20종이고 그림 크기에 꼭 맞게 잘려 있다', () => {
  assert.equal(BUILTIN_STICKERS.length, 20)
  assert.equal(new Set(BUILTIN_STICKERS.map((s) => s.builtin)).size, 20)
  assert.equal(new Set(BUILTIN_STICKERS.map((s) => s.name)).size, 20)
  assert.equal(BUILTIN_STICKERS.filter((s) => s.builtin.startsWith('moa_')).length, 4)
  assert.equal(BUILTIN_STICKERS.filter((s) => s.builtin.startsWith('dio_')).length, 4)
  for (const sticker of BUILTIN_STICKERS) {
    const runs = sticker.paths.flatMap(([, d]) => [...d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)].map((m) => m.slice(1).map(Number)))
    assert.equal(Math.min(...runs.map(([x]) => x)), 0, sticker.builtin)
    assert.equal(Math.min(...runs.map(([, y]) => y)), 0, sticker.builtin)
    assert.equal(Math.max(...runs.map(([x, , w]) => x + w)), sticker.w, sticker.builtin)
    assert.equal(Math.max(...runs.map(([, y]) => y + 1)), sticker.h, sticker.builtin)
    assert.ok(Math.max(sticker.w, sticker.h) <= BUILTIN_CANVAS, sticker.builtin)
  }
})

test('원격 그림(PNG) 스티커는 긴 변 110 에 그림 비율로 붙고, 페이지에는 builtin id 만 남는다', () => {
  const image = { remote: true, key: 'catalog/stickers/spring/cherry.0123456789abcdef.png', size: 10, sha256: 'a'.repeat(64) }
  builtinStickers.registerRemoteStickerPack({ id: 'remote:spring', name: '봄', items: [
    { builtin: 'remote:spring:wide', name: '가로', image, iw: 300, ih: 150 },
    { builtin: 'remote:spring:tall', name: '세로', image, iw: 100, ih: 200 },
  ] })
  try {
    const { createSticker } = objects()
    const wide = createSticker({ builtin: 'remote:spring:wide' }, { x: 500, y: 400 })
    assert.deepEqual([wide.w, wide.h, wide.builtin, wide.name, wide.src], [110, 55, 'remote:spring:wide', '가로', undefined])
    const tall = createSticker({ builtin: 'remote:spring:tall' }, { x: 500, y: 400 })
    assert.deepEqual([tall.w, tall.h], [55, 110])
    // 서버 저장 · 공동편집 대상이다(그림 주소를 요소에 넣지 않아 media 규칙에 걸리지 않는다)
    assert.equal(sharedObject({ ...wide, id: '00000000-0000-4000-8000-000000000009' }), true)
  } finally { builtinStickers.retainRemoteStickerPacks([]) }
})

test('페이지에 붙으면 칸 크기가 같아 그림 비율과 그림끼리의 크기 비율이 시트와 같다', () => {
  const { createSticker } = objects()
  for (const sticker of BUILTIN_STICKERS) {
    const object = createSticker({ builtin: sticker.builtin, name: sticker.name }, { x: 500, y: 400 })
    assert.equal(object.type, 'sticker')
    assert.equal(object.builtin, sticker.builtin)
    assert.equal(object.w, sticker.w * BUILTIN_CELL)
    assert.equal(object.h, sticker.h * BUILTIN_CELL)
    assert.equal(object.x + object.w / 2, 500)
    assert.equal(object.y + object.h / 2, 400)
    assert.equal(object.src, undefined)
    assert.equal(object.asset, undefined)
  }
})

test('보관함에는 지우지 못하는 디오&모아 분류가 있고, 처음 열면 그 분류가 보이며 이름으로 찾을 수 있다', () => {
  const first = library(decor, null, '')
  assert.equal(first.active, BUILTIN_PACK.id)
  assert.equal(first.pack.name, '디오&모아')
  assert.equal(first.pack.items.length, 20)
  assert.equal(first.folder, null)
  assert.equal(first.orderable[0].base, true)
  assert.deepEqual(library(decor, null, '모아').packMatches.map((s) => s.builtin), ['moa_basic', 'moa_blush', 'moa_tired', 'moa_tongue'])
  assert.deepEqual(library(decor, null, '').packMatches, [])
  // 숨기면 칩에서 빠진다
  const hidden = library({ ...decor, hiddenCategories: [BUILTIN_PACK.id] }, BUILTIN_PACK.id, '')
  assert.ok(!hidden.chips.some((chip) => chip.id === BUILTIN_PACK.id))
  assert.equal(hidden.pack, null)
})

test('즐겨찾기 · 최근에 담긴 기본 스티커는 걸러지지 않는다', () => {
  const ref = { builtin: 'i_heart', name: '하트' }
  const result = library({ ...decor, favorites: [ref], recentStickers: [ref] }, 'favorites', '')
  assert.deepEqual(result.favorites, [ref])
  assert.deepEqual(result.recents, [ref])
})

test('공유 형식으로 왕복해도 기본 스티커가 유지되고, 원본 파일 없이 내보내기를 통과한다', async () => {
  const { createSticker } = objects()
  const object = { ...createSticker({ builtin: 'moa_tongue', name: '모아 메롱' }, { x: 300, y: 300 }), id: '00000000-0000-4000-8000-000000000002' }
  assert.ok(sharedObject(object))
  const encoded = encodeElement(object)
  assert.equal(encoded.mediaFileId, undefined)
  const decoded = decodeElement({ ...encoded, version: 1 })
  assert.equal(decoded.builtin, 'moa_tongue')
  assert.equal(builtinStickerOf(decoded.builtin).h, 21)
  const snapshot = createExportSnapshot({ id: 'page', objects: [object], canvasWidth: 1280, canvasHeight: 800 })
  assert.equal(snapshot.objects.length, 1)
  const prepared = await prepareExportSnapshot(snapshot, async () => { throw new Error('이미지를 읽으면 안 된다') })
  assert.equal(prepared.objects[0].builtin, 'moa_tongue')
  prepared.dispose()
})

test('표지에 붙인 기본 스티커는 저장한 표지를 다시 열어도 남는다', async () => {
  const { normalizeCover } = await import('../src/diary/utils/coverDesign.js')
  const cover = normalizeCover({ color: '#9DABD8', cover: { kind: 'color', stickers: [
    { id: 'a', builtin: 'moa_basic', name: '모아 기본', x: 40, y: 50, size: 14, rotation: 0 },
    { id: 'b', builtin: 'i_heart', name: '하트', x: 60, y: 55, size: 14, rotation: 0 },
    { id: 'c', name: '원본도 기본도 없음', x: 10, y: 10, size: 14 },
  ] } })
  assert.deepEqual(cover.stickers.map((s) => [s.id, s.builtin]), [['a', 'moa_basic'], ['b', 'i_heart']])
  assert.equal(cover.stickers[0].src, undefined)
})

// ObjectView 의 스티커 그리기: 기본 스티커도 테두리 · 그림자 실루엣 층(tint)이 만들어지고 본체는 색 그대로 그려진다
function renderBuiltin(options) {
  const { code } = babel.transformSync(readFileSync(new URL('../src/editor/components/canvas/ObjectView.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const mocks = {
    react: { memo: (value) => value, createContext: () => ({}), useContext: () => null },
    'react-native': { Platform: { OS: 'web' }, StyleSheet: { create: (s) => s }, Text: 'Text', View: 'View' },
    '../../utils/effects': require('../src/editor/utils/effects.js'),
    '../../stickerAssets': { isAnimatedMedia: () => false, stickerSource: () => null },
    '../../builtinStickers': builtinStickers,
    '../../hooks/useMediaUri': { useMediaUri: () => undefined },
    '../../hooks/useStickerPlayback': { useStickerPlayback: () => ({ source: null, error: null }) },
    '../../hooks/useStickerPacks': { useStickerPacks: () => 0 },
    '../../../shared/remoteAssets/useRemoteAssetUri': { useRemoteAssetUri: () => null },
    './BuiltinStickerArt': { __esModule: true, default: 'BuiltinStickerArt' },
    '../../../shared/theme': { colors: {} },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', `${code}\nmodule.exports.StickerContent = StickerContent;`)(
    (id) => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: () => null }), module, module.exports)
  const tree = module.exports.StickerContent({ object: { id: 's', type: 'sticker', builtin: 'moa_basic', ...options }, width: 114, height: 126, zoom: 1, still: true })
  const all = (node) => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(all)]
  return all(tree).filter((n) => n.type === 'BuiltinStickerArt')
}

test('기본 스티커는 테두리 · 그림자 층을 만들고 본체는 색 그대로 맨 위에 그린다', () => {
  const plain = renderBuiltin({})
  assert.equal(plain.length, 1)
  assert.equal(plain[0].props.tint, undefined)
  const styled = renderBuiltin({ outline: true, outlineColor: '#ff0000', shadow: true, shadowColor: '#0000ff' })
  const tints = styled.map((n) => n.props.tint)
  assert.ok(tints.includes('#ff0000'), '테두리 층')
  assert.ok(tints.includes('#0000ff'), '그림자 층')
  assert.equal(styled.at(-1).props.tint, undefined, '본체가 가장 위')
  assert.ok(styled.every((n) => n.props.sticker.builtin === 'moa_basic'))
  const noOutline = renderBuiltin({ shadow: true, shadowColor: '#0000ff' }).map((n) => n.props.tint)
  assert.ok(!noOutline.includes('#ff0000') && noOutline.includes('#0000ff'))
})
