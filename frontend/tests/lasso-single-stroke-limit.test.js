import test from 'node:test'
import assert from 'node:assert/strict'
import { createStroke, glassOrigin } from '../src/editor/utils/strokes.js'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'
import { collaborationReducer } from '../src/collaboration/collaborationReducer.js'
import { canvasDelta } from '../src/collaboration/canvasApi.js'
import { encodeElement } from '../src/collaboration/canvasElements.js'
import { createCanvasSession } from '../src/collaboration/canvasSession.js'
import { lassoHitIds } from '../src/editor/utils/lassoGeometry.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'

const pageId = '10000000-0000-4000-8000-000000000001', diaryId = '20000000-0000-4000-8000-000000000001'
const uuid = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const legacyStrokes = () => Array.from({ length: 150 }, (_, i) => {
  const stroke = createStroke([{ x: 10 + i * 50, y: 20 }, { x: 20 + i * 50, y: 30 }, { x: 30 + i * 50, y: 20 }],
    { id: uuid(i + 1), kind: 'glass', width: 4 })
  delete stroke.inkOrigin
  return stroke
})
const initial = objects => createInitialState({ id: diaryId, pages: [{ id: pageId, objects }] })
const reduce = (state, action) => collaborationReducer(editorReducer, state, { collaborationId: 'move-one', ...action })
for (const empty of [null, undefined]) test(`ink origin correction preserves ${String(empty)} replacement entries without throwing`, () => {
  const objects = legacyStrokes(), target = objects[0]
  const replacement = { ...target, x: target.x + 40 }
  const state = editorReducer(initial(objects), { type: 'replaceObjects', replacements: { [target.id]: [empty, replacement] } })
  const after = state.doc.pages[0].objects
  assert.equal(after[0], empty)
  assert.equal(after[1].x, replacement.x)
  assert.deepEqual(after[1].inkOrigin, { x: target.x, y: target.y })
  assert.equal(after[2], objects[1])
})
function move(objects, ids = [objects[0].id]) {
  let state = reduce(initial(objects), { type: 'selectExact', ids })
  state = reduce(state, { type: 'checkpoint' })
  for (const offset of [10, 50, 80]) state = reduce(state, { type: 'updateMany',
    patches: Object.fromEntries(ids.map(id => { const object = objects.find(o => o.id === id); return [id, { x: object.x + offset, y: object.y + offset }] })) })
  return reduce(state, { type: 'commitCheckpoint' })
}

test('lasso moves one legacy ink stroke among 150 without changing unrelated strokes or hitting the batch limit', () => {
  const objects = legacyStrokes(), original = JSON.stringify(objects), target = objects[0]
  const ids = lassoHitIds(objects, [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }])
  assert.deepEqual(ids, [target.id])
  const expectedOrigin = { ...glassOrigin(target) }, state = move(objects, ids), after = state.doc.pages[0].objects
  assert.equal(state.collaborationLimitError, undefined)
  assert.equal(state.collaborationEdits.length, 1)
  assert.equal(state.collaborationGesture, null)
  assert.deepEqual(canvasDelta(objects, after).touched, [target.id])
  assert.deepEqual(after[0].inkOrigin, expectedOrigin)
  assert.equal(after[0].x, target.x + 80)
  assert.equal(after[0].points, target.points)
  objects.slice(1).forEach((object, i) => assert.equal(after[i + 1], object))
  assert.equal(JSON.stringify(objects), original)
})

