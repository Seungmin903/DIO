import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHex, PEN_TYPES, penPressure, createPenPressureSampler, readPenForce } from '../src/editor/utils/penSettings.js'
import { createStroke, penContour, PENCIL_GRAIN, strokeOutline } from '../src/editor/utils/strokes.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'
import { createInitialState, getCurrentPage } from '../src/editor/state/editorReducer.js'

test('null 등 손상된 필기 점은 TypeError 대신 내보내기 안내 오류를 반환한다', () => {
  const stroke = createStroke([{ x: 10, y: 20 }], { kind: 'fountain' })
  for (const point of [null, undefined, false, 17]) {
    assert.throws(() => createExportSnapshot({ objects: [{ ...stroke, points: [point] }] }),
      error => error.code === 'EXPORT_GEOMETRY_INVALID' && error.name !== 'TypeError')
  }
})

test('새 재질만 필요한 센서값을 제한된 정밀도로 저장하고 임의 속성은 제외한다', () => {
  const point = { x: 10.12345678, y: 20.98765432, pressure: 0.9179473322047502,
    force: 0.605204701423645, time: 12.34567, speed: 0.12345678, tiltX: 21.123456, tiltY: -32.456789,
    inkDistance: 123.456789, arbitrary: 'not persisted' }
  const modern = createStroke([point], { kind: 'felt', renderVersion: 3 }).points[0]
  assert.equal(modern.force, 0.6052)
  assert.equal(modern.time, 12.3)
  assert.equal(modern.tiltX, 21.1)
  assert.equal(modern.inkDistance, 123.4568)
  assert.equal(modern.pressure, point.pressure)
  assert.ok(!('arbitrary' in modern))
  const legacy = createStroke([point], { kind: 'highlighter' }).points[0]
  assert.deepEqual(Object.keys(legacy).sort(), ['pressure', 'x', 'y'])
  assert.equal(point.force, 0.605204701423645)
})

test('펜 통합 후에도 기존 볼펜·만년필과 구버전 획을 변환하지 않고 복원·출력한다', () => {
  const points = [{ x: 20, y: 30, pressure: 1 }, { x: 100, y: 80, pressure: 0.9 }]
  const objects = ['ball', 'fountain'].flatMap(kind => [1, 2].map(renderVersion => ({
    ...createStroke(points, { id: `${kind}-${renderVersion}`, kind, width: 8 }), renderVersion,
  })))
  const document = { pages: [{ id: 'existing', objects }] }
  const before = JSON.stringify(document)
  const restored = createInitialState(JSON.parse(before))
  const exported = createExportSnapshot(getCurrentPage(restored))
  assert.deepEqual(exported.objects, objects)
  assert.equal(JSON.stringify(document), before)
})

test('펜 설정은 새 획에 복사되고 이전 획 및 이전 버전 획의 모습은 유지된다', () => {
  const points = [{ x: 10, y: 20, pressure: 2.3 }, { x: 80, y: 70, pressure: 0.25 }]
  const settings = { kind: 'brush', color: '#EF476F', width: 16 }
  const first = createStroke(points, settings)
  settings.color = '#0B1957'; settings.width = 1; settings.kind = 'pencil'
  const second = createStroke(points, settings)
  assert.equal(first.penKind, 'brush'); assert.equal(first.color, '#EF476F'); assert.equal(first.strokeWidth, 16)
  assert.equal(second.penKind, 'pencil'); assert.equal(second.strokeWidth, 1)
  assert.equal(createStroke([{ x: 1, y: 1 }]).penKind, 'ball')
  for (const p of first.points) {
    assert.ok(p.x >= 16 * p.pressure / 2)
    assert.ok(p.y >= 16 * p.pressure / 2)
  }
  const snapshot = createExportSnapshot({ objects: [first] })
  assert.equal(snapshot.objects[0].points[0].pressure, 2.3)
  assert.ok(strokeOutline(first.points, first.strokeWidth).endsWith('Z'))
  assert.throws(() => createExportSnapshot({ objects: [{ ...first, points: [{ x: 1, y: 1, pressure: NaN }] }] }), { code: 'EXPORT_GEOMETRY_INVALID' })
})

