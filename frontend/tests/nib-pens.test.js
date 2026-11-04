import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PEN_SETTINGS, PEN_TYPES, penPressure, tiltAmount } from '../src/editor/utils/penSettings.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { brushScale, nibContour, nibCurve, nibPreviewPaths, withDistances, withTaper } from '../src/editor/utils/nibStroke.js'
import { trimEndHook } from '../src/editor/utils/penHook.js'
import { strokePath } from '../src/editor/utils/strokes.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createStrokePreview } from '../src/editor/utils/strokePreview.js'

const line = (x1, y1, x2, y2, n = 20) => Array.from({ length: n + 1 }, (_, i) => ({ x: x1 + (x2 - x1) * i / n, y: y1 + (y2 - y1) * i / n }))
// 외곽선 경로의 꼭짓점 범위
const bounds = path => {
  const numbers = path.match(/-?\d+(\.\d+)?/g).map(Number), xs = numbers.filter((_, i) => i % 2 === 0), ys = numbers.filter((_, i) => i % 2)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

test('펜 종류는 볼펜 · 캘리펜 · 붓펜 · 연필이고 기본은 볼펜이다. 힘 정보가 없으면 볼펜 · 캘리펜 굵기는 그대로이고, 있으면 세 펜 모두 힘 · 기울기를 따른다', () => {
  assert.deepEqual(PEN_TYPES.map(type => type.label), ['볼펜', '캘리펜', '붓펜', '연필'])
  assert.equal(DEFAULT_PEN_SETTINGS.kind, 'ball')
  for (const kind of ['ball', 'calligraphy']) {
    assert.equal(penPressure(kind, 0), 1)
    assert.ok(penPressure(kind, 10, 0.05) < penPressure(kind, 10, 0.22) && penPressure(kind, 10, 0.22) < penPressure(kind, 10, 0.5), '세게 쓸수록 굵다')
    assert.ok(penPressure(kind, 0, 0.22, 1) > penPressure(kind, 0, 0.22), '눕히면 넓다')
    assert.ok(penPressure(kind, 0, null, 1) > 1, '힘 없는 입력도 기울기는 따른다')
  }
  // 붓펜: 힘 정보가 없으면 화면 속도로 살짝 가늘어지고(1.06 ~ 0.78), 있으면 힘이 우선이고 변화 폭이 가장 크다
  assert.equal(penPressure('taperBrush', 0), 1.06)
  assert.equal(penPressure('taperBrush', 20), 0.78)
  assert.ok(penPressure('taperBrush', 20, 0.5) > penPressure('taperBrush', 20, 0.05))
  const range = kind => penPressure(kind, 0, 1) / penPressure(kind, 0, 0)
  assert.ok(range('taperBrush') > range('calligraphy') && range('calligraphy') > range('ball'), '변화 폭: 붓펜 > 캘리펜 > 볼펜')
})

test('캘리펜은 같은 굵기에서 가로획이 세로획보다 가늘다', () => {
  for (const width of [2.5, 8]) {
    const across = bounds(nibContour(createStroke(line(0, 50, 100, 50), { kind: 'calligraphy', width })))
    const down = bounds(nibContour(createStroke(line(50, 0, 50, 100), { kind: 'calligraphy', width })))
    assert.ok(across.h < down.w * 0.75, `${width}: 가로 ${across.h} · 세로 ${down.w}`)
    assert.ok(across.h > 0)
  }
})

test('붓펜은 눌러 시작한 굵은 머리와 길게 빠지는 가는 끝을 갖고 짧은 획과 탭도 사라지지 않는다', () => {
  const width = 4, total = 200
  assert.ok(Math.abs(brushScale(0, total, width) - 1.45) < 1e-9, '머리 1.45D')
  assert.ok(Math.abs(brushScale(100, total, width) - 1.25) < 1e-9, '몸통 1.25D')
  assert.ok(Math.abs(brushScale(total, total, width) * width - 0.5) < 1e-9, '끝은 지름 0.5 까지 뾰족하게(둥근 머리 없음)')
  assert.ok(brushScale(total - 10, total, width) < 1.25, '삐침은 끝에서 길게 빠진다')
  assert.equal(brushScale(total, total, width, { end: false }), 1.25, '그리는 중 앞 구간은 끝 삐침이 없다')
  // 삐침 옆선은 볼록하다: 굵을 때 )( 처럼 오목하게 줄지 않도록 중간 굵기가 직선보다 굵다
  const tail = Math.min(Math.max(7 * width, 8), 0.42 * total), endScale = 0.5 / width
  assert.ok(brushScale(total - tail / 2, total, width) > (1.25 + endScale) / 2)
  // 머리 · 몸통은 획 길이와 무관하다(획이 길어져도 이미 그린 앞부분이 바뀌지 않는다). 짧은 획은 끝만 0.85D
  assert.equal(brushScale(0, 8, width), brushScale(0, 400, width))
  assert.equal(brushScale(3, 30, width), brushScale(3, 400, width))
  assert.ok(brushScale(8, 8, width) >= 0.85 - 1e-9)
  // 아주 가는 펜도 몸통은 굵기 1 아래로 내려가지 않고, 끝만 뾰족해진다
  assert.ok(brushScale(25, 50, 1, { speed: 0.5 }) >= 1 - 1e-9)
  assert.ok(Math.abs(brushScale(50, 50, 1) - 0.5) < 1e-9)
  // 끝 구간은 촘촘히 나눠 굵기가 매끄럽게 줄고, 앞쪽 표본 수는 그대로다
  const curve = line(0, 0, 200, 0, 10).map(p => ({ ...p, inkDistance: p.x }))
  const tapered = withTaper(curve, 10)
  const tailStart = 200 - Math.min(Math.max(7 * 10, 8), 0.42 * 200)
  assert.equal(tapered.filter(p => p.inkDistance <= tailStart - 20).length, curve.filter(p => p.inkDistance <= tailStart - 20).length)
  const inTail = tapered.filter(p => p.inkDistance > tailStart)
  assert.ok(inTail.every((p, i) => !i || p.inkDistance - inTail[i - 1].inkDistance <= 0.75 + 1e-9))
  assert.ok(inTail.every((p, i) => !i || p.pressure <= inTail[i - 1].pressure + 1e-9))
  for (const points of [[{ x: 10, y: 10 }], line(10, 10, 14, 10, 2), line(0, 0, 300, 120)]) {
    const path = nibContour(createStroke(points, { kind: 'taperBrush', width }))
    assert.doesNotMatch(path, /NaN|Infinity/)
    assert.ok(path.length > 0)
  }
  // 머리가 저장 경계 밖으로 나가지 않게 여백을 둔다
  const stroke = createStroke(line(0, 0, 100, 0), { kind: 'taperBrush', width: 10 })
  assert.ok(stroke.h >= 10 * 1.45)
})

test('새 펜도 볼펜과 같은 곡선(이웃 점 가운데를 잇는 2차 곡선)으로 꺾임을 둥글게 잇는다', () => {
  const zigzag = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }]
  const curve = nibCurve(zigzag)
  assert.deepEqual([curve[0].x, curve[0].y], [0, 0])
  assert.deepEqual([curve.at(-1).x, curve.at(-1).y], [30, 10])
  // 꼭짓점(10,10)은 지나지 않고 그 안쪽으로 둥글게 지난다
  assert.ok(!curve.some(p => p.x === 10 && p.y === 10))
  assert.ok(Math.max(...curve.filter(p => p.x > 5 && p.x < 15).map(p => p.y)) < 10)
  assert.ok(curve.length > zigzag.length * 3)
  assert.match(strokePath(zigzag), /Q10 10 15 5/)
})

