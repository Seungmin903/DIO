import test from 'node:test'
import assert from 'node:assert/strict'
import { packingColorAction, packingSlotPatch, packingDropPatch, packingTapColor } from '../src/editor/templates/packingEditing.js'
import { encodeElement, decodeElement } from '../src/collaboration/canvasElements.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'
import { packingLayout } from '../src/editor/templates/packingLayout.js'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'

const roundTrip = object => decodeElement({ ...encodeElement(object), version: 1 })

test('캐리어 부위 색상을 저장·복원하고 다른 색으로 수정하거나 초기화한다', () => {
  const first = packingColorAction('case-0', '#ff0000', []).objects[0]
  const restored = roundTrip(first)
  assert.equal(restored.packingColorRegion, 'case-0')
  assert.equal(restored.fill, '#ff0000')
  assert.equal(packingColorAction('case-0', '#00ff00', [restored]).patch.fill, '#00ff00')
  assert.deepEqual(packingColorAction('case-0', '#ff0000', [restored]).ids, [first.id])
  assert.equal(packingColorAction('unknown', '#ff0000', []), null)
})

test('좌우 수납 위치는 요소 저장·복원 후에도 유지되고 다른 속지는 변경하지 않는다', () => {
  const original = { id: 'c94c824e-e6df-4f59-b915-cc04d4ca2d0c', type: 'sticker', x: 0, y: 0, w: 80, h: 60, rotation: 0, opacity: 1 }
  for (const orientation of ['portrait', 'landscape']) for (const slot of [0, 1]) {
    const asset = `remote-packing-list-${orientation}`
    const patch = packingSlotPatch(asset, original, slot)
    const restored = roundTrip({ ...original, ...patch })
    assert.equal(restored.packingSlot, slot)
    assert.equal(restored.x, patch.x)
    assert.equal(restored.y, patch.y)
    assert.deepEqual(packingSlotPatch(asset, restored, null), { packingSlot: null })
  }
  assert.equal(packingSlotPatch('other', original, 0), null)
})


test('새 속지에서 수납한 항목의 위치는 저장 후 유지되고 기존 속지 좌표는 바뀌지 않는다', () => {
  const object = { id: 'c94c824e-e6df-4f59-b915-cc04d4ca2d0c', type: 'sticker', x: 0, y: 0, w: 80, h: 60, rotation: 0, opacity: 1 }
  for (const orientation of ['portrait', 'landscape']) for (const slot of [0, 1]) {
    const legacy = `remote-packing-list-${orientation}`
    const next = `remote-packing-list-v2-${orientation}`
    const oldPatch = packingSlotPatch(legacy, object, slot)
    const newPatch = packingSlotPatch(next, object, slot)
    const restored = roundTrip({ ...object, ...newPatch })
    assert.ok(Math.abs(restored.x - newPatch.x) < 0.01)
    assert.ok(Math.abs(restored.y - newPatch.y) < 0.01)
    assert.equal(restored.packingSlot, slot)
    assert.notDeepEqual([newPatch.x, newPatch.y], [oldPatch.x, oldPatch.y])
  }
  assert.deepEqual(packingSlotPatch('remote-packing-list-portrait', object, 0), { packingSlot: 0, x: 184.5, y: 296.5 })
})


test('확대 속지에서도 좌우 수납이 각각 캐리어의 안쪽에 놓인다', () => {
  const object = {id:'e22a8e25-fbb9-4fa0-8c66-3f92f6171394',type:'sticker',w:60,h:60,x:0,y:0,opacity:1,rotation:0}
  for (const direction of ['portrait', 'landscape']) {
    const asset = `remote-packing-list-v3-${direction}`
    const left = packingSlotPatch(asset, object, 0)
    const right = packingSlotPatch(asset, object, 1)
    assert.equal(left.packingSlot, 0)
    assert.equal(right.packingSlot, 1)
    assert.ok(right.x > left.x + object.w)
    assert.ok(left.y > 0 && right.y > 0)
  }
})


test('캐리어 색상과 사진 수납 정보는 내보내기 준비 시 보존된다', () => {
  const color = packingColorAction('interior-0', '#aa3355', []).objects[0]
  const photo = {id:'c94c824e-e6df-4f59-b915-cc04d4ca2d0c',type:'photo',x:100,y:100,w:120,h:80,rotation:0,opacity:1,packingSlot:1}
  const page = {id:'p',backgroundAssetId:'remote-packing-list-v3-portrait',templateVersion:'1.0.0',canvasWidth:768,canvasHeight:1024,objects:[color,photo]}
  const snapshot = createExportSnapshot(page)
  assert.equal(snapshot.objects[0].packingColorRegion, 'interior-0')
  assert.equal(snapshot.objects[1].packingSlot, 1)
  assert.throws(() => createExportSnapshot({...page, backgroundAssetId:null}), {code:'EXPORT_GEOMETRY_INVALID'})
})


test('리디자인 캐리어는 방향별 독립 좌표를 사용하고 기존 속지 좌표를 보존한다', () => {
  for (const direction of ['portrait', 'landscape']) {
    const current = packingLayout(`remote-packing-list-v5-${direction}`)
    assert.equal(current.scaleX, undefined)
    assert.equal(current.scaleY, undefined)
    const photo = {id:'p',type:'photo',w:40,h:40,x:0,y:0}
    const left = packingSlotPatch(`remote-packing-list-v5-${direction}`, photo, 0)
    const right = packingSlotPatch(`remote-packing-list-v5-${direction}`, photo, 1)
    assert.ok(right.x > left.x + current.interiors[0].width / 2)
  }
  assert.equal(packingLayout('remote-packing-list-v4-portrait').scaleY, 1.65)
})


