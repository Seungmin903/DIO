import test from 'node:test'
import assert from 'node:assert/strict'
import { brushPartSamples, brushSeed, brushSpacing, shaderCap, shaderDabAlpha, shaderUniforms, PENCIL_SHADER_SKSL, copyDabs, copySpacing, brushTipPower, PENCIL_BRUSH, pencilAccumulates, paperMatrices, paperUniforms, partRange, partTotal, pencilDabs, PENCIL_PAPER_SKSL } from '../src/editor/utils/pencilBrush.js'
import { penPressure } from '../src/editor/utils/penSettings.js'
import { createStrokePreview } from '../src/editor/utils/strokePreview.js'

const line = n => {
  let d = 0
  return Array.from({ length: n }, (_, i) => {
    const p = { x: i * 3, y: Math.sin(i / 9) * 20, pressure: 0.85 }
    if (i) d += Math.hypot(3, p.y - Math.sin((i - 1) / 9) * 20)
    return { ...p, inkDistance: d }
  })
}
const dabsOf = points => createStrokePreview().snapshot(points).flatMap(part => {
  const [from, to] = partRange(part)
  return pencilDabs(brushPartSamples(part), 6, from, to, partTotal(part))
})

test('연필 도장은 구간 경계에서 겹치거나 빠지지 않고 간격이 일정하다 · 한 자리에 도장 하나 · 끝점에 한 번 더', () => {
  const points = line(300), dabs = dabsOf(points), step = brushSpacing(6)
  const expected = Math.floor(points.at(-1).inkDistance / step) + 1 + 1
  assert.ok(Math.abs(dabs.length - expected) <= 2, `${dabs.length} vs ${expected}`)
  for (let i = 1; i < dabs.length; i++) assert.ok(Math.hypot(dabs[i].x - dabs[i - 1].x, dabs[i].y - dabs[i - 1].y) < step * 2.5)
  const end = points.at(-1), last = dabs.at(-1)
  assert.ok(Math.hypot(last.x - end.x, last.y - end.y) < 1, '마지막 도장은 끝점(둥근 끝)')
})

test('둥근 끝 캡: 첫 도장(진행 거리 0)과 끝점 도장에만 붙고, 끝난 구간 · 이어 쓴 획에서도 같다', () => {
  const points = line(300), dabs = dabsOf(points), caps = dabs.filter(d => d.cap)
  assert.deepEqual(caps.map(d => d.cap), ['start', 'end'])
  assert.equal(dabs[0].cap, 'start')
  assert.equal(dabs.at(-1).cap, 'end')
  const longer = dabsOf([...points, ...line(340).slice(300)])
  assert.equal(longer.filter(d => d.cap).length, 2, '이어 쓰면 끝 캡은 새 끝점으로 옮겨 간다(중간에 남지 않는다)')
  assert.equal(longer[0].cap, 'start')
  assert.ok(PENCIL_BRUSH.cap.diameter > 0.7 && PENCIL_BRUSH.cap.diameter < 1 && PENCIL_BRUSH.cap.alpha > 0 && PENCIL_BRUSH.cap.alpha <= 1)
  assert.ok([2.5, 6, 10].every(width => brushTipPower(width) >= 1))
})

test('12판: 캡 도장 v 는 출렁임 없이 고정, 쓸어 둔 붓 끝 간격 · 도장별 지터는 번호로만 정해진다(꺼진 상태가 기본)', () => {
  const points = line(300), dabs = dabsOf(points), caps = dabs.filter(d => d.cap)
  assert.equal(PENCIL_BRUSH.capFlatV, true)
  assert.ok(PENCIL_BRUSH.deposit.on && caps[0].v < dabs[Math.floor(dabs.length / 2)].v, '퇴적 모델은 캡을 따로 찍지 않으므로 시작 도장도 가늘어짐을 따라 옅다')
  assert.equal(PENCIL_BRUSH.sweep.on, false)
  assert.equal(PENCIL_BRUSH.jitter, null)
  const keep = { ...PENCIL_BRUSH.sweep }
  try {
    PENCIL_BRUSH.sweep.on = true
    assert.ok(Math.abs(brushSpacing(6) - 1.6 * PENCIL_BRUSH.sweep.step * 6) < 1e-9)
    const sweepDabs = dabsOf(points)
    assert.ok(sweepDabs.length * 3 < dabs.length, '쓸어 둔 붓 끝은 (13판 기본 간격 기준) 도장 수가 3배 넘게 더 줄어든다')
    PENCIL_BRUSH.jitter = [0.65, 1]
    const a = dabsOf(points), b = dabsOf(points.map(p => ({ ...p })))
    assert.deepEqual(a, b)
    assert.ok(a.filter(d => !d.cap).every(d => d.a >= 0.65 - 1e-9 && d.a <= 1 + 1e-9) && new Set(a.map(d => d.a)).size > 5)
  } finally { Object.assign(PENCIL_BRUSH.sweep, keep); PENCIL_BRUSH.jitter = null }
})

