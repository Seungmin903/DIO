import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeDocStrokes, decodePage, encodeDocStrokes, encodePage } from '../src/editor/utils/strokeCodec.js'
import { brushSeed } from '../src/editor/utils/pencilSeed.js'
import { strokePath } from '../src/editor/utils/strokes.js'

const pencil = (extra = {}) => ({
  id: 's1', type: 'stroke', penKind: 'pencil', x: 12.34, y: 56.78, w: 100, h: 50,
  points: [
    { x: 10.123456789012345, y: 20.049999999999997, pressure: 0.8123456789, force: 0.1234, time: 100.5, speed: 1.2345, tiltX: 12.3, tiltY: -4.5, inkDistance: 0 },
    { x: 11.987654321098765, y: 21.111111111111111, pressure: 0.8234567891, force: 0.2345, time: 131.1, speed: 2.3456, tiltX: 12.4, tiltY: -4.4, inkDistance: 2.1234 },
    { x: 9.5, y: 19.25, pressure: 1.25, force: 0, time: 162.7, speed: 0, tiltX: 0, tiltY: 0, inkDistance: 4.5 },
  ],
  ...extra,
})
const page = (...objects) => ({ id: 'p', objects })
const roundTrip = (object) => decodePage(JSON.parse(JSON.stringify(encodePage(page(object))))).objects[0]

test('센서 값은 그대로 복원되고 좌표 오차는 0.001px 눈금의 절반 이내다', () => {
  const source = pencil()
  const back = roundTrip(source)
  source.points.forEach((point, index) => {
    for (const key of ['force', 'time', 'speed', 'tiltX', 'tiltY', 'inkDistance']) assert.equal(back.points[index][key], point[key])
    assert.ok(Math.abs(back.points[index].x - point.x) <= 0.0005)
    assert.ok(Math.abs(back.points[index].y - point.y) <= 0.0005)
    assert.ok(Math.abs(back.points[index].pressure - point.pressure) <= 0.00005)
  })
})

test('첫 점은 원본 그대로라 연필 시드가 변하지 않는다', () => {
  const source = pencil()
  const back = roundTrip(source)
  assert.deepEqual(back.points[0], source.points[0])
  assert.equal(brushSeed(back.points[0]), brushSeed(source.points[0]))
})

test('점 외의 속성은 유지되고 packedPoints 가 남지 않는다', () => {
  const back = roundTrip(pencil({ grainOrigin: { x: -1, y: -2, seed: 0.5 } }))
  assert.deepEqual(back.grainOrigin, { x: -1, y: -2, seed: 0.5 })
  assert.equal(back.packedPoints, undefined)
  assert.equal(back.id, 's1')
})

test('압축하면 points 를 저장하지 않고 크기가 줄어든다', () => {
  const points = Array.from({ length: 200 }, (_, i) => ({ x: i * 1.123456789, y: i * 0.987654321, pressure: 0.5 + i / 1000 }))
  const source = pencil({ points })
  const encoded = encodePage(page(source)).objects[0]
  assert.equal(encoded.points, undefined)
  assert.ok(JSON.stringify(encoded).length < JSON.stringify(source).length / 2)
})

test('눈금을 정할 수 없는 획은 원본 그대로 둔다', () => {
  const cases = [
    { points: [{ x: 1, y: 2, seed: 0.5 }, { x: 2, y: 3, seed: 0.5 }] },
    { points: [{ x: 1, y: 2 }, { x: 2, y: 3, pressure: 1 }] },
    { points: [{ x: 1, y: 2 }, { x: null, y: 3 }] },
    { points: [{ x: 1, y: 2 }, { x: 'a', y: 3 }] },
    { points: [{ x: 1, y: 2 }, { x: 1e300, y: 3 }] },
  ]
  for (const extra of cases) {
    const source = pencil(extra)
    assert.equal(encodePage(page(source)).objects[0], source)
  }
})

test('점 하나짜리 획, 다른 객체, 예전 형식은 그대로 지나간다', () => {
  const dot = pencil({ points: [{ x: 1.23456, y: 2.34567 }] })
  const sticker = { id: 'k', type: 'sticker', x: 1 }
  const encoded = encodePage(page(dot, sticker)).objects
  assert.equal(encoded[0], dot)
  assert.equal(encoded[1], sticker)
  const legacy = pencil()
  assert.equal(decodePage(page(legacy)).objects[0], legacy)
})

test('이미 압축한 값을 다시 거쳐도 값이 변하지 않는다', () => {
  const once = roundTrip(pencil())
  assert.deepEqual(roundTrip(once).points, once.points)
})

test('복원한 점으로 그린 경로는 렌더 정밀도 안에서 같다', () => {
  const points = Array.from({ length: 50 }, (_, i) => ({ x: 100 + Math.sin(i / 3) * 40.123456, y: 50 + i * 1.987654, pressure: 1 }))
  const back = roundTrip(pencil({ points })).points
  const numbers = (path) => path.match(/-?\d+(\.\d+)?/g).map(Number)
  const a = numbers(strokePath(points)), b = numbers(strokePath(back))
  assert.equal(a.length, b.length)
  a.forEach((value, index) => assert.ok(Math.abs(value - b[index]) <= 0.002, `${index}: ${value} ${b[index]}`))
})

test('문서 단위 변환은 페이지가 없는 값도 안전하게 넘긴다', () => {
  assert.equal(encodeDocStrokes(null), null)
  assert.equal(decodeDocStrokes(undefined), undefined)
  const doc = { id: 'd', pages: [page(pencil())] }
  const back = decodeDocStrokes(JSON.parse(JSON.stringify(encodeDocStrokes(doc))))
  assert.equal(back.pages[0].objects[0].points.length, 3)
})
