import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import * as dday from '../src/editor/widgets/dday.js'
import { createDdayWidget, WIDGET_ITEMS } from '../src/editor/widgets/dday.js'
import { encodeElement, decodeElement, sharedObject } from '../src/collaboration/canvasElements.js'

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

const photoSticker = { asset: 'smile', name: '웃음' }
const recents = [{ widget: 'dday', style: 'ticket', name: '디데이 티켓' }, photoSticker]
const decor = { folders: [], favorites: [{ widget: 'dday', style: 'label', name: '디데이 라벨' }, photoSticker], recentStickers: recents, categoryOrder: [], hiddenCategories: [] }
const library = (items, category, keyword, options) => load('../src/editor/stickerLibrary.js', {
  './stickerAssets': { STICKER_GROUPS: [{ id: 'fluent', items: [photoSticker] }, { id: 'twemoji', items: [] }] },
  './hooks/useCustomDecor': { RECENT_LIMIT: 8, stickerKey: (s) => s.asset ?? (s.widget ? `widget:${s.widget}:${s.style}` : null) },
  './widgets/dday': { WIDGET_ITEMS },
}).stickerLibrary(items, category, keyword, options)

test('보관함에는 위젯 분류가 있고 검색으로도 찾는다', () => {
  const result = library(decor, 'widget', '')
  assert.ok(result.chips.some((chip) => chip.id === 'widget' && chip.name === '위젯'))
  assert.deepEqual(result.groups.map((g) => g.id), ['widget'])
  assert.equal(result.groups[0].items.length, 3)
  assert.ok(library(decor, null, '디데이').groups.some((g) => g.id === 'widget'))
})
test('표지 스티커(widgets: false)에는 위젯 분류 · 즐겨찾기 · 최근 · 검색 결과가 모두 빠진다', () => {
  const result = library(decor, 'widget', '', { widgets: false })
  assert.ok(!result.chips.some((chip) => chip.id === 'widget'))
  assert.ok(!result.sorted.some((chip) => chip.id === 'widget'))
  assert.deepEqual(result.favorites, [photoSticker])
  assert.deepEqual(result.recents, [photoSticker])
  assert.ok(result.groups.every((g) => g.id !== 'widget'))
  assert.ok(library(decor, null, '디데이', { widgets: false }).groups.every((g) => g.id !== 'widget'))
})

test('위젯 스티커는 asset·src 없이 widget 만 가지고, 공유 형식으로 왕복해도 유지된다', () => {
  const widget = { ...createDdayWidget('stamp', { y: 2026, m: 10, d: 31 }), title: '콘서트' }
  const object = { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', type: 'sticker', x: 10, y: 20, w: 168, h: 168, rotation: 0, widget, name: '디데이 도장' }
  assert.equal(sharedObject(object), true)
  const decoded = decodeElement({ ...encodeElement(object), version: 0 })
  assert.deepEqual(decoded.widget, widget)
  assert.equal(decoded.asset, undefined)
  assert.equal(decoded.src, undefined)
})

test('내보내기 준비는 이미지 원본이 없는 위젯 스티커를 그대로 통과시킨다', async () => {
  const widget = createDdayWidget('ticket', { y: 2026, m: 10, d: 31 })
  const page = { id: 'p', objects: [{ id: 'w', type: 'sticker', x: 0, y: 0, w: 280, h: 129, rotation: 0, widget }] }
  const snapshot = createExportSnapshot(page, { width: 1280, height: 800 })
  assert.deepEqual(snapshot.objects[0].widget, widget)
  const prepared = await prepareExportSnapshot(snapshot, () => assert.fail('이미지 해석을 요청하면 안 된다'), null)
  assert.deepEqual(prepared.objects[0].widget, widget)
  prepared.dispose()
})

test('보관함에서 고른 위젯은 모양별 규격과 기본 widget 값으로 캔버스 스티커가 된다', () => {
  const { createSticker, createObjectFromDecor } = load('../src/editor/utils/objects.js', {
    '../constants': {}, './editorShapes': {}, './common': { clamp: (v) => v, createId: () => 'id' }, './photoStrip': {}, '../widgets/dday': dday,
  })
  const sizes = Object.fromEntries(['label', 'ticket', 'stamp'].map((style) => {
    const object = createSticker({ widget: 'dday', style, name: `디데이 ${style}` }, { x: 500, y: 400 })
    assert.equal(object.type, 'sticker')
    assert.equal(object.widget.kind, 'dday')
    assert.equal(object.widget.style, style)
    assert.equal(object.asset, undefined)
    assert.equal(object.src, undefined)
    assert.equal(object.x + object.w / 2, 500)
    return [style, [object.w, object.h]]
  }))
  assert.deepEqual(sizes, { label: [210, 78], ticket: [280, 129], stamp: [168, 168] })
  assert.ok(createObjectFromDecor({ kind: 'sticker', widget: 'dday', style: 'label' }, { x: 0, y: 0 }).widget)
})