test('19판: 획 시드 — 같은 시드는 같은 도장, 다른 시드는 파형 · 가장자리가 다르다, 지우개 조각처럼 시드가 같으면 앞부분이 그대로', () => {
  const samples = brushPartSamples({ points: line(200), key: 0, continuing: false })
  const a = pencilDabs(samples, 6, -Infinity, Infinity, Infinity, brushSeed({ x: 10, y: 20 })), b = pencilDabs(samples, 6, -Infinity, Infinity, Infinity, brushSeed({ x: 10, y: 20 }))
  const c = pencilDabs(samples, 6, -Infinity, Infinity, Infinity, brushSeed({ x: 10, y: 200 }))
  assert.deepEqual(a, b)
  assert.notDeepEqual(a.map(d => d.v), c.map(d => d.v))
  assert.ok(brushSeed({ x: 10, y: 20 }) >= 0 && brushSeed({ x: 10, y: 20 }) < 1 && brushSeed(null) === 0)
  const part = pencilDabs(samples.slice(0, 60), 6, -Infinity, 100, Infinity, brushSeed({ x: 10, y: 20 }))
  assert.deepEqual(part.slice(0, 40), a.slice(0, 40), '앞 구간 도장은 이어 써도 같다')
})

test('22판 copy 엔진: 도장 간격 · 필압 크기 · 알파, 구간 경계 · 다시 계산해도 같음, 부가 효과(캡 · 지터 · 시드) 없음', () => {
  const dabsOf2 = (points, width = 6) => createStrokePreview().snapshot(points).flatMap(part => { const [from, to] = partRange(part); return copyDabs(brushPartSamples(part), width, from, to) })
  const points = line(300), dabs = dabsOf2(points), step = copySpacing(6)
  assert.ok(Math.abs(dabs.length - (Math.floor(points.at(-1).inkDistance / step) + 1)) <= 2, `${dabs.length}`)
  for (let i = 1; i < dabs.length; i++) assert.ok(Math.hypot(dabs[i].x - dabs[i - 1].x, dabs[i].y - dabs[i - 1].y) < step * 2.5)
  assert.deepEqual(dabs, dabsOf2(points.map(p => ({ ...p }))))
  assert.ok(dabs.every(d => !d.cap && d.v === undefined && d.a <= 1 && d.side > 0))
  const at = pressure => copyDabs(brushPartSamples({ points: line(60).map(p => ({ ...p, pressure })), key: 0, continuing: false }), 6)
  const strong = at(0.85), weak = at(0.3), mean = (list, key) => list.reduce((sum, d) => sum + d[key], 0) / list.length
  assert.ok(mean(weak, 'side') < mean(strong, 'side') && mean(weak, 'a') < mean(strong, 'a'), '약하게 쓰면 도장이 작고 옅다')
  const c0 = PENCIL_BRUSH.copy; assert.ok(Math.abs(mean(strong, 'a') - (c0.alphaFloor + (1 - c0.alphaFloor) * Math.pow(0.85, c0.alphaPow))) < 1e-9 && copyDabs([{ x: 1, y: 1, pressure: 0.01, inkDistance: 0 }], 6).every(d => d.a >= PENCIL_BRUSH.copy.minPressure))
  assert.equal(copyDabs([{ x: 1, y: 1, pressure: 0.85, inkDistance: 0 }], 6).length, 3, '탭: 한 자리에 도장 몇 개')
  assert.ok(['own', 'shader'].includes(PENCIL_BRUSH.engine), '기본은 own 또는 shader(copy 는 플래그)')
})

