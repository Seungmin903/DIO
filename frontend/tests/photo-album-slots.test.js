import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { photoAlbumSlots, photoAlbumSlotAt, photoAlbumSlotOccupied, omitFilledAlbumBordersXml, availablePhotoAlbumSlot } from '../src/editor/templates/photoAlbumSlots.js'
import { omitFilledAlbumBordersAst } from '../src/editor/templates/photoAlbumAst.js'
import { createElement } from 'react'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'
import { encodeElement, decodeElement } from '../src/collaboration/canvasElements.js'

test('사진 선택 중 칸이 채워지면 첫 빈 칸을 선택하고 모두 차면 실패한다', () => {
  for (const direction of ['portrait', 'landscape']) {
    const page = { backgroundAssetId: `remote-photo-album-${direction}`, objects: [] }
    const slots = photoAlbumSlots(page.backgroundAssetId)
    assert.equal(availablePhotoAlbumSlot(page, 2), 2)
    page.objects.push({ type: 'photo', albumSlot: 2, ...slots[2] })
    assert.equal(availablePhotoAlbumSlot(page, 2), 0)
    page.objects = slots.map((box, albumSlot) => ({ type: 'photo', albumSlot, ...box }))
    assert.equal(availablePhotoAlbumSlot(page, 2), -1)
  }
})

for (const direction of ['portrait', 'landscape']) test(`${direction} 여섯 칸은 SVG 테두리와 일치하고 빈 칸만 선택한다`, () => {
  const assetId = `remote-photo-album-${direction}`
  const svg = readFileSync(new URL(`../remote-content/templates/photo-album/photo-album-${direction}.svg`, import.meta.url), 'utf8')
  const boxes = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="none" stroke="#aeb3b8"/g)]
  const slots = photoAlbumSlots(assetId)
  assert.equal(boxes.length, 6)
  slots.forEach((box, index) => {
    assert.deepEqual([box.x, box.y, box.w, box.h], boxes[index].slice(1).map(Number))
    const point = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
    const page = { backgroundAssetId: assetId, objects: [] }
    assert.equal(photoAlbumSlotAt(page, point), index)
    page.objects.push({ type: 'photo', albumSlot: index, ...box })
    assert.equal(photoAlbumSlotAt(page, point), -1)
    page.objects[0].hidden = true
    assert.equal(photoAlbumSlotAt(page, point), -1)
    page.objects[0].x += 10
    assert.equal(photoAlbumSlotAt(page, point), index)
  })
})

test('사진이 표시되는 칸의 점선만 화면과 출력에서 숨기고 원본은 유지한다', () => {
  const assetId = 'remote-photo-album-portrait'
  const boxes = photoAlbumSlots(assetId)
  const xml = readFileSync(new URL('../remote-content/templates/photo-album/photo-album-portrait.svg', import.meta.url), 'utf8')
  const photo = { type: 'photo', albumSlot: 0, ...boxes[0], opacity: 1 }
  const page = { backgroundAssetId: assetId, objects: [photo] }
  const result = omitFilledAlbumBordersXml(xml, page)
  assert.equal((result.match(/data-album-slot=/g) ?? []).length, 5)
  assert.match(xml, /data-album-slot="0"/)
  assert.match(omitFilledAlbumBordersXml(xml, { ...page, objects: [{ ...photo, hidden: true }] }), /data-album-slot="0"/)
  const ast = { children: boxes.map((b, i) => createElement('rect', { key: i, x: b.x, y: b.y, width: b.w, height: b.h, fill: 'none' })) }
  const changed = omitFilledAlbumBordersAst(ast, page)
  assert.equal(changed.children.length, 5)
  assert.equal(ast.children.length, 6)
})

test('사진 교체와 삭제는 각각 되돌릴 수 있고 칸 정보는 저장·공유 변환 뒤 유지된다', () => {
  const id = '10000000-0000-4000-8000-000000000001', media = '20000000-0000-4000-8000-000000000001'
  const page = { id: 'page', backgroundAssetId: 'remote-photo-album-portrait', objects: [] }
  const photo = { id, type: 'photo', ...photoAlbumSlots(page.backgroundAssetId)[0], albumSlot: 0, src: `media:${media}`, mediaFileId: media, crop: { fx: 0.5, fy: 0.5, zoom: 1 } }
  let state = createInitialState({ pages: [page] })
  state = editorReducer(state, { type: 'addObjects', objects: [photo] })
  state = editorReducer(state, { type: 'updateObject', id, record: true, patch: { crop: { fx: 0.3, fy: 0.5, zoom: 2 } } })
  state = editorReducer(state, { type: 'removeObjects', ids: [id] })
  assert.equal(photoAlbumSlotOccupied(state.doc.pages[0], 0), false)
  state = editorReducer(state, { type: 'undo' })
  assert.equal(state.doc.pages[0].objects[0].crop.zoom, 2)
  state = editorReducer(state, { type: 'undo' })
  assert.equal(state.doc.pages[0].objects[0].crop.zoom, 1)
  const restored = JSON.parse(JSON.stringify(state.doc.pages[0]))
  assert.equal(photoAlbumSlotOccupied(restored, 0), true)
  const decoded = decodeElement({ ...encodeElement(restored.objects[0]), version: 1 })
  assert.equal(photoAlbumSlotOccupied({ ...restored, objects: [decoded] }, 0), true)
  state = editorReducer(state, { type: 'undo' })
  assert.equal(state.doc.pages[0].objects.length, 0)
})
