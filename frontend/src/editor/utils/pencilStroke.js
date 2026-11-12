import { curveOfPart, nibCurve, withDistances } from './nibStroke.js'
import { penSweeps } from './strokes.js'

// 연필 획(코덱스 2026-11-02, 사용자 참고: Procreate · Photoshop · Clip Studio 연필 브러시): 획 자체가 결이다.
//  - 몸통: 불투명한 흑연 면에 종이 결 구멍이 뚫린 무늬 한 겹(pencilTexture). 가운데 심 · 반투명 바탕은 없다.
//    불투명도 100이면 불투명해 보이고, 진하기는 구멍 비율과 겹침으로 정해진다.
//  - 밀도 얼룩: 결 타일과 주기가 다른 36 타일의 덩어리를 몸통 위에 반투명으로 얹어 진한 곳 · 성긴 곳이 생긴다.
//  - 가루: 몸통 바로 바깥에 흑연 입자만 드문드문 → 마른 듯 끊기는 가장자리.
//  - 가장자리는 좌우를 따로(시드가 다르게) 작은 물결 + 짧은 잔결로 부순다.
// 곡선은 볼펜과 같은 이웃 점 가운데 2차 곡선, 처음 · 끝은 볼펜처럼 둥글다(사용자 결정).
// 결의 위치는 진행 거리(inkDistance)로 정해 이어 그려도 · 지워도 이미 그린 부분이 바뀌지 않는다.
export const PENCIL_WIDTH = 0.85
// 곡선 표본 간격: 가장자리 잔결이 보이도록 다른 펜(6)보다 좁게 3(2 는 그리는 중 계산이 1.5배 무거웠다)
const PENCIL_STEP = 3
// 굵기 2.5 / 5 / 10 에서(사이는 직선 보간). 코덱스 미감 리뷰 3판(태블릿 실기 캡처 · 사용자 목표 'Combined 1'):
// 가장자리는 윤곽 가까이에서만 살짝 마르고 오톨도톨하게 — 물결 · 잔결 진폭을 줄이고, 테두리 띠는 좁게, 가루는 더 좁고 옅게.
// 가루 폭은 코덱스 값(1.12~1.18)이 테두리 띠보다 좁아 가려져, 테두리 띠 + 0.08 로 둔 내 보정값.
const BY_WIDTH = [
  { width: 2.5, amplitude: 0.1, wave: 1.4, fine: 0.05, fineWave: 0.4, edgeScale: 1.18, dustScale: 1.26, dustOpacity: 0.11 },
  { width: 5, amplitude: 0.13, wave: 2.4, fine: 0.06, fineWave: 0.32, edgeScale: 1.16, dustScale: 1.24, dustOpacity: 0.05 },
  // 굵은 연필(코덱스 리뷰 5판, 사용자: 굵을 때 윤곽이 너무 일정하다): 출렁임을 크고 짧게, 잔결도 굵게, 가루는 넓고 조금 진하게.
  // 가루 범위는 코덱스 '0.75W'(반지름)를 지름 배율 1.5 로 옮긴 값. 바깥 몸통 자체도 안쪽으로 잘게 갉는다(outerBite).
  { width: 10, amplitude: 0.16, wave: 1.4, fine: 0.065, fineWave: 0.2, edgeScale: 1.14, dustScale: 1.5, dustOpacity: 0.04, outerBite: 0.055, outerBiteWave: 0.3 },
]
export function pencilLook(width) {
  const [first] = BY_WIDTH, last = BY_WIDTH.at(-1)
  if (width <= first.width) return first
  if (width >= last.width) return last
  const i = BY_WIDTH.findIndex(row => row.width >= width), a = BY_WIDTH[i - 1], b = BY_WIDTH[i], t = (width - a.width) / (b.width - a.width)
  const mix = key => a[key] + (b[key] - a[key]) * t
  return { width, amplitude: mix('amplitude'), wave: mix('wave'), fine: mix('fine'), fineWave: mix('fineWave'), edgeScale: mix('edgeScale'), dustScale: mix('dustScale'), dustOpacity: mix('dustOpacity'),
    outerBite: mix('outerBite'), outerBiteWave: mix('outerBiteWave') }
}

