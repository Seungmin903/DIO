import test from 'node:test'
import assert from 'node:assert/strict'
import { createCompletedStrokeGeometry } from '../src/editor/utils/completedStrokeGeometry.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { strokeInkLayers } from '../src/editor/utils/penInk.js'
import { feltStrokeLayers } from '../src/editor/utils/feltStroke.js'
import { feltMaterialLayers } from '../src/editor/utils/penMaterials.js'

const stroke = (kind, renderVersion = 3) => createStroke(Array.from({ length: 30 }, (_, i) => ({
  x: 20 + i * 3, y: 50 + Math.sin(i / 3) * 15, pressure: .8 + i / 100,
  force: .5, speed: .1, inkDistance: i * 3,
})), { id: kind, kind, renderVersion, width: 4, materialSeed: 123 })

test('썸네일→본문→재방문은 정확한 동일 경로를 재사용하고 문서를 바꾸지 않는다', () => {
  const cache = createCompletedStrokeGeometry()
  for (const kind of ['fountain', 'brush', 'felt']) for (const version of [2, 3]) {
    const object = stroke(kind, version), before = JSON.stringify(object)
    const actual = kind === 'felt' ? cache.felt(object) : cache.ink(object)
    const expected = kind === 'felt' ? version === 3
      ? feltMaterialLayers([{ points: object.points }], object.strokeWidth, object.materialSeed)
      : feltStrokeLayers([{ points: object.points }], object.strokeWidth)
      : strokeInkLayers([{ points: object.points, startDistance: 0, continuing: false }], object.strokeWidth, kind, version)
    assert.deepEqual(actual, expected)
    assert.equal(kind === 'felt' ? cache.felt(object) : cache.ink(object), actual)
    assert.equal(JSON.stringify(object), before)
  }
})

test('지우개·폭·재질·시작 거리 변경 객체는 이전 경로를 재사용하지 않는다', () => {
  const cache = createCompletedStrokeGeometry(), object = stroke('fountain')
  const previous = cache.ink(object)
  for (const patch of [{ strokeWidth: 8 }, { points: object.points.slice(3) }, { inkStartDistance: 90 }, { renderVersion: 2 }, { penKind: 'brush' }]) {
    const changed = { ...object, ...patch }
    const actual = cache.ink(changed)
    assert.notEqual(actual, previous)
    assert.deepEqual(actual, strokeInkLayers([{ points: changed.points, startDistance: changed.inkStartDistance ?? 0, continuing: false }], changed.strokeWidth, changed.penKind, changed.renderVersion))
  }
})

test('캐시 객체 수·경로 문자열 예산을 넘기지 않으며 초대형 획도 원본 그대로 반환한다', () => {
  const cache = createCompletedStrokeGeometry({ maxChars: 10000, maxEntries: 2 })
  for (let i = 0; i < 20; i++) cache.ink(stroke('fountain'))
  assert.ok(cache.stats().entries <= 2)
  assert.ok(cache.stats().chars <= 10000)
  const tiny = createCompletedStrokeGeometry({ maxChars: 1 })
  const object = stroke('brush')
  assert.deepEqual(tiny.ink(object), strokeInkLayers([{ points: object.points, startDistance: 0, continuing: false }], object.strokeWidth, object.penKind, object.renderVersion))
  assert.equal(tiny.stats().entries, 0)
})