test('펜을 뗄 때 짧고 급하게 말린 끝은 꺾인 점에서 자르고 의도한 꺾임 · 짧은 획은 그대로 둔다', () => {
  const timed = points => points.map((p, i) => ({ ...p, time: i * 8 }))
  const body = line(0, 0, 100, 0, 25)
  const hooked = timed([...body, { x: 101, y: 1.5 }, { x: 101, y: 3 }])
  assert.equal(trimEndHook(hooked, 1).length, body.length, '3px 남짓 말린 갈고리를 잘라 냄')
  // 같은 꺾임이라도 길면(ㄱ 의 세로획) 그대로
  const corner = timed([...body, ...line(100, 0, 100, 30, 6).slice(1)])
  assert.equal(trimEndHook(corner, 1).length, corner.length)
  // 천천히 꺾으면(멈춤 45ms 이상) 의도한 것으로 본다
  const slow = hooked.map((p, i) => i === hooked.length - 1 ? { ...p, time: p.time + 80 } : p)
  assert.equal(trimEndHook(slow, 1).length, slow.length)
  // 화면에서 20px 보다 짧은 획(점 · 받침)은 건드리지 않는다. 확대하면 같은 페이지 길이도 화면에서 길어진다
  const small = timed([...line(0, 0, 12, 0, 6), { x: 12.5, y: 1.5 }])
  assert.equal(trimEndHook(small, 1).length, small.length)
  // 곧게 끝난 획은 그대로
  assert.equal(trimEndHook(timed(body), 1).length, body.length)
})

