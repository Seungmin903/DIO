import test from 'node:test'
import assert from 'node:assert/strict'
import { createStroke, penContour } from '../src/editor/utils/strokes.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createInitialState, editorReducer, getCurrentPage } from '../src/editor/state/editorReducer.js'
import { thickPenCases, penCasePoints } from './fixtures/thick-pen-cases.js'
import { createStrokePreview, previewGeometry } from '../src/editor/utils/strokePreview.js'

function triangles(path) {
  return (path.match(/M[^Z]+Z/g) ?? []).map(part => {
    const values = part.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number)
    assert.ok(values.length >= 6)
    return Array.from({ length: values.length / 2 }, (_, i) => ({ x: values[i * 2], y: values[i * 2 + 1] }))
  })
}
const area = polygon => polygon.reduce((sum, a, i) => { const b = polygon[(i + 1) % polygon.length]; return sum + a.x * b.y - b.x * a.y }, 0)

test('만년필 방향별 몸통 굵기 차이는 18% 이내이고 되짚기에서도 유한한 윤곽을 유지한다', () => {
  const widths = []
  for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4]) {
    const dx = Math.cos(angle), dy = Math.sin(angle)
    const path = penContour([{ x: 0, y: 0, pressure: 1 }, { x: dx * 100, y: dy * 100, pressure: 1 }], 16, 'fountain')
    const offsets = triangles(path).flat().map(p => p.x * -dy + p.y * dx)
    widths.push(Math.max(...offsets) - Math.min(...offsets))
  }
  assert.ok(Math.max(...widths) / Math.min(...widths) < 1.18)
})

// 수직 단면으로 실제 채움 폭을 측정한다. 테이퍼 구현식과 독립적인 기하 검증이다.
function thicknessAt(path, x) {
  const ys = []
  for (const triangle of triangles(path)) for (let i = 0; i < triangle.length; i++) {
    const a = triangle[i], b = triangle[(i + 1) % triangle.length]
    if (a.x === b.x || x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) continue
    ys.push(a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x))
  }
  return ys.length ? Math.max(...ys) - Math.min(...ys) : 0
}

test('일정한 압력으로 멈춘 붓펜은 시작·끝에서 임의로 가늘어지지 않는다', () => {
  const path = penContour([{ x: 0, y: 0, pressure: 1 }, { x: 100, y: 0, pressure: 1 }], 16, 'brush')
  assert.ok(thicknessAt(path, 98) >= 15.9)
  assert.ok(thicknessAt(path, 2) >= 15.9)
  assert.ok(thicknessAt(path, 84) >= 15.9)
  assert.ok(Math.abs(thicknessAt(path, 98) - thicknessAt(path, 50)) < 0.1)
})

test('붓펜은 끝으로 갈수록 입력 압력이 감소한 경우에만 가늘어진다', () => {
  const path = penContour([{ x: 0, y: 0, pressure: 1 }, { x: 70, y: 0, pressure: 1 }, { x: 100, y: 0, pressure: 0.18 }], 16, 'brush')
  assert.ok(thicknessAt(path, 98) < thicknessAt(path, 90))
  assert.ok(thicknessAt(path, 90) < thicknessAt(path, 75))
  assert.ok(thicknessAt(path, 98) > 2)
})

test('붓펜의 짧은 획과 최소·중간·최대 굵기는 유한한 채움을 유지한다', () => {
  for (const width of [1, 8, 16]) for (const length of [0.5, 2, 6, 12, 100]) {
    const path = penContour([{ x: 0, y: 0 }, { x: length, y: 0 }], width, 'brush')
    assert.doesNotMatch(path, /NaN|Infinity/)
    assert.ok(thicknessAt(path, length / 2) > 0)
  }
})

test('분할 미리보기와 최종 꼬리는 같은 압력을 같은 굵기로 표시한다', () => {
  const points = Array.from({ length: 240 }, (_, x) => ({ x, y: 0, pressure: 1 }))
  const parts = createStrokePreview().snapshot(points)
  for (const part of parts) {
    const { outline } = previewGeometry(part, { kind: 'brush', width: 16 })
    const thickness = thicknessAt(outline, part.points.at(-1).x - 2)
    assert.ok(thickness >= 15.9)
  }
})

for (const kind of ['fountain', 'brush']) test(`${kind} 최소·중간·최대 굵기의 회전·왕복 경로가 같은 winding과 저장 경계를 유지한다`, () => {
  for (const width of [1, 8, 16]) for (const fixture of thickPenCases) {
    const points = penCasePoints(fixture, kind), before = JSON.stringify(points)
    const stroke = createStroke(points, { kind, width, id: 'stroke' })
    const path = penContour(stroke.points, width, kind), polygons = triangles(path)
    assert.ok(polygons.length > 0)
    for (const polygon of polygons) {
      assert.ok(area(polygon) > 0, '겹친 도형의 winding이 상쇄되지 않아야 한다')
      for (const p of polygon) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y))
        assert.ok(p.x >= -0.001 && p.y >= -0.001 && p.x <= stroke.baseWidth + 0.001 && p.y <= stroke.baseHeight + 0.001, 'SVG 경계 밖으로 돌출해 잘리지 않아야 한다')
      }
    }
    assert.equal(JSON.stringify(points), before)
    assert.equal(penContour(JSON.parse(JSON.stringify(stroke)).points, width, kind), path)
  }
})

test('별도 채움 도형을 지우개가 하나로 잇지 않아 굽은 획 안의 빈 공간을 지우지 않는다', () => {
  for (const kind of ['fountain', 'brush']) {
    const stroke = createStroke([{ x: 30, y: 20, pressure: 1 }, { x: 30, y: 180, pressure: 1 }, { x: 180, y: 180, pressure: 1 }, { x: 180, y: 20, pressure: 1 }], { kind, width: 16, id: kind })
    assert.deepEqual(createEraserSession([stroke], 0).move({ x: 105, y: 70 }), [])
    assert.deepEqual(createEraserSession([stroke], 0).move({ x: 30, y: 100 }), [kind])
  }
})

test('최대 굵기 획의 영역 지우기·Undo/Redo와 재실행 후 데이터가 보존된다', () => {
  for (const kind of ['fountain', 'brush']) {
    const stroke = createStroke([{ x: 20, y: 80, pressure: 1.5 }, { x: 100, y: 80, pressure: 1.5 }, { x: 220, y: 80, pressure: 1.5 }], { id: kind, kind, width: 16 })
    let state = createInitialState({ pages: [{ id: 'p', objects: [stroke] }] })
    const before = structuredClone(state.doc), eraser = createEraserSession([stroke], 8, 'area')
    eraser.move({ x: 110, y: 80 })
    state = editorReducer(state, eraser.finish())
    assert.equal(getCurrentPage(state).objects.length, 2)
    const after = JSON.parse(JSON.stringify(state.doc))
    assert.ok(getCurrentPage(createInitialState(after)).objects.every(object => object.penKind === kind && object.strokeWidth === 16))
    state = editorReducer(state, { type: 'undo' })
    assert.deepEqual(state.doc, before)
    state = editorReducer(state, { type: 'redo' })
    assert.deepEqual(state.doc, after)
  }
})