test('25판 shader 엔진: 도장 알파는 필압에 따라 늘고 캡은 절반, 셰이더 uniform 은 선언 순서(21개) · 기본은 shader', () => {
  const c = PENCIL_BRUSH.shader
  assert.ok(shaderDabAlpha({ v: 0.4 }) < shaderDabAlpha({ v: 1 }) && shaderDabAlpha({ v: 1 }) <= 1)
  assert.ok(Math.abs(shaderDabAlpha({ v: 0.8, cap: 'end' }, 6) - shaderDabAlpha({ v: 0.8 }, 6) * shaderCap(6).dab) < 1e-9 && shaderCap(6).dab < shaderCap(2.5).dab)
  assert.ok(Math.abs(shaderDabAlpha({ v: 1 }) - c.flow) < 1e-9)
  const u = shaderUniforms({ x: 1, y: 2, w: 3, h: 4 }, 2, 1.75, { x: 5, y: 6 }, [0.1, 0.2, 0.3])
  assert.equal(u.length, 21)
  assert.deepEqual(u.slice(0, 6), [1, 2, 2, PENCIL_BRUSH.grainScale * 1.75, 5, 6])
  assert.match(PENCIL_SHADER_SKSL, /uniform shader cov/)
  assert.ok(['own', 'shader'].includes(PENCIL_BRUSH.engine))  // 실기 크래시로 기본을 own 으로 둔 상태
})

test('32판 흑연 퇴적 모델: 보통 필압은 포화하지 않고(회색 몸통 + 결), 세게 쓰면 차고, 약해도 이어진다', () => {
  assert.equal(PENCIL_BRUSH.accum.on, false)
  assert.equal(PENCIL_BRUSH.ribbon.on, false)
  assert.ok(PENCIL_BRUSH.deposit.on && PENCIL_BRUSH.strand.on)
  assert.ok(Math.abs(PENCIL_BRUSH.strand.tooth + PENCIL_BRUSH.strand.strand - 1) < 1e-9, '결 두 벌의 합이 1')
  // 48판 세 채널: R = 윤곽(차 있음), B = 묻은 양(힘 비례), G = 결. 돔 경도 0.5, 간격 0.15D: 겹침 합 5.31. 62판: 도장을 Screen 으로 쌓아 B = 1 − e^(−지난 양)
  const amount = v => 1 - Math.exp(-PENCIL_BRUSH.deposit.flow * v * 5.31)
  const ink = (width, R, B, G) => { const [m1] = paperMatrices(width, [0, 0, 0]), c = v => Math.min(1, Math.max(0, v)); return c(m1[15] * R + m1[16] * G + m1[17] * B + m1[19]) * c(m1[0] * R + m1[1] * G + m1[2] * B + m1[4]) }
  const normal = amount(1 / 1.48), weak = amount(0.62 / 1.48 * 0.6), hard = amount(1)
  assert.ok(hard < 1, `가장 세게 써도 B 는 차지 않아 힘이 끝까지 진하기로 보인다 ${hard}`)
  assert.ok(ink(10, 1, normal, 0.3) > 0.3 && ink(10, 1, normal, 0.3) < 0.7, '보통 필압 몸통은 중간 회색(결 값 대부분은 .3 아래, 참고 중앙값 .22~.65)')
  assert.ok(ink(10, 1, normal, 0.25) - ink(10, 1, normal, 0.75) > 0.2, '결 대비가 보인다')
  assert.ok(ink(10, 1, weak, 0.1) > 0.1, '굵은 약한 선도 돌기 자리는 칠해진다(옅고 듬성함, 소실 아님)')
  assert.ok(ink(2.5, 1, weak, 0.3) > 0.15, '얇은 약한 선은 이어진 옅은 선')
  assert.ok(ink(10, 1, weak, 0.2) < ink(10, 1, normal, 0.2) && ink(10, 1, normal, 0.2) < ink(10, 1, hard, 0.2), '세게 쓸수록 진하다')
  assert.ok(ink(10, 1, hard, 0.05) > 0.9, '불투명도 100 에서 세게 쓰면 돌기 자리는 거의 꽉 찬다')
  assert.equal(ink(10, 1, 1 - (1 - hard) ** 2, 0.05), 1, '두 번 지나면 불투명까지 닿는다')
  assert.ok(ink(2.5, 1, normal, 0.75) > ink(10, 1, normal, 0.75), '얇은 선은 결을 덜 깎아 꽉 찬 선')
  assert.equal(ink(10, 0.05, normal, 0.5), 0, '윤곽 밖은 잘려 나간다')
  assert.ok(Math.abs(paperUniforms({ x: 0, y: 0 }, 1.75)[2] - PENCIL_BRUSH.grainScale * 1.75) < 1e-9, '기기 기본 배율 1.75 에선 결 크기가 확대 연동 전과 같다')
  assert.ok(paperUniforms({ x: 0, y: 0 }, 5.25)[2] < PENCIL_BRUSH.grainScale * 5.25, '확대 3 에선 결 칸이 화면 px 고정보다 크다')
  // 필압으로 도장이 좁아져도 겹침 손실 없음(fComp) · 획 시드는 저장 값이 우선
  assert.equal(brushSeed({ x: 1, y: 2, seed: 0.25 }), 0.25)
})