test('붓펜은 쓰는 중엔 펜 끝까지 굵게 보이고 뗀 뒤 저장 획에서 끝이 가늘어진다', () => {
  // 천천히 써서 점이 촘촘해도(구간이 여러 개) 쓰는 중 끝에는 삐침이 없다
  const points = withDistances(line(0, 0, 200, 0, 1000).map(p => ({ x: p.x, y: 0 })))
  const parts = createStrokePreview().snapshot(points)
  assert.ok(parts.length > 3)
  // 펜 끝에서 5 떨어진 자리의 위아래 폭(반지름) — x 가 195 근처인 꼭짓점들의 |y|
  const halfHeight = path => {
    const numbers = path.match(/-?\d+(\.\d+)?/g).map(Number), ys = []
    for (let i = 0; i + 1 < numbers.length; i += 2) if (Math.abs(numbers[i] - 195) < 1.5) ys.push(Math.abs(numbers[i + 1]))
    return Math.max(...ys)
  }
  const writing = halfHeight(nibPreviewPaths(parts, 16, 'taperBrush').join(''))
  const saved = halfHeight(nibContour({ points: points.map(({ inkDistance, ...p }) => p), strokeWidth: 16, penKind: 'taperBrush' }))
  assert.ok(writing > 9, '쓰는 중엔 몸통 굵기(반지름 10) 그대로')
  assert.ok(saved < 3, '뗀 뒤엔 끝이 가늘어진다')
})

test('그리는 중 미리보기와 저장 획의 붓펜 외곽선이 같다', () => {
  // 필기 중 점에는 PenInput 이 입력 점 사이 직선 거리의 누적(inkDistance)을 매긴다
  const points = withDistances(line(0, 0, 400, 0, 300).map(p => ({ x: p.x, y: Math.sin(p.x / 30) * 20 })))
  const preview = createStrokePreview()
  const parts = preview.snapshot(points)
  assert.ok(parts.length > 1)
  const live = nibPreviewPaths(parts, 6, 'taperBrush')
  assert.equal(nibPreviewPaths(parts, 6, 'taperBrush')[0], live[0], '끝난 구간 캐시 재사용')
  const whole = bounds(nibContour({ points: points.map(({ inkDistance, ...p }) => p), strokeWidth: 6, penKind: 'taperBrush' }))
  const joined = bounds(live.join(''))
  // 쓰는 중엔 끝 삐침이 없어 끝 쪽 길이만 몸통 반지름(6 × 1.25 / 2)만큼 다르고 높이(파형)는 같다
  assert.ok(Math.abs(whole.w - joined.w) < 6 * 1.25 / 2 + 0.5 && Math.abs(whole.h - joined.h) < 0.5)
})

