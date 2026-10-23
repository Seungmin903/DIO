import test from 'node:test'
import assert from 'node:assert/strict'
import { createStroke } from '../src/editor/utils/strokes.js'
import { DEFAULT_HIGHLIGHTER_SETTINGS, DEFAULT_PEN_SETTINGS } from '../src/editor/utils/penSettings.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { createHighlighterHold, STRAIGHT_HOLD_MS } from '../src/editor/utils/strokeAssist.js'

function holdHarness(zoom = 1) {
  let time = 0, id = 0
  const timers = new Map(), lines = []
  const hold = createHighlighterHold({ start: { x: 10, y: 20 }, zoom, onStraight: (points) => lines.push(points),
    schedule: (callback, delay) => { timers.set(++id, { callback, at: time + delay }); return id },
    unschedule: (key) => timers.delete(key),
  })
  return { hold, lines, tick(ms) {
    time += ms
    for (const [key, timer] of timers) if (timer.at <= time) { timers.delete(key); timer.callback() }
  } }
}

test('끝점 정지 600ms 이후 시작·끝만 남기고 미세 떨림과 직선 끝점 이동을 지원한다', () => {
  const h = holdHarness()
  h.hold.move({ x: 40, y: 80 })
  h.tick(300)
  h.hold.move({ x: 100, y: 100 })
  h.tick(STRAIGHT_HOLD_MS - 1)
  assert.equal(h.lines.length, 0)
  h.hold.move({ x: 102, y: 102 })
  h.tick(1)
  assert.deepEqual(h.lines[0], [{ x: 10, y: 20 }, { x: 102, y: 102 }])
  h.hold.move({ x: 150, y: 110 })
  assert.deepEqual(h.lines.at(-1), [{ x: 10, y: 20 }, { x: 150, y: 110 }])
})

test('빠른 해제·제스처 취소·짧은 탭은 직선 보정을 실행하지 않는다', () => {
  const h = holdHarness()
  h.hold.move({ x: 50, y: 60 })
  h.tick(300)
  h.hold.cancel()
  h.tick(1000)
  h.hold.move({ x: 100, y: 100 })
  assert.equal(h.lines.length, 0)
  const tap = holdHarness()
  tap.hold.move({ x: 12, y: 22 })
  tap.tick(1000)
  assert.equal(tap.lines.length, 0)
})

test('직선 보정의 정지 허용 범위는 확대 배율과 무관한 화면 픽셀을 사용한다', () => {
  for (const zoom of [0.5, 2]) {
    const h = holdHarness(zoom)
    h.hold.move({ x: 10 + 30 / zoom, y: 20 })
    h.tick(400)
    h.hold.move({ x: 10 + 37 / zoom, y: 20 })
    h.tick(400)
    assert.equal(h.lines.length, 0)
    h.tick(200)
    assert.equal(h.lines.length, 1)
  }
})

test('형광펜 설정은 획에 복사되고 기존 펜·형광펜 설정은 유지된다', () => {
  const settings = { ...DEFAULT_HIGHLIGHTER_SETTINGS }
  const first = createStroke([{ x: 20, y: 30 }, { x: 100, y: 80 }], { ...settings, id: 'first' })
  settings.color = '#FFB3C7'
  settings.width = 40
  settings.lineCap = 'round'
  const next = createStroke([{ x: 20, y: 100 }], settings)
  assert.equal(first.penKind, 'highlighter')
  assert.equal(first.color, '#FFE066')
  assert.equal(first.strokeWidth, 18)
  assert.equal(first.lineCap, 'square')
  assert.equal(next.color, '#FFB3C7')
  assert.equal(next.strokeWidth, 40)
  assert.equal(next.lineCap, 'round')
  assert.deepEqual(DEFAULT_PEN_SETTINGS, { kind: 'fountain', color: '#1D1D1F', width: 2.5 })
})

test('스퀘어 끝의 대각선 모서리와 단일 점이 저장 경계 안에 있다', () => {
  for (const points of [[{ x: 0, y: 0 }], [{ x: 10, y: 10 }, { x: 100, y: 100 }]]) {
    const stroke = createStroke(points, { ...DEFAULT_HIGHLIGHTER_SETTINGS, width: 40 })
    const radius = 40 / Math.SQRT2
    for (const p of stroke.points) {
      assert.ok(p.x >= radius - 1e-10 && p.y >= radius - 1e-10)
      assert.ok(p.x + radius <= stroke.baseWidth + 1e-10)
      assert.ok(p.y + radius <= stroke.baseHeight + 1e-10)
    }
    assert.deepEqual(stroke.points.map((p) => ({ x: p.x + stroke.x, y: p.y + stroke.y })), points)
  }
})

test('형광펜 저장·출력은 끝 모양과 변형·겹침 순서를 보존하며 손상된 끝 모양을 거부한다', async () => {
  const a = createStroke([{ x: 10, y: 20 }, { x: 100, y: 80 }], { ...DEFAULT_HIGHLIGHTER_SETTINGS, id: 'a' })
  const b = { ...a, id: 'b', rotation: 45, opacity: 0.6, lineCap: 'round' }
  const snapshot = createExportSnapshot({ id: 'page', objects: JSON.parse(JSON.stringify([a, b])) })
  a.points[0].x = 999
  const prepared = await prepareExportSnapshot(snapshot, () => assert.fail('형광펜은 미디어 조회 불필요'))
  assert.deepEqual(prepared.objects.map((o) => o.id), ['a', 'b'])
  assert.equal(prepared.objects[0].lineCap, 'square')
  assert.notEqual(prepared.objects[0].points[0].x, 999)
  assert.equal(prepared.objects[1].lineCap, 'round')
  assert.equal(prepared.objects[1].rotation, 45)
  assert.equal(prepared.objects[1].opacity, 0.6)
  prepared.dispose()
  assert.throws(() => createExportSnapshot({ objects: [{ ...b, lineCap: 'broken' }] }), { code: 'EXPORT_GEOMETRY_INVALID' })
})
