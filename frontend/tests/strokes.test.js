import test from 'node:test'
import assert from 'node:assert/strict'
import { createStroke, penContour, strokePath } from '../src/editor/utils/strokes.js'
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

test('작은 동그라미도 각지지 않게 점 사이를 곡선으로 잇는다', () => {
  // 반지름 6에 점 8개뿐인 빠른 동그라미
  const circle = Array.from({ length: 9 }, (_, i) => ({ x: 20 + 6 * Math.cos(i * Math.PI / 4), y: 20 + 6 * Math.sin(i * Math.PI / 4), pressure: 1 }))
  const path = strokePath(circle)
  assert.equal((path.match(/Q/g) ?? []).length, circle.length - 2)
  assert.doesNotMatch(path.slice(1, -20), /L/)
  assert.equal(strokePath(circle.slice(0, 2)), `M${circle[0].x} ${circle[0].y}L${circle[1].x} ${circle[1].y}`)
  // 붓 · 만년필 윤곽: 아주 얇게 그려 가운데 선만 보면, 점 사이에서도 현(직선)이 아니라 원 가까이를 지난다
  const nums = penContour(circle, 0.02, 'ball').match(/-?[\d.]+/g).map(Number)
  const radii = []
  for (let i = 0; i + 1 < nums.length; i += 2) radii.push(Math.hypot(nums[i] - 20, nums[i + 1] - 20))
  // 직선으로 이으면 대부분(약 80%)이 현 쪽으로 들어가 반지름 5.8 아래, 곡선이면 시작 · 끝 구간 몇 점뿐이다
  const inside = radii.filter(r => r < 5.8).length / radii.length
  assert.ok(inside < 0.2, `안쪽으로 들어간 점 ${Math.round(inside * 100)}%`)
})