test('붓펜을 닿은 부분만 지우면 조각은 원래 굵기를 새겨 잘린 끝이 다시 뾰족해지지 않는다', () => {
  const object = createStroke(line(20, 80, 320, 80, 30), { id: 'brush', kind: 'taperBrush', width: 10 })
  const session = createEraserSession([object], 6, 'area')
  session.move({ x: 170, y: 80 })
  const [fragment] = session.finish().replacements.brush
  assert.equal(fragment.penKind, 'taperBrush')
  assert.equal(fragment.taperBaked, true)
  assert.ok(Math.abs(fragment.points.at(-1).pressure - 1.25) < 0.05, '자른 끝은 원래 몸통 굵기')
  assert.ok(fragment.points[0].pressure > 1.4, '처음 끝은 원래 붓 머리')
  assert.deepEqual(withTaper([{ x: 0, y: 0 }], 10).length, 1)
})

test('캘리펜 · 붓펜도 획 지우개에 닿는다', () => {
  for (const kind of ['calligraphy', 'taperBrush']) {
    const object = createStroke(line(20, 80, 320, 80), { id: kind, kind, width: 10 })
    const session = createEraserSession([object], 4)
    assert.deepEqual(session.move({ x: 170, y: 82 }), [kind])
    const miss = createEraserSession([object], 4)
    assert.deepEqual(miss.move({ x: 170, y: 120 }), [])
  }
})

test('필압: 평소 힘에서 슬라이더 굵기가 거의 그대로이고 약하면 가늘고 세면 굵어진다(코덱스 곡선)', () => {
  const near = (value, expected) => assert.ok(Math.abs(value - expected) < 0.02, `${value} ≈ ${expected}`)
  // 볼펜
  near(penPressure('ball', 0, 0.04), 0.76); near(penPressure('ball', 0, 0.22), 1.03); near(penPressure('ball', 0, 0.65), 1.51)
  // 캘리펜
  near(penPressure('calligraphy', 0, 0.04), 0.64); near(penPressure('calligraphy', 0, 0.22), 1.05); near(penPressure('calligraphy', 0, 0.65), 1.72)
  // 붓펜(몸통 렌더는 여기에 1.25 배)
  near(penPressure('taperBrush', 0, 0.04), 0.39); near(penPressure('taperBrush', 0, 0.22), 0.84); near(penPressure('taperBrush', 0, 0.65), 1.78)
  for (const kind of ['ball', 'calligraphy', 'taperBrush']) {
    assert.ok(penPressure(kind, 0, 0.04) > 0.35, '가장 약해도 사라지지 않는다')
    let before = 0
    for (const force of [0.04, 0.1, 0.15, 0.22, 0.3, 0.4, 0.5, 0.65]) { const value = penPressure(kind, 0, force); assert.ok(value >= before, '힘이 세질수록 굵어진다'); before = value }
  }
})

test('기울기: 25° 이하는 0, 55° 이상은 1 로 평소 쓰는 각도(30° 안팎)에서도 반응한다', () => {
  const tilt = degrees => tiltAmount({ tiltX: degrees, tiltY: 0 })
  assert.equal(tilt(25), 0); assert.equal(tilt(10), 0)
  assert.ok(Math.abs(tilt(40) - 0.5) < 1e-9)
  assert.equal(tilt(55), 1); assert.equal(tilt(80), 1)
  assert.ok(tilt(32) > 0, '평소 30° 근처에서 이미 반응한다')
})