test('40판 끝 가늘어짐 · 구슬: 시작과 약한 필압은 지름 · 진하기가 줄고, 시작 갈고리의 겹친 도장은 양이 줄며, 앞 도장은 획이 길어져도 그대로', () => {
  const stroke = points => { let d = 0; return points.map((p, i) => { if (i) d += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y); return { ...p, inkDistance: d } }) }
  const straight = stroke(Array.from({ length: 60 }, (_, i) => ({ x: i * 2, y: 0, pressure: 0.85 })))
  const s = pencilDabs(straight, 10)
  assert.ok(s[0].r < s[30].r * 0.7, `시작 반지름 ${s[0].r} < 몸통 ${s[30].r}`)
  assert.ok(s[0].v < s[30].v, '시작은 옅다')
  const weak = pencilDabs(stroke(Array.from({ length: 60 }, (_, i) => ({ x: i * 2, y: 0, pressure: 0.85 * 0.62 }))), 10)
  assert.ok(weak[30].r < s[30].r * 0.5 && weak[30].r > 0, '약한 필압은 가늘되 사라지지 않는다')
  assert.ok(pencilDabs(straight, 10).at(-1).a < 1, '끝점 도장은 앞 도장과 떨어진 만큼만 묻는다(꼬리 끝 진한 점 방지)')
  const hook = stroke([{ x: 5, y: 0, pressure: 0.85 }, { x: 3, y: 0, pressure: 0.85 }, { x: 5, y: 0, pressure: 0.85 }, { x: 3, y: 0, pressure: 0.85 }, ...Array.from({ length: 40 }, (_, i) => ({ x: 5 + i * 2, y: 0, pressure: 0.85 }))])
  const h = pencilDabs(hook, 10), lessened = h.filter(one => one.a < 1)
  assert.ok(lessened.length > 0, '되돌아온 도장은 양이 줄어든다')
  assert.ok(s.slice(20, 50).every(one => one.a === 1), '곧은 몸통은 줄지 않는다')
  assert.deepEqual(pencilDabs(straight.slice(0, 40), 10, -Infinity, 40).slice(0, 20), s.slice(0, 20), '앞 도장은 그대로')
})

test('같은 획은 언제 다시 계산해도 같은 도장 · 끝난 구간은 이어 써도 그대로', () => {
  const points = line(250)
  assert.deepEqual(dabsOf(points), dabsOf(points.map(p => ({ ...p }))))
  const longer = [...points, ...line(320).slice(250)]
  const head = dabsOf(points).slice(0, 150), again = dabsOf(longer).slice(0, 150)
  assert.deepEqual(again, head, '앞부분 도장은 획이 길어져도 바뀌지 않는다')
})

test('약하게 쓰면 도장이 작고 필압 깊이(v)가 얕다', () => {
  const at = pressure => pencilDabs(line(60).map(p => ({ ...p, pressure })), 6)
  const strong = at(0.85), weak = at(0.85 * 0.8)
  const mean = (list, key) => list.reduce((sum, d) => sum + d[key], 0) / list.length
  assert.ok(mean(weak, 'r') < mean(strong, 'r') && mean(weak, 'v') < mean(strong, 'v'))
  assert.match(PENCIL_PAPER_SKSL, /uniform shader grain/)
})

