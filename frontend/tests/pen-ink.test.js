import test from 'node:test'
import assert from 'node:assert/strict'
import { inkOpacity, inkPaths, strokeInkLayers, inkLevels } from '../src/editor/utils/penInk.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { createStrokePreview } from '../src/editor/utils/strokePreview.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

test('짧은 붓펜 획은 진하고 긴 획 뒤쪽만 옅어지며 최소 농도를 유지한다', () => {
  assert.equal(inkOpacity('brush', 0), inkOpacity('brush', 100))
  assert.ok(inkOpacity('brush', 160) > inkOpacity('brush', 300))
  assert.ok(inkOpacity('brush', 300) > inkOpacity('brush', 450))
  assert.ok(inkOpacity('brush', 10000) >= 0.55)
  assert.ok(inkOpacity('brush', 0) > 0.95)
})

test('만년필은 저장 버전과 임시 미리보기에서도 전체 획을 불투명하게 채운다', () => {
  for (const version of [2, 3]) for (const preview of [false, true]) {
    assert.deepEqual(inkLevels('fountain', version, preview), [1])
    for (let d = 0; d <= 200; d++) assert.equal(inkOpacity('fountain', d, { length: 200 }), 1)
    const points = [{ x: 0, y: 0, pressure: 0.9 }, { x: 100, y: 20, pressure: 1.1 }]
    const layers = strokeInkLayers([{ points }], 8, 'fountain', version, preview)
    assert.equal(layers.length, 1); assert.ok(layers[0].length)
  }
})

test('완성 구간의 재질 경로는 캐시되고 저장·출력 직렬화 후에도 같다', () => {
  const points = Array.from({ length: 220 }, (_, i) => ({ x: i * 3, y: 50 + Math.sin(i / 13) * 10, pressure: 1 }))
  const parts = createStrokePreview().snapshot(points)
  for (const kind of ['fountain', 'brush']) {
    assert.equal(inkPaths(parts[0], 16, kind), inkPaths(parts[0], 16, kind))
    const object = createStroke(points, { id: kind, kind, width: 16 })
    const exported = createExportSnapshot({ objects: [object] }).objects[0]
    assert.deepEqual(strokeInkLayers([{ points: object.points }], 16, kind), strokeInkLayers([{ points: exported.points }], 16, kind))
  }
})

test('영역 지우기로 남은 붓펜 꼬리가 새 획처럼 진해지지 않는다', () => {
  const object = createStroke([{ x: 20, y: 50 }, { x: 620, y: 50 }], { id: 'ink', kind: 'brush', width: 16 })
  const session = createEraserSession([object], 8, 'area')
  session.move({ x: 350, y: 50 })
  const fragments = session.replacements().ink
  assert.equal(fragments.length, 2)
  assert.ok(fragments[1].inkStartDistance > 330)
  assert.ok(inkOpacity('brush', fragments[1].inkStartDistance) < 0.75)
  assert.equal(createExportSnapshot({ objects: fragments }).objects[1].inkStartDistance, fragments[1].inkStartDistance)
})


// 만년필 · 붓펜은 불투명도 100(농도 한 단계)으로 그린다(2026-11-02). 미리보기도 같은 한 단계다.
test('만년필 · 붓펜은 미리보기와 정밀 렌더 모두 불투명도 100 한 겹이며 다시 렌더해도 경로와 데이터가 유지된다', () => {
  const parts = [{ points: Array.from({ length: 120 }, (_, i) => ({ x: i, y: Math.sin(i / 8) * 5, pressure: .9, force: .4 })) }]
  const original = JSON.stringify(parts)
  for (const kind of ['fountain', 'brush']) {
    const before = strokeInkLayers(parts, 8, kind, 3)
    const preview = strokeInkLayers(parts, 8, kind, 3, true)
    assert.equal(preview.length, 1)
    assert.deepEqual(inkLevels(kind, 3), [1]); assert.deepEqual(inkLevels(kind, 3, true), [1])
    assert.deepEqual(strokeInkLayers(parts, 8, kind, 3), before)
  }
  assert.equal(JSON.stringify(parts), original)
})