test('붓펜 몸통은 힘 배율이 1.16 을 넘어도 굵어진다(예전엔 시작 머리 1.45 에 잘렸다)', () => {
  const half = pressure => {
    const points = withDistances(line(0, 0, 300, 0, 120).map(p => ({ x: p.x, y: 0, pressure })))
    const numbers = nibContour({ points, strokeWidth: 8, penKind: 'taperBrush' }).match(/-?\d+(\.\d+)?/g).map(Number), ys = []
    for (let i = 0; i + 1 < numbers.length; i += 2) if (Math.abs(numbers[i] - 120) < 3) ys.push(Math.abs(numbers[i + 1]))
    return Math.max(...ys)
  }
  assert.ok(half(1.78) > half(1.0) * 1.6, `${half(1.78)} vs ${half(1.0)}`)
  assert.ok(half(1.78) < 8 * 2.4 / 2 + 0.5, '상한 2.4D')
})

// 끝 꼬리: 이미 그린 곡선은 다음 점이 와도 거의 그대로여야 한다(사용자: 쓰는 중 모양이 살짝 바뀐다)
const distanceTo = (p, poly) => { let best = Infinity; for (let i = 1; i < poly.length; i++) { const a = poly[i - 1], b = poly[i], dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0; best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)) } return best }
const arc = n => Array.from({ length: n }, (_, i) => { const a = i * 0.4; return { x: 100 + 60 * Math.cos(a), y: 100 + 60 * Math.sin(a), inkDistance: i * 24, pressure: 1 } })
test('끝 꼬리: 곡선을 쓰는 중 다음 점이 와도 그린 곡선이 거의 움직이지 않고 끝 근처에서 멈춘다', () => {
  const points = arc(14)
  for (let k = 4; k < points.length; k++) {
    const before = nibCurve(points.slice(0, k), { step: 2 }), after = nibCurve(points.slice(0, k + 1), { step: 2 })
    for (const p of before) assert.ok(distanceTo(p, after) < 0.35, `${k}점: 예전 직선 꼬리는 2 단위 안팎 움직였다 ${distanceTo(p, after)}`)
    assert.ok(Math.hypot(before.at(-1).x - points[k - 1].x, before.at(-1).y - points[k - 1].y) <= 1.5 + 1e-9, '꼬리는 마지막 점 1.5 단위 안에서 끝난다')
  }
})
test('끝 꼬리: 급히 꺾인 곳은 예측하지 않고 마지막 점까지 곧게 잇고, 같은 점이면 언제나 같은 곡선이다', () => {
  const corner = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 30 }].map((p, i) => ({ ...p, inkDistance: i * 30, pressure: 1 }))
  const curve = nibCurve(corner, { step: 2 })
  assert.deepEqual([curve.at(-1).x, curve.at(-1).y], [60, 30])
  assert.deepEqual(nibCurve(arc(9), { step: 2 }), nibCurve(arc(9).map(p => ({ ...p })), { step: 2 }))
  assert.ok(nibCurve(arc(9), { step: 2 }).every((p, i, all) => !i || p.inkDistance >= all[i - 1].inkDistance), '진행 거리는 뒤로 가지 않는다')
})
test('끝 꼬리: 점이 아주 듬성하고 많이 꺾여도 끝이 마지막 점에서 1.5 단위 넘게 벗어나지 않는다', () => {
  for (const spacing of [20, 45, 80, 200]) for (const turn of [0.3, 0.6, 0.9, 1.04]) {
    const points = [[0, 0], [spacing, 0], [spacing + spacing * Math.cos(turn), spacing * Math.sin(turn)]].map(([x, y], i) => ({ x, y, inkDistance: i * spacing, pressure: 1 }))
    const end = nibCurve(points, { step: 2 }).at(-1), last = points.at(-1)
    assert.ok(Math.hypot(end.x - last.x, end.y - last.y) <= 1.5 + 1e-9, `간격 ${spacing} · 꺾임 ${turn}`)
  }
})