test('single-stroke move is one persisted server update and reopening preserves geometry, ink settings and order', async () => {
  const objects = legacyStrokes(), state = move(objects), edit = state.collaborationEdits[0]
  assert.ok(edit, 'the completed move must reach the save queue')
  let rows = objects.map((object, sortKey) => ({ ...encodeElement(object), pageId, sortKey, version: 1 }))
  const calls = [], disk = new Map()
  const api = { load: async () => structuredClone(rows), history: async () => ({ items: [] }),
    apply: async (page, request) => {
      calls.push(structuredClone(request))
      rows = rows.map(row => { const patch = request.changes.updates?.find(p => p.elementId === row.elementId)
        return patch ? { ...row, ...patch, version: row.version + 1 } : row })
      return { items: structuredClone(rows), operationId: '1', revision: 1 }
    } }
  const session = () => createCanvasSession({ api, storage: { getItem: async key => disk.get(key) ?? null,
    setItem: async (key, value) => disk.set(key, value) }, key: 'lasso-test', pageId, diaryId, createId: () => uuid(999) })
  const first = session()
  await first.restore(objects); await first.enqueue(edit)
  const saved = await first.synchronize()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].changes.updates.length, 1)
  assert.equal(calls[0].changes.updates[0].elementId, objects[0].id)
  assert.equal(first.snapshot().queue.length, 0)
  // JSON storage + fresh session ensure the process-local ink origin cache cannot supply the saved value.
  rows = JSON.parse(JSON.stringify(rows))
  const reopened = session(); await reopened.restore([])
  const loaded = await reopened.synchronize()
  assert.deepEqual(loaded.objects.map(o => o.id), objects.map(o => o.id))
  assert.deepEqual(loaded.objects.map(encodeElement), saved.objects.map(encodeElement))
  const target = loaded.objects[0]
  assert.deepEqual(target.inkOrigin, { x: objects[0].x, y: objects[0].y })
  assert.deepEqual(glassOrigin(target), target.inkOrigin)
  assert.deepEqual(target.points, objects[0].points)
  assert.equal(target.x, objects[0].x + 80)
  const expected = { ...objects[0], x: target.x, y: target.y, inkOrigin: target.inkOrigin }
  assert.deepEqual(encodeElement(target), encodeElement(expected))
  assert.equal(calls.length, 1, 'reopening does not create another edit')
})

for (const transformed of [false, true]) test(`legacy ink eraser fragments retain their original texture mapping through reducer, save and reopen (${transformed ? 'rotated/scaled' : 'plain'})`, async () => {
  const source = createStroke([{ x: 100, y: 100 }, { x: 300, y: 100 }], {
    id: uuid(1), kind: 'glass', width: 4, color: '#123456',
    inkAmount: 0.7, inkSheenAmount: 0.4, inkGlitterColor: '#abcdef',
  })
  // Cover both fragment creation branches, including an old stroke moved before this session.
  source.x += 300; source.y += 120
  if (transformed) { source.rotation = 20; source.w *= 1.3; source.h *= 1.2 }
  delete source.inkOrigin
  const origin = { ...glassOrigin(source) }
  const objects = [...legacyStrokes().slice(1), source], original = JSON.stringify(objects)
  const eraser = createEraserSession(objects, 6, 'area')
  assert.deepEqual(eraser.move({ x: source.x + source.w / 2, y: source.y + source.h / 2 }), [source.id])
  const action = eraser.finish(), pieces = action.replacements[source.id]
  assert.ok(pieces.length >= 2, 'the actual eraser must produce multiple new-ID fragments')
  const previousIds = new Set(objects.map(object => object.id))
  const checkMapping = piece => {
    assert.ok(piece.inkOrigin, 'the fragment must carry a persisted texture origin')
    // Texture coordinates are local point + inkOrigin. A changed bounding box needs the same offset.
    for (const axis of ['x', 'y']) assert.ok(Math.abs((glassOrigin(piece)[axis] - piece[axis]) - (origin[axis] - source[axis])) < 1e-6)
    for (const key of ['penKind', 'color', 'strokeWidth', 'renderVersion', 'materialSeed', 'inkAmount', 'inkSheenAmount', 'inkGlitterColor'])
      assert.deepEqual(piece[key], source[key], `keep ink setting ${key}`)
  }
  for (const piece of pieces) { assert.ok(!previousIds.has(piece.id)); checkMapping(piece) }
  if (transformed) pieces.forEach(piece => assert.deepEqual(piece.inkOrigin, origin))
  else assert.ok(pieces.some(piece => piece.x !== source.x), 'plain fragments exercise the changed bounding box')

  const state = reduce(initial(objects), action), after = state.doc.pages[0].objects
  assert.equal(state.collaborationLimitError, undefined)
  assert.equal(state.collaborationEdits.length, 1)
  assert.deepEqual(after.map(object => object.id), [...objects.slice(0, -1), ...pieces].map(object => object.id))
  objects.slice(0, -1).forEach((object, index) => assert.equal(after[index], object))
  pieces.forEach(piece => checkMapping(after.find(object => object.id === piece.id)))

  let rows = objects.map((object, sortKey) => ({ ...encodeElement(object), pageId, sortKey, version: 1 })), loads = 0
  const calls = [], disk = new Map()
  const api = { load: async () => { loads++; return structuredClone(rows) }, history: async () => ({ items: [] }),
    apply: async (page, request) => {
      calls.push(structuredClone(request))
      const byId = new Map(rows.map(row => [row.elementId, row]))
      for (const id of request.changes.deleteElementIds ?? []) byId.delete(id)
      for (const row of request.changes.creates ?? []) byId.set(row.elementId, { ...row, pageId, version: 0 })
      for (const patch of request.changes.updates ?? []) byId.set(patch.elementId, { ...byId.get(patch.elementId), ...patch, version: patch.version + 1 })
      rows = [...byId.values()].sort((a, b) => a.sortKey - b.sortKey)
      return { items: structuredClone(rows), operationId: '1', revision: 1 }
    } }
  const makeSession = () => createCanvasSession({ api, storage: { getItem: async key => disk.get(key) ?? null,
    setItem: async (key, value) => disk.set(key, value) }, key: 'eraser-roundtrip', pageId, diaryId, createId: () => uuid(999) })
  const first = makeSession()
  await first.restore(objects); await first.enqueue(state.collaborationEdits[0])
  const saved = await first.synchronize()
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].changes.deleteElementIds, [source.id])
  assert.deepEqual(calls[0].changes.creates.map(row => row.elementId), pieces.map(piece => piece.id))
  assert.equal(calls[0].changes.updates?.length ?? 0, 0, 'unrelated legacy strokes must not be normalized')
  assert.equal(first.snapshot().queue.length, 0)

  rows = JSON.parse(JSON.stringify(rows))
  const beforeReload = loads, reopened = makeSession()
  await reopened.restore([])
  const loaded = await reopened.synchronize()
  assert.ok(loads > beforeReload, 'the new session must read the server again')
  assert.deepEqual(loaded.objects.map(encodeElement), saved.objects.map(encodeElement))
  assert.deepEqual(loaded.objects.map(object => object.id), after.map(object => object.id))
  assert.ok(!loaded.objects.some(object => object.id === source.id))
  for (const piece of pieces) {
    const restored = loaded.objects.find(object => object.id === piece.id)
    assert.notEqual(restored.points, piece.points, 'fresh points cannot reuse the process-local fallback origin')
    assert.deepEqual(encodeElement(restored), encodeElement(piece))
    checkMapping(restored)
  }
  assert.equal(calls.length, 1, 'reopening must not write another edit')
  assert.equal(JSON.stringify(objects), original)
})