const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }
const noise = (distance, wave, seed) => {
  const x = distance / wave, i = Math.floor(x), t = x - i, s = t * t * (3 - 2 * t)
  return (hash(i + seed * 1013) + (hash(i + 1 + seed * 1013) - hash(i + seed * 1013)) * s) * 2 - 1
}
// 저주파 물결 + 짧은 잔결
const rough = (distance, look, seed) => look.amplitude * noise(distance, look.wave, seed) + look.fine * noise(distance, look.fineWave, seed + 7)

// 한 겹의 채운 외곽선. 좌우 가장자리를 따로 흔들려고 중심선을 (왼쪽 − 오른쪽)/2 만큼 옮기고 굵기를 그만큼 바꿔 원형 펜촉으로 쓴다.
// samples 는 진행 거리(inkDistance)를 가진 곡선 표본, 법선은 이웃 표본으로 정한다.
// role: 'outer'(바깥 몸통 · 테두리 · 가루) · 'bite'(바깥 몸통에 붙어 가장자리만 갉는 진한 겹) · 'core'(가운데 진한 겹, 옆으로 흔들림)
const PRESSURE_BASE = 0.85
const MEANDER = 0.1, MEANDER_WAVE = 7, SWELL = 0.12, SWELL_WAVE = 5
// 갉기: 기본 0 ~ 0.12W, 파장 2.6 과 1.8 을 섞고 0 아래는 잘라(안 갉는 구간이 길게 남게) 좌우 따로. 곡선 표본 간격(3)보다 짧은 파장은
// 중심선을 지그재그로 꺾어 꺾인 곳에서 펜촉 자국이 바깥 몸통 밖으로 튀어나왔다.
// 약하게 쓰거나 눕히면(sparse 0→1) 갉기를 0.12 → 0.57W 로 키우고 자주 갉아(bias) 진한 겹이 군데군데 끊긴다 = 종이가 더 비친다(코덱스 5판).
const BITE = 0.12, BITE_SPARSE = 0.45, BITE_BIAS = 0.75
const biteAt = (distance, seed, bias) => Math.max(0, Math.min(1, 0.65 * noise(distance, 2.6, seed) + 0.35 * noise(distance, 1.8, seed + 9) + bias))
const outerBite = (distance, width, look) => {
  if (!look.outerBite) return null
  const amount = look.outerBite * width * PENCIL_WIDTH
  return { left: amount * Math.max(0, noise(distance, look.outerBiteWave, 90)), right: amount * Math.max(0, noise(distance, look.outerBiteWave, 93)) }
}
function layerBite(distance, width, seed, sparse) {
  const amount = (BITE + BITE_SPARSE * sparse) * width * PENCIL_WIDTH, bias = BITE_BIAS * sparse
  return { left: amount * biteAt(distance, seed + 80, bias), right: amount * biteAt(distance, seed + 83, bias) }
}
// 필압이 없는 점(예전 획)은 기준값으로 — 곡선으로 펼 때 1 로 채워지면 굵기 배율이 1.18 이 된다
const basePoint = p => p && p.pressure == null ? { ...p, pressure: PRESSURE_BASE } : p
const withBasePressure = points => points.some(p => p.pressure == null) ? points.map(basePoint) : points
// 필압 배율 f = pressure ÷ 0.85(평소 필압이 1, penSettings). 모든 겹이 같은 f^1.1 로 가늘어진다(코덱스 5판).
// (안쪽 겹만 f² · f³ 로 좁히던 때는 평소 필압에서도 성긴 띠 가운데 진한 심 한 줄이 남았다 — 사용자 지적, 태블릿 실기)
// 흐려지는 것은 폭이 아니라 진한 겹의 갉기로: f 가 1 → 0.78 로 내려가면 sparse 0 → 1.
const PRESSURE_WIDTH = 1.1, LIGHT = 0.22
const pressureOf = p => Math.max(0.5, Math.min(1.2, (p.pressure ?? PRESSURE_BASE) / PRESSURE_BASE))
// 기울기(사용자 실기: 평소 필기 약 30°, 눕혀 칠할 때 약 55°): 35°→58° 사이에서 t = 0→1(코덱스 5판).
// 바깥 · 갉는 겹은 최대 1.5배 넓히고 가운데 겹은 0.65배로 좁히며, 진한 겹을 많이 갉아 넓고 흐린 면이 된다.
const TILT = [35, 58], TILT_WIDE = 0.5, TILT_CORE = 0.35
const tiltOf = p => {
  if (!Number.isFinite(p.tiltX) || !Number.isFinite(p.tiltY)) return 0
  return Math.max(0, Math.min(1, (Math.min(90, Math.hypot(p.tiltX, p.tiltY)) - TILT[0]) / (TILT[1] - TILT[0])))
}
function layerOutline(samples, before, after, width, scale, seed, caps, role = 'outer') {
  const look = pencilLook(width), base = width * PENCIL_WIDTH * scale
  const shaped = samples.map((p, i) => {
    const a = samples[i - 1] ?? before ?? p, b = samples[i + 1] ?? after ?? p
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1
    const f = pressureOf(p), t = tiltOf(p), sparse = Math.max(Math.max(0, Math.min(1, (1 - f) / LIGHT)), t)
    // 갉는 겹은 바깥 몸통(시드 11)과 같은 가장자리 흔들림을 따라가 늘 그 안에 있다(밖으로 나가면 매끈한 진한 가장자리가 드러난다)
    const edgeSeed = role === 'bite' ? 11 : seed
    const left = rough(p.inkDistance, look, edgeSeed), right = rough(p.inkDistance, look, edgeSeed + 3)
    // 가운데 겹은 획을 따라 옆으로 흔들리고 폭도 따로 바뀐다: 같은 폭의 밝은 띠가 몸통을 감싸 테두리처럼 보이지 않게(사용자 지적)
    // 흔들림은 바깥 몸통 안에 남는 만큼만(삐져나오면 그 자리가 진한 가장자리가 된다)
    const core = role === 'core', room = Math.max(0, Math.min(MEANDER, (1 - scale * (1 + SWELL)) / 2))
    const meander = core ? room * width * PENCIL_WIDTH * noise(p.inkDistance, MEANDER_WAVE, seed + 50) : 0
    const swell = core ? 1 + SWELL * noise(p.inkDistance, SWELL_WAVE, seed + 60) : 1
    // 가장자리 갉기(bite): 바깥 몸통에 거의 붙은 겹의 양쪽을 안쪽으로만 불규칙하게 갉아, 성긴 가장자리가 일정한 띠가 아니라 군데군데만 생긴다
    const bite = role === 'bite' ? layerBite(p.inkDistance, width, seed, sparse) : { left: 0, right: 0 }
    // 굵은 연필은 바깥 몸통 윤곽도 안쪽으로 잘게 갉는다(코덱스 5판). 갉는 겹도 같이 갉아 바깥 윤곽 밖으로 나가지 않는다
    const outer = (role === 'outer' && seed === 11) || role === 'bite' ? outerBite(p.inkDistance, width, look) : null
    if (outer) { bite.left += outer.left; bite.right += outer.right }
    const tilted = core ? 1 - TILT_CORE * t : 1 + TILT_WIDE * t, pressed = f ** PRESSURE_WIDTH
    // 필압 · 기울기 배율은 흔들림 · 갉기까지 통째로 곱한다(중심선 기준으로 겹 전체를 줄이고 늘려, 겹끼리의 안팎 관계가 그대로다)
    const k = pressed * tilted, shift = ((left - right) / 2 + meander + (bite.right - bite.left) / 2) * k
    const own = (base * swell - bite.left - bite.right + left + right) * k
    return { x: p.x - dy / length * shift, y: p.y + dx / length * shift, pressure: Math.max(0.05, own / base) }
  })
  return penSweeps(shaped, base, 'ball', 0, caps).map(piece => piece.path).join('')
}
const r2 = value => Math.round(value * 100) / 100
const dotPath = (point, diameter) => Array.from({ length: 16 }, (_, n) =>
  `${n ? 'L' : 'M'}${r2(point.x + Math.cos(n * Math.PI / 8) * diameter / 2)} ${r2(point.y + Math.sin(n * Math.PI / 8) * diameter / 2)}`).join('') + 'Z'

