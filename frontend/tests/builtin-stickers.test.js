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
