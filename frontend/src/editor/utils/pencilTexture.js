// 연필 결(코덱스 2026-11-02): 획은 '불투명한 흑연 면 + 종이 결 구멍' 한 겹과 가장자리 가루 한 겹이다.
// 무늬는 모듈을 불러올 때 한 번만 만들고, 페이지 좌표에 고정된 12 × 12 타일로 깐다(획을 따라 늘어나지 않는다).
// 무늬 경로는 연필 획마다 복사되므로 좌표를 10배 정수로 적어 문자열을 줄인다. 타일 안 좌표는 0~24(= 페이지 12).
export const GRAPHITE_TILE_SIZE = 24
const SCALE = 10
export const GRAPHITE_VIEWBOX = GRAPHITE_TILE_SIZE * SCALE
export const PENCIL_TILE = 12
const PAGE = GRAPHITE_TILE_SIZE / PENCIL_TILE // 페이지 1 = 타일 좌표 2
const noise = (i) => {
  const value = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}
const q = value => Math.round(value * SCALE)
// 절대 좌표를 먼저 반올림한 뒤 차이를 적어 상대 좌표 오차가 쌓이지 않게 한다.
function relative(points) {
  const [first, ...rest] = points.map(([x, y]) => [q(x), q(y)])
  let [px, py] = first
  const steps = rest.map(([x, y]) => { const step = `${x - px} ${y - py}`; px = x; py = y; return step })
  return `M${first[0]} ${first[1]}l${steps.join(' ')}Z`.replace(/ -/g, '-')
}
// 꼭짓점을 흔든 다각형. sides · jitter 는 크기 등급마다 다르다.
function grain(x, y, r, seed, sides, jitter) {
  const turn = noise(seed + 1) * Math.PI * 2
  return Array.from({ length: sides }, (_, k) => {
    const a = turn + k * Math.PI * 2 / sides, rr = r * (1 - jitter + noise(seed + 2 + k) * jitter * 2)
    return [x + Math.cos(a) * rr, y + Math.sin(a) * rr]
  })
}
// 종이 섬유형 틈: 가늘고 긴 사각(종횡비 3:1~7:1), 각도는 문서 기준 15° · 35° · 95° · 145° ± 12°(획 방향과 무관)
const FIBER_ANGLES = [15, 35, 95, 145]
function fiber(x, y, length, width, seed) {
  const a = (FIBER_ANGLES[Math.floor(noise(seed) * 4)] + (noise(seed + 1) - 0.5) * 24) * Math.PI / 180
  const ux = Math.cos(a) * length / 2, uy = Math.sin(a) * length / 2, vx = -Math.sin(a) * width / 2, vy = Math.cos(a) * width / 2
  return [[x - ux - vx, y - uy - vy], [x + ux - vx, y + uy - vy], [x + ux + vx, y + uy + vy], [x - ux + vx, y - uy + vy]]
}
// 타일 경계에 걸친 모양은 맞은편에도 그려 이음매 없이 이어지게 한다
function wrapped(shape, reach, size = GRAPHITE_TILE_SIZE) {
  const [cx, cy] = shape.reduce(([sx, sy], [x, y]) => [sx + x / shape.length, sy + y / shape.length], [0, 0])
  const shapes = []
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    if (cx + dx + reach < 0 || cy + dy + reach < 0 || cx + dx - reach > size || cy + dy - reach > size) continue
    shapes.push(relative(shape.map(([x, y]) => [x + dx, y + dy])))
  }
  return shapes.join('')
}
// 서로 겹치지 않게 놓는다(evenodd 에서 겹친 구멍은 다시 메워진다). 군집 2~3개 둘레에 조금 더 모인다.
function scatter(specs, seed, size = GRAPHITE_TILE_SIZE, spacing = 1.08) {
  const clusters = Array.from({ length: 2 + Math.floor(noise(seed) * 2) }, (_, i) => [noise(seed + 10 + i) * size, noise(seed + 20 + i) * size])
  const placed = []
  specs.forEach((spec, n) => {
    for (let tries = 0; tries < 60; tries++) {
      const i = n * 61 + tries
      let x = noise(seed + 100 + i * 3) * size, y = noise(seed + 101 + i * 3) * size
      if (noise(seed + 102 + i * 3) < 0.3) {
        const [cx, cy] = clusters[i % clusters.length]
        x = (cx + (x - size / 2) * 0.4 + size) % size; y = (cy + (y - size / 2) * 0.4 + size) % size
      }
      const apart = ([px, py, pr]) => {
        const dx = Math.min(Math.abs(px - x), size - Math.abs(px - x)), dy = Math.min(Math.abs(py - y), size - Math.abs(py - y))
        return Math.hypot(dx, dy) > (pr + spec.reach) * spacing
      }
      if (placed.every(apart)) { placed.push([x, y, spec.reach, spec, seed + 500 + n * 9]); break }
    }
  })
  return placed
}