test('종이 결 행렬(포토샵 Height): 덮임이 없으면 칠하지 않고, 얇은 선 몸통엔 구멍이 없고, 굵은 선은 깊은 골이 옅다', () => {
  const ink = (width, a, b, h) => {
    const [m1] = paperMatrices(width, [0.1, 0.2, 0.3]), c = v => Math.min(1, Math.max(0, v))
    return c(m1[15] * a + m1[16] * h + m1[17] * b + m1[19]) * c(m1[0] * a + m1[1] * h + m1[2] * b + m1[4])
  }
  // 48판: R = 윤곽, b = 묻은 양, h = 결
  for (const width of [2.5, 6, 10]) assert.equal(ink(width, 0, 0, 0), 0)
  for (const h of [0, 0.5, 1]) assert.ok(ink(2.5, 1, 0.7, h) > 0.1, '얇은 선 가운데는 결이 가장 깊어도 뚫리지 않는다')
  // 62판: B 는 Screen 으로 쌓여 한 번 세게 지나도 .6 안팎이다(.8 은 여러 겹 지난 값 — 겹치면 깊은 골도 메워진다)
  const shallow = ink(10, 1, 0.6, 0.1), mid = ink(10, 1, 0.6, 0.5), deep = ink(10, 1, 0.6, 0.95)
  assert.ok(shallow > 0.8)
  assert.ok(deep < mid && mid <= shallow && deep < shallow * 0.8, '굵은 선은 결이 깊을수록 옅다(깊은 골은 옅은 이빨)')
  assert.ok(deep < 0.2, '41판(사용자): 굵은 획은 거칠고 듬성하게 — 깊은 골은 종이까지 거의 비친다')
  assert.ok(ink(2.5, 1, 0.8, 0.95) > 0.4, '얇은 선 가운데는 깊은 골에서도 뚫리지 않는다')
  assert.equal(ink(10, 0.05, 0.8, 0.5), 0, '윤곽 밖은 잘려 나간다')
  assert.ok(ink(10, 1, 0.4, 0.5) < ink(10, 1, 0.7, 0.5), '더 묻을수록(세게) 진하다')
  assert.ok(ink(10, 0.3, 0.5, 0.9) === 0 && ink(10, 0.3, 0.5, 0.1) > 0, '윤곽 둘레는 골은 비고 돌기는 칠해진다 — 가루')
  assert.deepEqual(paperUniforms({ x: 3, y: 4 }).slice(0, 2), [3, 4])
  assert.equal(paperUniforms({ x: 3, y: 4 }).length, 5, '결 양극화 문턱 두 개')
})

test('연필 필압은 실측 S펜 힘 0.02 ~ 0.64 전체에서 커진다(0.34 에서 잘리지 않는다)', () => {
  const forces = [0.02, 0.05, 0.12, 0.22, 0.34, 0.5, 0.64]
  const values = forces.map(force => penPressure('pencil', 0, force))
  for (let i = 1; i < values.length; i++) assert.ok(values[i] > values[i - 1], `${forces[i]}: ${values[i]} > ${values[i - 1]}`)
  // 저장된 원값(force)이 있으면 예전 곡선으로 저장된 필압 대신 지금 곡선으로 그린다
  const old = { x: 0, y: 0, pressure: 1.02, force: 0.6, inkDistance: 0 }, next = { ...old, x: 30, inkDistance: 30 }
  const [sample] = brushPartSamples({ points: [old, next], key: 0, continuing: false })
  assert.ok(Math.abs(sample.pressure - penPressure('pencil', 0, 0.6)) < 1e-9)
})

test('62판 겹침: 불투명도는 한 번 지난 톤에 곱해지고, 겹쳐 묻으면 불투명도를 넘어 고르게 쌓이며 결 구멍은 천천히 메워진다', () => {
  const pass = PENCIL_BRUSH.deposit.flow * (1 / 1.48) * 5.31   // 보통 힘 한 번 지남의 양
  const ink = (n, G, op) => { const [m1] = paperMatrices(8, [0, 0, 0], op), c = v => Math.min(1, Math.max(0, v)), B = 1 - Math.exp(-pass * n); return c(m1[15] + m1[16] * G + m1[17] * B + m1[19]) * c(m1[0] + m1[1] * G + m1[2] * B + m1[4]) }
  assert.ok(pencilAccumulates())
  assert.ok(Math.abs(ink(1, 0.3, 0.8) - 0.8 * ink(1, 0.3, 1)) < 1e-6, '한 번 지난 몸통은 불투명도만큼 곱해진 톤')
  for (const G of [0.3, 0.7]) for (const [a, b] of [[1, 2], [2, 4]]) assert.ok(ink(b, G, 0.8) > ink(a, G, 0.8) + 0.08, `결 ${G}: ${a}겹 < ${b}겹`)
  assert.ok(ink(8, 0.1, 0.8) > 0.8, '돌기 자리는 겹치면 불투명도 80 을 넘는다')
  assert.ok(ink(8, 0.7, 0.8) < 0.8, '깊은 골은 8 겹이어도 막히지 않는다(4 겹에 까맣게 막히던 덧셈과 다르다)')
  assert.ok(ink(8, 0.3, 0.3) < 0.8, '불투명도가 낮으면 겹쳐도 천장이 낮다')
})