test('펜별 굵기 범위와 HEX 입력 검증', () => {
  for (const type of PEN_TYPES) for (const speed of [0, 0.5, 10]) {
    const pressure = penPressure(type.id, speed)
    assert.ok(pressure > 0 && pressure <= 2.3)
  }
  assert.equal(normalizeHex('abc'), '#AABBCC')
  assert.equal(normalizeHex(' #ef476f '), '#EF476F')
  for (const input of ['#GGGGGG', '#12345', 'red', '']) assert.equal(normalizeHex(input), null)
})

test('질감 경로는 반복 생성·저장 후에도 같고 짧은 획에서 유한한 좌표를 유지한다', () => {
  for (const points of [
    [{ x: 1, y: 1 }, { x: 1, y: 1 }],
    [{ x: 0, y: 0, pressure: 2.3 }, { x: 30, y: 20, pressure: 0.4 }, { x: 30, y: 50, pressure: 1 }],
  ]) {
    for (const kind of ['fountain', 'brush']) {
      const stroke = createStroke(points, { kind, width: 16 })
      const restored = createExportSnapshot({ objects: [stroke] }).objects[0]
      const path = penContour(stroke.points, 16, kind)
      assert.equal(path, penContour(restored.points, 16, kind))
      assert.ok(!/NaN|Infinity/.test(path))
      assert.equal(restored.renderVersion, 2)
    }
  }
  const horizontal = [{ x: 0, y: 0, pressure: 1 }, { x: 30, y: 0, pressure: 1 }]
  assert.notEqual(penContour(horizontal, 8, 'fountain'), penContour(horizontal, 8, 'brush'))
  assert.equal(PENCIL_GRAIN.length, 80)
})

test('두 끝점만 수집된 빠른 붓펜 획도 중간 몸통 굵기를 유지한다', () => {
  const path = penContour([{ x: 0, y: 0, pressure: 1 }, { x: 100, y: 0, pressure: 1 }], 10, 'brush')
  const coordinates = path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number)
  const ys = coordinates.filter((_, i) => i % 2 === 1)
  assert.ok(Math.max(...ys) - Math.min(...ys) >= 9.5)
})

test('실제 필압은 속도보다 우선하고 만년필은 붓펜보다 굵기 변화가 작다', () => {
  for (const kind of ['fountain', 'brush']) {
    assert.equal(penPressure(kind, 0, 0.4), penPressure(kind, 10, 0.4))
    assert.ok(penPressure(kind, 1, 0.1) < penPressure(kind, 1, 0.9))
  }
  assert.ok(penPressure('fountain', 0, 1) / penPressure('fountain', 0, 0) < 1.3)
  assert.ok(penPressure('brush', 0, 1) / penPressure('brush', 0, 0) > 5)
  assert.ok(penPressure('fountain', 0) / penPressure('fountain', 10) < 1.15)
  assert.ok(penPressure('brush', 0) / penPressure('brush', 10) < 1.35)
})

test('필압 미지원·잘못된 값·마우스를 구분하고 해제의 0으로 인위적인 끝점을 만들지 않는다', () => {
  for (const force of [undefined, NaN, Infinity, -1, 2]) assert.equal(readPenForce({ force }), null)
  assert.equal(readPenForce({ pointerType: 'mouse', pressure: 0.5 }), null)
  assert.equal(readPenForce({ pointerType: 'pen', pressure: 0.5 }), 0.5)
  const missing = createPenPressureSampler('brush')
  missing.sample({ force: 0 }); missing.sample({})
  assert.equal(missing.report().source, 'speed-fallback')
  const actual = createPenPressureSampler('brush')
  const before = actual.sample({ force: 0.6 })
  assert.equal(actual.sample({ force: 0, isRelease: true }), before)
  assert.equal(actual.sample({}), before, '일시적인 센서값 누락은 마지막 실측값을 유지한다')
  assert.ok(actual.sample({ force: 0.05 }, 0, 16) < before)
  assert.deepEqual(actual.report(), { source: 'force', samples: 2, min: 0.05, max: 0.6 })
})