// 종이 결 구멍(코덱스 2026-11-02 참고 비교): 아주 작은 날카로운 알갱이가 대부분, 중간 칩 · 큰 칩은 보조, 섬유형 틈이 섞인다.
// 굵기 등급마다 구멍 크기 상한과 종이 노출 면적이 다르다(가는 획 18% · 중간 23% · 굵은 획 29% 안팎 — paperCoverage 로 확인).
// 반지름 · 길이는 페이지 단위. 획마다 4가지 위상 중 하나를 써서(획 id 로 고정) 다른 획과 겹치면 구멍 일부가 메워져 진해진다.
// 사용자 선택(2026-11-02, 참고 이미지 'Combined 1'): 선은 거의 꽉 차고 결은 아주 은은하게. 코덱스 미감 리뷰 3판(태블릿 캡처):
// 흰 점이 도드라지는 것이 가장 큰 차이라 구멍을 아주 작게(반지름 0.04~0.12) · 드물게 — 면적 약 0.8 / 1.3 / 2%.
const HOLE_SETS = {
  small: { micro: 70, microR: [0.04, 0.1], mid: 0, midR: [0.1, 0.12], big: 0, fibers: 6, fiberWidth: [0.035, 0.07], scale: 1, spacing: 1.2 },
  medium: { micro: 90, microR: [0.04, 0.11], mid: 8, midR: [0.1, 0.12], big: 0, fibers: 8, fiberWidth: [0.035, 0.07], scale: 1, spacing: 1.2 },
  large: { micro: 110, microR: [0.05, 0.12], mid: 14, midR: [0.1, 0.12], big: 0, fibers: 10, fiberWidth: [0.035, 0.07], scale: 1, spacing: 1.2 },
  // 굵은 연필의 종이 결(겹 하나당 구멍 약 40%, 코덱스 리뷰 4판 46% → 5판 40%): 고운 알갱이(반지름 약 0.12~0.30) 위주 + 드문 굵은 알갱이.
  // 폭이 다른 겹 셋이 쌓이며 구멍이 메워져 가장자리는 성기고 가운데는 진하다 — 심 가운데에 압력이 몰리는 실제 연필처럼.
  tooth: { micro: 440, microR: [0.067, 0.167], mid: 40, midR: [0.17, 0.19], big: 16, bigR: [0.19, 0.26], fibers: 30, fiberWidth: [0.05, 0.09], scale: 1.8, spacing: 0.58 },
}
function holeShapes(set, seed) {
  const pick = (range, n) => set.scale * (range[0] + noise(seed + n * 17) * (range[1] - range[0]))
  const specs = []
  for (let n = 0; n < set.big; n++) { const r = PAGE * pick(set.bigR ?? [0.29, 0.4], n); specs.push({ r, reach: r * 1.3, sides: 5 + (n % 2), jitter: 0.28 }) }
  for (let n = 0; n < set.fibers; n++) { const length = PAGE * pick([0.38, 0.85], n + 300), width = PAGE * pick([0.045, 0.085], n + 400); specs.push({ fiber: [length, width], reach: length / 2 }) }
  for (let n = 0; n < set.mid; n++) { const r = PAGE * pick(set.midR, n + 100); specs.push({ r, reach: r * 1.25, sides: n % 5 ? 4 : 5, jitter: 0.22 }) }
  for (let n = 0; n < set.micro; n++) { const r = PAGE * pick(set.microR, n + 200); specs.push({ r, reach: r * 1.2, sides: 4, jitter: 0.15 }) }
  return scatter(specs, seed, GRAPHITE_TILE_SIZE, set.spacing).map(([x, y, , spec, s]) => spec.fiber ? fiber(x, y, ...spec.fiber, s) : grain(x, y, spec.r, s, spec.sides, spec.jitter))
}
const TILE_RECT = `M0 0H${GRAPHITE_VIEWBOX}V${GRAPHITE_VIEWBOX}H0Z`
const SEEDS = [1231, 4127, 7919, 9341]
const PAPER = Object.fromEntries(Object.entries(HOLE_SETS).map(([name, set]) => [name, SEEDS.map(seed => holeShapes(set, seed))]))
export const PENCIL_THICK = 4.5
export const paperClass = width => width < 3.5 ? 'small' : width < PENCIL_THICK ? 'medium' : 'tooth'
// 알갱이마다 진하기가 다르다(사용자: 연필은 같은 구간에서도 점 하나하나가 같은 진하기가 아니다).
//  - base: 흑연 면 − 종이 결 구멍(evenodd), 불투명 0.88
//  - half: 구멍 중 약 40% 에 흑연이 반쯤 묻은 듯 0.35 로 다시 채움
//  - dark: 진한 흑연 알갱이(반지름 0.08~0.2) 타일당 90개를 1.0 으로 — 면 위에서도 구멍 안에서도 더 짙은 점
export const PAPER_TONE = { base: 0.88, half: 0.35, dark: 1 }
const darkSpecks = seed => scatter(Array.from({ length: 90 }, (_, n) => { const r = PAGE * (0.08 + noise(seed + n * 11) * 0.12); return { r, reach: r * 1.1, sides: 4 + (n % 2), jitter: 0.25 } }), seed, GRAPHITE_TILE_SIZE, 0.9)
  .map(([x, y, , spec, sd]) => wrapped(grain(x, y, spec.r, sd, spec.sides, spec.jitter), PAGE)).join('')
