import test from 'node:test'
import assert from 'node:assert/strict'
import { createStroke, strokePath } from '../src/editor/utils/strokes.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'

test('대각선·수평선·점의 페이지 좌표가 저장 후에도 같고 펜 두께가 경계 안에 있다', () => {
  for (const points of [[{ x: 80, y: 120 }, { x: 300, y: 140 }], [{ x: 20, y: 60 }, { x: 400, y: 60 }], [{ x: 0, y: 0 }]]) {
    const stroke = JSON.parse(JSON.stringify(createStroke(points, { id: 'stroke' })))
    assert.deepEqual(stroke.points.map((p) => ({ x: stroke.x + p.x, y: stroke.y + p.y })), points)
    assert.ok(stroke.w >= 20 && stroke.h >= 20)
    for (const p of stroke.points) {
      assert.ok(p.x >= stroke.strokeWidth / 2 && p.y >= stroke.strokeWidth / 2)
      assert.ok(p.x <= stroke.baseWidth - stroke.strokeWidth / 2)
      assert.ok(p.y <= stroke.baseHeight - stroke.strokeWidth / 2)
    }
    assert.ok(strokePath(stroke.points).startsWith('M'))
  }
})

test('필기를 포함한 PNG 스냅샷은 좌표와 변형을 보존하고 미디어 조회를 하지 않는다', async () => {
  const stroke = { ...createStroke([{ x: 10, y: 20 }, { x: 100, y: 80 }], { id: 'stroke' }), rotation: 45 }
  const snapshot = createExportSnapshot({ id: 'page', objects: [stroke] })
  stroke.points[0].x = 999
  const prepared = await prepareExportSnapshot(snapshot, () => assert.fail('획은 미디어가 아님'))
  assert.equal(prepared.objects[0].rotation, 45)
  assert.notEqual(prepared.objects[0].points[0].x, 999)
  prepared.dispose()
  assert.throws(() => createExportSnapshot({ objects: [{ ...stroke, points: [{ x: NaN, y: 1 }] }] }), { code: 'EXPORT_GEOMETRY_INVALID' })
})