test('genuine 101-stroke movement is still rejected', () => {
  const objects = legacyStrokes(), state = move(objects, objects.slice(0, 101).map(o => o.id))
  assert.ok(state.collaborationLimitError)
  assert.equal(state.collaborationEdits.length, 0)
  assert.deepEqual(state.doc.pages[0].objects, objects)
})

test('add, duplicate, delete and no-op patches leave unrelated legacy ink unchanged', () => {
  for (const action of [
    { type: 'addObjects', objects: [{ id: uuid(999), type: 'text', text: 'A', x: 1, y: 1, w: 10, h: 10 }] },
    { type: 'duplicateObjects', ids: [uuid(1)] },
    { type: 'removeObjects', ids: [uuid(1)] },
    { type: 'updateObject', id: uuid(1), patch: {} },
  ]) {
    const objects = legacyStrokes(), state = reduce(initial(objects), action)
    assert.equal(state.collaborationLimitError, undefined)
    const after = state.doc.pages[0].objects
    objects.slice(1).forEach(object => assert.equal(after.find(o => o.id === object.id), object))
    if (action.type === 'updateObject') assert.deepEqual(canvasDelta(objects, after).touched, [])
  }
})

test('cancel restores the original stroke and an existing ink origin survives subsequent edits', () => {
  const objects = legacyStrokes()
  let state = reduce(initial(objects), { type: 'checkpoint' })
  state = reduce(state, { type: 'updateObject', id: objects[0].id, patch: { x: objects[0].x + 30 } })
  state = reduce(state, { type: 'revertToCheckpoint' })
  assert.deepEqual(state.doc.pages[0].objects, objects)
  assert.equal(state.collaborationEdits.length, 0)
  const origin = { x: -90, y: -80 }, old = { ...objects[0], inkOrigin: origin }
  state = reduce(initial([old, ...objects.slice(1)]), { type: 'updateObject', id: old.id, patch: { x: old.x + 50 }, record: true })
  assert.equal(state.doc.pages[0].objects[0].inkOrigin, origin)
  assert.deepEqual(canvasDelta([old, ...objects.slice(1)], state.doc.pages[0].objects).touched, [old.id])
})
