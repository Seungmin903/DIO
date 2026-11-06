import test from 'node:test'
import assert from 'node:assert/strict'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { encodeElement, decodeElement, isUuid } from '../src/collaboration/canvasElements.js'
import { canvasDelta } from '../src/collaboration/canvasApi.js'
import { createCanvasSession } from '../src/collaboration/canvasSession.js'

test('영역 지우기의 미리보기와 확정 조각은 서버 UUID 계약을 따르고 복원 정보를 보존한다', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const source = createStroke([{ x: 10, y: 50, pressure: 1 }, { x: 100, y: 50, pressure: 1 }], { id, kind: 'ball', width: 4 })
  const session = createEraserSession([source], 8, 'area')
  session.move({ x: 55, y: 50 })
  const preview = session.replacements()[id]
  assert.equal(preview.length, 2)
  assert.ok(preview.every(fragment => isUuid(fragment.id)))
  assert.equal(new Set(preview.map(fragment => fragment.id)).size, 2)
  assert.equal(session.replacements()[id][0], preview[0])
  const committed = session.finish().replacements[id]
  assert.equal(committed[0], preview[0])
  const delta = canvasDelta([source], committed)
  assert.equal(delta.next.size, 2)
  assert.equal(delta.old.has(id), true)
  assert.equal(delta.next.has(id), false)
  assert.equal(delta.touched.length, 3)
  for (const fragment of committed) {
    const encoded = encodeElement(fragment)
    const restored = decodeElement({ ...encoded, version: 1 })
    assert.equal(restored.id, fragment.id)
    assert.equal(restored.eraserFragment, true)
    assert.deepEqual(restored.points, fragment.points)
  }
})

test('영역 지우기 조각은 실제 저장 세션에서 원본 삭제와 UUID 조각 생성으로 전송되고 다시 열린다', async () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const pageId = '10000000-0000-4000-8000-000000000001'
  const diaryId = '20000000-0000-4000-8000-000000000001'
  const source = createStroke([{ x: 10, y: 50, pressure: 1 }, { x: 100, y: 50, pressure: 1 }], { id, kind: 'ball', width: 4 })
  let rows = [{ ...encodeElement(source), pageId, version: 0, sortKey: 1 }], sent
  const api = {
    load: async () => structuredClone(rows),
    history: async () => ({ items: [], nextUndo: null, nextRedo: null }),
    apply: async (_page, body) => {
      sent = body
      assert.deepEqual(body.changes.deleteElementIds, [id])
      assert.equal(body.changes.creates.length, 2)
      assert.ok(body.changes.creates.every(row => isUuid(row.elementId)))
      rows = body.changes.creates.map((row, index) => ({ ...row, pageId, version: 0, sortKey: index + 1 }))
      return { items: structuredClone(rows) }
    },
  }
  const memory = new Map()
  const storage = { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => memory.set(key, value) }
  const session = createCanvasSession({ api, storage, key: 'test', pageId, diaryId, createId: () => 'command' })
  await session.restore([source]); await session.synchronize()
  const eraser = createEraserSession([source], 8, 'area')
  eraser.move({ x: 55, y: 50 })
  const fragments = eraser.finish().replacements[id]
  await session.enqueue({ id: 'erase-1', pageId, before: [source], after: fragments })
  const result = await session.synchronize()
  assert.ok(sent)
  assert.equal(result.status, 'saved')
  assert.deepEqual(result.objects.map(row => row.id), fragments.map(row => row.id))
  assert.ok(result.objects.every(row => row.eraserFragment === true))
})