test('사진·스티커를 놓은 위치에서 수납하고 밖으로 옮기면 수납 해제한다', () => {
  for (const direction of ['portrait', 'landscape']) {
    const asset = `remote-packing-list-v6-${direction}`, layout = packingLayout(asset)
    for (const slot of [0, 1]) {
      const box = layout.interiors[slot]
      const obj = { id:'x', type:'photo', x:layout.origin.x+box.x+15, y:layout.origin.y+box.y+15, w:40, h:40 }
      assert.deepEqual(packingDropPatch(asset, obj), {packingSlot: slot})
      assert.equal(packingDropPatch(asset, {...obj, packingSlot:slot}), null)
      assert.deepEqual(packingDropPatch(asset, {...obj, x:0, y:0, packingSlot:slot}), {packingSlot:null})
      assert.equal(packingDropPatch(asset, {...obj,type:'text'}), null)
      assert.equal(packingDropPatch(asset, {...obj,locked:true}), null)
    }
  }
})

test('펜 탭은 해당 영역 색만 적용하고 이동한 획은 일반 필기로 남긴다', () => {
  for (const direction of ['portrait','landscape']) {
    const asset = `remote-packing-list-v6-${direction}`, layout = packingLayout(asset)
    const inside = {x:layout.origin.x + layout.interiors[0].x + 30, y:layout.origin.y + layout.interiors[0].y + 30}
    const frame = {x:layout.origin.x + 7, y:layout.origin.y + 60}
    const action = packingTapColor(asset,[inside],[], '#123456',1)
    assert.equal(action.objects[0].packingColorRegion,'interior-0')
    assert.deepEqual(packingTapColor(asset,[inside],[action.objects[0]], '#123456',1), {type:'removeObjects', ids:[action.objects[0].id]})
    assert.equal(packingTapColor(asset,[frame],[], '#123456',1).objects[0].packingColorRegion,'case-0')
    assert.equal(packingTapColor(asset,[inside,{x:inside.x+30,y:inside.y}],[], '#123456',1),null)
    assert.equal(packingTapColor(asset,[{x:0,y:0}],[], '#123456',1),null)
  }
})


test('새 손잡이 속지는 기존 캐리어와 같은 수납·색칠 좌표를 쓴다', () => {
  for (const direction of ['portrait', 'landscape']) {
    const previous = `remote-packing-list-v6-${direction}`, current = `remote-packing-list-v7-${direction}`
    assert.deepEqual(packingLayout(current), packingLayout(previous))
    const photo = {id:'p',type:'photo',x:0,y:0,w:30,h:30}
    assert.deepEqual(packingSlotPatch(current, photo, 1), packingSlotPatch(previous, photo, 1))
  }
})


test('같은 색을 다시 누르면 채우기를 해제하고 되돌리기·다시 실행으로 복원한다', () => {
  for (const direction of ['portrait', 'landscape']) {
    const asset = `remote-packing-list-v8-${direction}`, layout = packingLayout(asset)
    const inside = { x:layout.origin.x + layout.interiors[0].x + 30, y:layout.origin.y + layout.interiors[0].y + 30 }
    let state = createInitialState({pages:[{id:'page',objects:[]}]}, 'page')
    const action = () => packingTapColor(asset, [inside], state.doc.pages[0].objects, '#aabbcc', 1)
    state = editorReducer(state, action())
    assert.equal(state.doc.pages[0].objects[0].fill, '#aabbcc')
    state = editorReducer(state, packingTapColor(asset, [inside], state.doc.pages[0].objects, '#AABBCC', 1))
    assert.equal(state.doc.pages[0].objects.length, 0)
    state = editorReducer(state, {type:'undo'})
    assert.equal(state.doc.pages[0].objects[0].fill, '#aabbcc')
    state = editorReducer(state, {type:'redo'})
    assert.equal(state.doc.pages[0].objects.length, 0)
  }
})

test('리듀서는 사진의 수납 슬롯을 변형·복제·붙여넣기 뒤 재계산한다', () => {
  const asset = 'remote-packing-list-v8-portrait'
  const layout = packingLayout(asset)
  const center = box => ({ x: layout.origin.x + box.x + box.width / 2, y: layout.origin.y + box.y + box.height / 2 })
  const object = { id: 'photo-1', type: 'photo', x: 0, y: 0, w: 40, h: 40, rotation: 0, opacity: 1 }
  let state = createInitialState({ pages: [{ id: 'page', backgroundAssetId: asset, objects: [object] }] }, 'page')

  state = editorReducer(state, { type: 'updateObject', id: object.id, patch: center(layout.interiors[0]), record: true })
  assert.equal(state.doc.pages[0].objects[0].packingSlot, 0)
  state = editorReducer(state, { type: 'updateObject', id: object.id, patch: { x: 0, y: 0 }, record: true })
  assert.equal(state.doc.pages[0].objects[0].packingSlot, null)

  state = editorReducer(state, { type: 'updateObject', id: object.id, patch: center(layout.interiors[1]), record: true })
  state = editorReducer(state, { type: 'duplicateObjects', ids: [object.id] })
  assert.equal(state.doc.pages[0].objects.at(-1).packingSlot, 1)
  state = editorReducer(state, { type: 'pasteObjects', objects: [{ ...object, id: 'pasted', ...center(layout.interiors[0]) }] })
  assert.equal(state.doc.pages[0].objects.at(-1).packingSlot, 0)
})