export const PAPER_PATTERNS = Object.fromEntries(Object.entries(PAPER).map(([name, list]) =>
  [name, list.map((shapes, phase) => ({
    base: TILE_RECT + shapes.map(shape => wrapped(shape, PAGE)).join(''),
    half: shapes.filter((_, i) => noise(SEEDS[phase] + i * 5 + 1) < 0.4).map(shape => wrapped(shape, PAGE)).join(''),
    dark: darkSpecks(SEEDS[phase] + 77),
  }))]))
// 타일에서 구멍(종이)이 차지하는 비율. 겹친 구멍은 evenodd 로 다시 메워지므로 격자 표본으로 센다(검사용).
const inside = (x, y, shape) => {
  let hit = false
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const [xi, yi] = shape[i], [xj, yj] = shape[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit
  }
  return hit
}
export function paperCoverage(name, index = 0, grid = 160) {
  const copies = PAPER[name][index].flatMap(shape => [-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dy => shape.map(([x, y]) => [x + dx * GRAPHITE_TILE_SIZE, y + dy * GRAPHITE_TILE_SIZE]))))
  let open = 0
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
    const x = (i + 0.5) * GRAPHITE_TILE_SIZE / grid, y = (j + 0.5) * GRAPHITE_TILE_SIZE / grid
    if (copies.filter(shape => inside(x, y, shape)).length % 2) open++
  }
  return open / grid / grid
}
export const paperPatternIndex = seed => (Number.isFinite(seed) ? seed >>> 0 : 0) % SEEDS.length

// 밀도 얼룩: 36 × 36(작은 결 타일과 주기가 달라 반복이 덜 보인다) 위에 불규칙한 덩어리 몇 개를 반투명으로 얹어
// 한 획 안에서도 진한 곳 · 성긴 곳이 바뀌게 한다. 덩어리 면적 약 30%, 굵은 획일수록 진하다(paperBlotchOpacity).
export const BLOTCH_TILE = 36
const BLOTCH_SIZE = BLOTCH_TILE * PAGE
export const BLOTCH_VIEWBOX = BLOTCH_SIZE * SCALE
export const BLOTCH_PATTERN = (() => {
  const blobs = []
  for (let n = 0; n < 9; n++) {
    const x = noise(8101 + n * 3) * BLOTCH_SIZE, y = noise(8102 + n * 3) * BLOTCH_SIZE, r = PAGE * (2.2 + noise(8103 + n * 3) * 2.6)
    blobs.push(wrapped(grain(x, y, r, 8200 + n * 11, 9, 0.35), r * 1.4, BLOTCH_SIZE))
  }
  return blobs.join('')
})()
export const paperBlotchOpacity = () => 0

// 가장자리 가루: 입자만(반지름 페이지 0.08~0.22). 타일당 18개(코덱스 리뷰 3판).
const DUST = scatter(Array.from({ length: 18 }, (_, n) => { const r = PAGE * (0.08 + noise(2711 + n * 13) * 0.14); return { r, reach: r * 1.2, sides: 4 + (n % 2), jitter: 0.2 } }), 2711)
export const DUST_PATTERN = DUST.map(([x, y, , spec, s]) => wrapped(grain(x, y, spec.r, s, spec.sides, spec.jitter), PAGE)).join('')

// 테두리 알갱이(사용자: 참고 이미지처럼 테두리를 오톨도톨하게): 몸통 바로 바깥 좁은 띠를 불투명 흑연 알갱이(반지름 페이지 0.10~0.24)로
// 약 13% 덮는다(코덱스 리뷰 3 · 4판: 40% 는 사포, 22% 도 에어브러시처럼 보였다). 몸통이 안쪽을 가리므로 바깥 띠에서만 보여, 가장자리가 알갱이 단위로 울퉁불퉁해진다.
const EDGE = scatter(Array.from({ length: 150 }, (_, n) => { const r = PAGE * (0.1 + noise(3301 + n * 13) * 0.14); return { r, reach: r * 1.15, sides: 4 + (n % 3), jitter: 0.25 } }), 3301, GRAPHITE_TILE_SIZE, 1.1)
// 테두리 알갱이도 반은 진하게(1) 반은 옅게(0.5)
const edgeShapes = EDGE.map(([x, y, , spec, s]) => wrapped(grain(x, y, spec.r, s, spec.sides, spec.jitter), PAGE))
export const EDGE_PATTERN = { strong: edgeShapes.filter((_, i) => i % 2 === 0).join(''), light: edgeShapes.filter((_, i) => i % 2).join('') }