// 굵은 연필(사용자: 얇을 땐 좋은데 두꺼우면 연필 같지 않다, 참고 이미지 · 연필 모사 연구): 진짜 연필은 굵게 칠해도 꽉 찬 면이 아니라
// 흑연 알갱이 사이로 종이 결이 30~50% 비치고, 심 가운데에 압력이 몰려 가운데가 진하고 가장자리로 갈수록 성기다.
// 굵기 4.5 이상이면 몸통을 폭 1.0 / 0.78 / 0.5배 세 겹으로 쌓는다. 겹마다 구멍 약 40%의 종이 결(위상이 서로 다름)이라
// 쌓일수록 구멍이 메워져 가장자리 약 54% · 가운데 약 90% 를 덮는다(코덱스 리뷰 4판: 폭 1 / 0.73 / 0.46). 알갱이는 불투명이라 불투명도 100 은 그대로다.
// 획 방향 긁힘(슬롯): 진행 거리 2.5마다 75% 확률로, 중심선 ±0.18W 안에 길이 1.4~4.6 · 폭 0.10~0.18 의 가는 사각을 획 방향(±7°)으로 둔다.
// 세 겹 몸통을 함께 잘라내야(clipPath evenodd) 아래 겹이 메우지 않고 흰 긁힘으로 보인다. 진행 거리 · 해시로 정해 다시 계산해도 같다.
const THICK = 4.5
// 몸통 겹: 바깥은 구멍 많은 종이 결(tooth), 안쪽일수록 좁고 필압에 더 민감하다. 가는 연필은 바깥 tooth + 안쪽 거의 꽉 찬 결 한 겹이라
// 평소에는 지금처럼 꽉 찬 선이고, 약하게 쓰면 안쪽이 좁아져 흐리고 성긴 선이 된다(사용자: 연필 모든 구간이 같은 진하기일 필요는 없다).
const NESTED = {
  // 둘째 겹은 바깥 몸통에 거의 붙여(0.95) 가장자리만 불규칙하게 갉고, 셋째 겹(0.54)은 옆으로 흔든다(코덱스 5판: 0.98 / 0.62 → 심 인상을 더 약하게).
  // (0.73 / 0.46, 0.8 은 바깥 겹이 일정한 폭의 성긴 띠로 남아 테두리처럼 보였다 — 사용자 지적, 태블릿 확인)
  thick: [{ scale: 1, seed: 11, role: 'outer', paper: 'tooth' }, { scale: 0.95, seed: 23, role: 'bite', paper: 'tooth' }, { scale: 0.54, seed: 31, role: 'core', paper: 'tooth' }],
  // 가는 연필의 안쪽 꽉 찬 결도 바깥 가장자리를 따라 갉는다: 평소엔 꽉 찬 선, 약하게 · 눕혀 쓰면 군데군데 성겨진다
  thin: [{ scale: 1, seed: 11, role: 'outer', paper: 'tooth' }, null, { scale: 0.95, seed: 31, role: 'bite', paper: 'fine' }],
}
export const pencilBodies = width => NESTED[width >= THICK ? 'thick' : 'thin']
const SLOT_EVERY = 2.5, SLOT_CHANCE = 0.75, SLOT_BAND = 0.18, SLOT_LENGTH = [1.4, 4.6], SLOT_WIDTH = [0.1, 0.18], SLOT_TURN = 7 * Math.PI / 180
const r3 = value => Math.round(value * 1000) / 1000
// 곡선 표본에서 긁힘 슬롯 다각형들(번호 n → 경로). 미리보기 구간이 겹쳐도 같은 번호는 같은 모양이라 Map 으로 합친다.
export function pencilSlots(samples, width, into = new Map()) {
  if (width < THICK) return into
  const body = width * PENCIL_WIDTH
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i]
    for (let n = Math.floor(a.inkDistance / SLOT_EVERY) + 1; n <= Math.floor(b.inkDistance / SLOT_EVERY); n++) {
      if (into.has(n) || hash(n * 7 + 1) > SLOT_CHANCE) continue
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, tx = dx / len, ty = dy / len
      const angle = Math.atan2(ty, tx) + (hash(n * 7 + 2) - 0.5) * 2 * SLOT_TURN, ux = Math.cos(angle), uy = Math.sin(angle)
      const lateral = (hash(n * 7 + 3) * 2 - 1) * SLOT_BAND * body
      const length = SLOT_LENGTH[0] + hash(n * 7 + 4) * (SLOT_LENGTH[1] - SLOT_LENGTH[0]), half = (SLOT_WIDTH[0] + hash(n * 7 + 5) * (SLOT_WIDTH[1] - SLOT_WIDTH[0])) / 2
      const t = (n * SLOT_EVERY - a.inkDistance) / Math.max(1e-6, b.inkDistance - a.inkDistance)
      const cx = a.x + dx * t - ty * lateral, cy = a.y + dy * t + tx * lateral
      const corners = [[0, -half], [length, -half], [length, half], [0, half]].map(([u, v]) => `${r3(cx + ux * u - uy * v)} ${r3(cy + uy * u + ux * v)}`)
      into.set(n, `M${corners.join('L')}Z`)
    }
  }
  return into
}
// [바깥 몸통, 중간 몸통, 가운데 몸통, 테두리 알갱이 띠, 바깥 가루, 긁힘 슬롯]. 얇은 연필은 몸통 한 겹(중간 · 가운데 · 슬롯은 빈 경로).
const LAYERS = 6
const bodyAndDust = (samples, width, caps, before, after) => {
  const look = pencilLook(width), outline = (scale, seed, role) => layerOutline(samples, before, after, width, scale, seed, caps, role)
  const bodies = pencilBodies(width).map(layer => layer ? outline(layer.scale, layer.seed, layer.role) : '')
  // 굵은 연필은 테두리 알갱이 띠를 두지 않는다(사용자: 두꺼울수록 윤곽선처럼 보인다). 성긴 바깥 몸통 겹이 흐린 가장자리가 된다.
  const thick = width >= THICK
  return [...bodies, thick ? '' : outline(look.edgeScale, 41), outline(look.dustScale, 71), pencilSlots(samples, width)]
}
const dots = (point, width, dotWidth) => { const look = pencilLook(width); return [...pencilBodies(width).map(layer => layer?.scale ?? 0), width >= THICK ? 0 : look.edgeScale, look.dustScale, 0].map(scale => scale ? dotPath(point, dotWidth * scale) : '') }