test('48판 기울기: 눕혀 쓰면 넓고 옅다, 기울기 값이 없는 획(환경설정 끔)은 그대로', () => {
  const at = tilt => pencilDabs(line(120).map(p => ({ ...p, ...tilt })), 6)[100]
  const flat = at({}), upright = at({ tiltX: 20, tiltY: 20 }), lying = at({ tiltX: 40, tiltY: 40 })
  assert.equal(upright.r, flat.r, '평소 쓰는 각도(40도 아래)는 영향 없음')
  assert.ok(lying.r > flat.r * 1.4 && lying.v < flat.v * 0.6, '55도 넘게 눕히면 넓고 옅다')
})

test('48판 끝 뾰족함 · 점: 끝으로 가늘어져도 도장이 촘촘해져 이어지고, 양은 나눠 진해지지 않으며, 아주 짧은 획은 흐려지지 않는다', () => {
  const stroke = points => { let d = 0; return points.map((p, i) => { if (i) d += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y); return { ...p, inkDistance: d } }) }
  const fade = stroke(Array.from({ length: 80 }, (_, i) => ({ x: i * 2, y: 0, pressure: 0.85 * (1.4 - 0.8 * i / 79) })))
  const dabs = pencilDabs(fade, 16), tip = dabs.at(-2)
  assert.ok(tip.r * 2 < dabs[10].r, '끝 지름은 몸통의 절반 아래')
  assert.ok(tip.dense > 1 && tip.a < 1, '끝은 간격을 줄이고 양을 나눈다')
  for (let i = 1; i < dabs.length - 1; i++) assert.ok(Math.hypot(dabs[i].x - dabs[i - 1].x, dabs[i].y - dabs[i - 1].y) <= Math.max(dabs[i].r, dabs[i - 1].r) * 1.05 + 1e-6, `도장 ${i} 이 끊기지 않는다`)
  const dot = pencilDabs(stroke([{ x: 0, y: 0, pressure: 0.85 }, { x: 0.5, y: 0, pressure: 0.85 }]), 16)
  assert.ok(dot.reduce((sum, one) => sum + one.a, 0) > 3, '짧은 점은 탭처럼 채운다')
  const long = pencilDabs(stroke(Array.from({ length: 40 }, (_, i) => ({ x: i * 2, y: 0, pressure: 0.85 }))), 16)
  assert.ok(long.at(-1).a <= 1, '긴 획의 끝에는 채움이 없다')
})

test('겹친 결 리본은 먼저 그려진 결이 남는다(DstOver): 한 획이 자기 앞부분과 겹쳐도 이미 그어진 결이 물결치듯 밀리지 않는다', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../src/editor/skia/strokeSkia.js', import.meta.url), 'utf8')
  assert.match(source, /shader\.setBlendMode\(BlendMode\.DstOver\)/, '나중 리본이 앞 리본의 결을 덮어쓰지 않게 페인트가 DstOver')
})

test('앱 연필은 그림을 못 만들었을 때만 SVG 를 붙인다: 화면 밖 썸네일의 SVG 가 남아 Java 힙을 채우지 않는다', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../src/editor/components/PencilSkiaStroke.native.js', import.meta.url), 'utf8')
  assert.match(source, /raster === false \|\| \(raster && broken === raster\.uri\) \? fallback : null/)
  assert.doesNotMatch(source, /showing \? null : fallback/)
})

test('웹 연필 미리보기는 표면을 못 만들면 SVG 로 넘기고, 페이지 밖 획도 크기가 0 이 되지 않는다', async () => {
  const { readFileSync } = await import('node:fs')
  const read = name => readFileSync(new URL(`../src/editor/components/${name}`, import.meta.url), 'utf8')
  const live = read('PencilLivePreview.js'), preview = read('PenPreview.js')
  assert.match(live, /if \(!surface\) \{ now\.onUnavailable\?\.\(\); return \}/)
  assert.match(live, /Math\.max\(STEP, Math\.ceil/)
  assert.match(preview, /item\.settings\.kind === 'pencil' && !liveFailed/)
  assert.match(preview, /onUnavailable=\{\(\) => setLiveFailed\(true\)\}/)
})
