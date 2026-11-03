import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PEN_SETTINGS, PEN_TYPES, penPressure } from '../src/editor/utils/penSettings.js'
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
  const tail = Math.min(Math.max(4.5 * width, 8), 0.42 * total), endScale = 0.5 / width
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
  const tailStart = 200 - Math.max(4.5 * 10, 8)
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

test('굵은 붓펜의 긴 끝 삐침이 여러 미리보기 구간에 걸쳐도 끝까지 가늘어진다', () => {
  // 천천히 써서 점이 촘촘하면 끝 삐침(4.5D = 72)이 마지막 두 구간보다 길다
  const points = withDistances(line(0, 0, 200, 0, 1000).map(p => ({ x: p.x, y: 0 })))
  const parts = createStrokePreview().snapshot(points)
  assert.ok(parts.at(-3).points.at(-1).inkDistance > 200 - 72, '셋째 구간까지 삐침이 걸린다')
  const numbers = nibPreviewPaths(parts, 16, 'taperBrush').join('').match(/-?\d+(\.\d+)?/g).map(Number)
  const near = []
  for (let i = 0; i + 1 < numbers.length; i += 2) if (Math.abs(numbers[i] - 164) < 0.5) near.push(Math.abs(numbers[i + 1]))
  assert.ok(near.length && Math.max(...near) < 8, '삐침 중간 굵기는 몸통(반지름 10)보다 가늘다')
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
  assert.ok(Math.abs(whole.w - joined.w) < 0.5 && Math.abs(whole.h - joined.h) < 0.5)
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