// 저장된 획: [몸통 세 겹, 테두리, 가루] 외곽선. 지우개 조각(sampled)은 곡선을 다시 펴지 않는다.
export function pencilLayerPaths(object, dotWidth) {
  const { points, strokeWidth: width } = object
  if (points.length < 2) return dots(points[0], width, dotWidth)
  const source = withDistances(withBasePressure(points), object.inkStartDistance ?? 0)
  const paths = bodyAndDust(object.sampled ? source : nibCurve(source, { step: PENCIL_STEP }), width)
  return [...paths.slice(0, 5), [...paths[5].values()].join('')]
}

// 그리는 중: 구간마다 한 번 계산해 두고(끝난 구간은 다시 계산하지 않는다) 마지막 구간만 새로 만든다. 구간 경계의 법선은 이웃 구간 점으로 맞춘다.
const partCache = new WeakMap()
// 구간마다 [겹 경로 5개, 슬롯 Map]. 끝난 구간은 캐시한 같은 배열을 돌려준다.
function pencilPreviewParts(parts, width) {
  return parts.map((part, i) => {
    const live = i === parts.length - 1, cached = partCache.get(part)
    if (!live && cached?.width === width) return cached.paths
    const samples = curveOfPart({ ...part, points: withBasePressure(part.points), curveBefore: basePoint(part.curveBefore) }, PENCIL_STEP)
    const paths = samples.length > 1 ? bodyAndDust(samples, width, { capStart: !part.curveBefore, capEnd: !part.continuing }) : [...Array(LAYERS - 1).fill(''), new Map()]
    if (!live) partCache.set(part, { width, paths })
    return paths
  })
}
const isPencilDot = parts => parts.length === 1 && parts[0].points.length === 1
export function pencilPreviewPaths(parts, width, dotWidth) {
  if (isPencilDot(parts)) return dots(parts[0].points[0], width, dotWidth)
  const layers = Array.from({ length: LAYERS }, () => []), slots = new Map()
  for (const paths of pencilPreviewParts(parts, width)) {
    paths.slice(0, LAYERS - 1).forEach((path, n) => layers[n].push(path))
    paths[LAYERS - 1].forEach((slot, n) => slots.set(n, slot))
  }
  return [...layers.slice(0, LAYERS - 1).map(list => list.join('')), [...slots.values()].join('')]
}