// 끝 꼬리가 곡선 끝을 최대 1.5 단위 옮겨도 끝을 기준으로 하는 처리가 어긋나지 않는다
const numbers = path => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
const bendStroke = (kind, width = 8) => createStroke(arc(12).map((p, i) => ({ ...p, time: i * 40, speed: 0.6 })), { id: kind, kind, width, renderVersion: 3 })
test('끝 꼬리: 곡선의 진행 거리는 마지막 입력 점과 같아 붓펜 수필 길이 · 전체 길이가 그대로다', () => {
  const points = arc(12), curve = nibCurve(points)
  assert.equal(curve.at(-1).inkDistance, points.at(-1).inkDistance)
  const tapered = withTaper(curve, 8)
  assert.equal(tapered.at(-1).inkDistance, withTaper(points, 8).at(-1).inkDistance)
  assert.ok(Math.hypot(tapered.at(-1).x - points.at(-1).x, tapered.at(-1).y - points.at(-1).y) <= 1.5 + 1e-9)
})
test('끝 꼬리: 점 두 개 · 세 개 획과 같은 점이 겹친 끝도 끝 위치가 벗어나지 않고 NaN 이 없다', () => {
  const at = (x, y, i) => ({ x, y, inkDistance: i * 20, pressure: 1 })
  assert.equal(nibCurve([at(0, 0, 0), at(20, 0, 1)]).at(-1).x, 20)
  const end3 = nibCurve([at(0, 0, 0), at(20, 0, 1), at(40, 5, 2)]).at(-1)
  assert.ok(Math.hypot(end3.x - 40, end3.y - 5) <= 1.5 + 1e-9)
  const repeated = nibCurve([at(0, 0, 0), at(20, 0, 1), at(40, 0, 2), at(40, 0, 2)])
  assert.ok(repeated.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
  assert.deepEqual([repeated.at(-1).x, repeated.at(-1).y], [40, 0])
})
test('끝 꼬리: 끝 갈고리는 곡선 전 입력 점에서 잘리고, 잘린 뒤 점으로 그린 끝도 1.5 단위 안이다', () => {
  const base = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 0, time: i * 16, pressure: 1 }))
  const trimmed = trimEndHook([...base, { x: 92, y: 3, time: 160, pressure: 1 }], 1)
  assert.equal(trimmed.length, base.length, '갈고리를 뺀 입력 점')
  const end = nibCurve(withDistances(trimmed)).at(-1), last = trimmed.at(-1)
  assert.ok(Math.hypot(end.x - last.x, end.y - last.y) <= 1.5 + 1e-9)
})
test('끝 꼬리: 캘리펜 · 붓펜 윤곽이 획 상자 여백을 벗어나지 않고 끝 근처까지 그린다', () => {
  for (const kind of ['calligraphy', 'taperBrush']) {
    const stroke = bendStroke(kind), values = numbers(nibContour(stroke)), last = stroke.points.at(-1), margin = stroke.strokeWidth * 2.5
    assert.ok(values.length > 8, kind)
    const xs = values.filter((_, i) => i % 2 === 0), ys = values.filter((_, i) => i % 2)
    assert.ok(Math.min(...xs) >= -margin && Math.max(...xs) <= stroke.w + margin, `${kind} 가로`)
    assert.ok(Math.min(...ys) >= -margin && Math.max(...ys) <= stroke.h + margin, `${kind} 세로`)
    assert.ok(xs.some((x, i) => Math.hypot(x - last.x, ys[i] - last.y) <= stroke.strokeWidth * 2 + 1.5), `${kind} 끝 근처`)
  }
})
test('끝 꼬리: 연필 영역 지우기의 뒤 조각은 곡선 끝까지 남고 NaN 이 없다', () => {
  const stroke = bendStroke('pencil'), mid = stroke.points[5], page = { x: stroke.x + mid.x, y: stroke.y + mid.y }
  const session = createEraserSession([stroke], 10, 'area')
  session.move(page, page)
  const pieces = session.finish().replacements[stroke.id]
  assert.ok(pieces?.length >= 2, '가운데를 지우면 두 조각')
  const tail = pieces.at(-1), end = tail.points.at(-1), last = stroke.points.at(-1)
  assert.ok(tail.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
  assert.ok(Math.hypot(tail.x + end.x - stroke.x - last.x, tail.y + end.y - stroke.y - last.y) <= 2.5, '곡선 끝까지 남는다')
})
