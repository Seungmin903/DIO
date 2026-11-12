import { brushSeed } from './pencilSeed.js'
export const PEN_MATERIAL_RENDER_VERSION = 3
// 페이지 논리 좌표를 요소 내부 좌표로 변환한다. w/h는 현재 크기,
// baseWidth/baseHeight는 원래 좌표계이므로 공통 이동·회전·리사이즈를 재사용한다.
export const DEFAULT_PEN = { color: '#0B1766', width: 3 }
/**
 * 유리펜 잉크가 획 실루엣 **밖으로** 번지는 폭(페이지 좌표).
 *
 * 유리펜은 필터를 실루엣보다 MARGIN(화면 3px)만큼 부풀린 자리까지 그려 두고, 2026-11-13 부터
 * 그것을 깎지 않는다 — 깎으면 커피링 · 테가 칼같이 끊겨 그래픽처럼 보였다. 그래서 **번진 자리까지가
 * 획이다**(사용자 2026-11-13 "리미트 풀린 곳까지를 획으로 하자): 상자 · 지우개 · 선택이 다 같은
 * 여유를 본다. 안 그러면 눈에 보이는 잉크에 지우개를 대도 안 지워진다.
 *
 * 화면 3px 은 배율 1 · 픽셀비 2~2.6 에서 페이지 1.15~1.5 다. 배율마다 달라지는 값을 획에 박을 수는
 * 없으니 **가장 큰 쪽으로** 잡는다 — 모자라면 잉크가 판정 밖에 남지만, 넘치면 빈자리가 조금 더
 * 집히는 정도라 덜 나쁘다.
 */
export const GLASS_BLEED = 1.5

/**
 * 유리펜 무늬를 **페이지**에 붙이는 밀어주기. 손을 뗀 획은 요소 좌표(상자 왼쪽 위가 원점)로
 * 그려지므로, 셰이더에 이 값을 더해야 페이지 자리가 된다.
 * 그을 때 적어 둔 inkOrigin 을 먼저 쓴다 — 나중에 옮겨도 무늬가 획을 따라가야 하기 때문이다
 * (연필이 grainOrigin 으로 종이 이빨을 붙이는 것과 같은 생각).
 * 옛 획에는 그 값이 없으니 **지금 자리**를 쓴다. 옮기면 무늬가 바뀌지만, 모든 획이 같은 무늬를
 * 받는 것(2026-11-13 에 고친 증상)보다는 낫다.
 */
export const glassOrigin = object => object?.inkOrigin ?? { x: object?.x ?? 0, y: object?.y ?? 0 }
const SENSOR_PRECISION = { force: 10000, time: 10, speed: 10000, tiltX: 10, tiltY: 10, inkDistance: 10000 }
const storedPoint = (point, x, y, renderVersion) => {
  const result = { x: point.x - x, y: point.y - y, ...(point.pressure != null && { pressure: point.pressure }) }
  // Only the new material version needs sensor metadata. Never serialize event
  // objects/arbitrary keys or round existing geometry and width multipliers.
  if (renderVersion === PEN_MATERIAL_RENDER_VERSION) for (const [key, scale] of Object.entries(SENSOR_PRECISION)) {
    if (point[key] != null) result[key] = Math.round(point[key] * scale) / scale
  }
  return result
}

// opacity: 펜 설정의 불투명도(0.1~1). 1 이 아니면 획의 불투명도(요소 옵션의 불투명도와 같은 값)로 저장한다.
export function createStroke(points, { id, color = DEFAULT_PEN.color, width = DEFAULT_PEN.width, kind = 'ball', lineCap = 'round', renderVersion = 2, materialSeed, opacity = 1, dashLength, dashGap, inkGlitter, inkSheen, inkFilm, inkGlitterColor, inkAmount, inkSheenColor, inkSheenAmount } = {}) {
  if (!points.length) return null
  const dashed = kind === 'dashed' || kind === 'dotted'
  if (dashed) renderVersion = PEN_MATERIAL_RENDER_VERSION
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('필기 좌표가 올바르지 않아요.')
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  // 스퀘어 끝은 대각선에서도 경계에 잘리지 않도록 여백을 확보한다.
  // 붓펜 머리는 굵기의 1.45배까지 커진다(nibStroke BRUSH_MAX_SCALE). 힘 배율은 아래 pressure 최대값에 이미 들어 있다
  // 유리펜은 실루엣 밖으로 번진 자리까지가 획이다(GLASS_BLEED) — 양쪽이므로 두 번 더한다
  const padding = width * points.reduce((max, p) => Math.max(max, p.pressure ?? 1), 1) * (kind === 'highlighter' && lineCap === 'square' ? Math.SQRT2 : kind === 'taperBrush' ? 1.45 : 1)
    + (kind === 'glass' ? 2 * GLASS_BLEED : 0)
  const w = Math.max(20, maxX - minX + padding)
  const h = Math.max(20, maxY - minY + padding)
  const x = (minX + maxX - w) / 2, y = (minY + maxY - h) / 2
  return {
    id, type: 'stroke', name: kind === 'highlighter' ? '형광펜 획' : '펜 획', x, y, w, h, rotation: 0,
    baseWidth: w, baseHeight: h, color, strokeWidth: width, penKind: kind, renderVersion,
    ...(renderVersion === PEN_MATERIAL_RENDER_VERSION && { materialSeed: materialSeed ?? 0 }),
    ...(kind === 'highlighter' && { lineCap }),
    ...(dashed && Number.isFinite(dashLength) && { dashLength }),
    ...(dashed && Number.isFinite(dashGap) && { dashGap }),
    ...(kind !== 'highlighter' && opacity < 1 && { opacity }),
    // 연필: 요소 좌표에서 페이지 원점 자리 + 획 시드(첫 점 페이지 좌표의 해시). 종이 이빨이 페이지에 붙고, 옮겨도 무늬가 획과 함께 움직인다. 쓰는 중과 같은 값
    // 유리펜 잉크 설정은 획에 박아 둔다(나중에 설정을 바꿔도 이미 그린 획은 그대로)
    // 코팅 두께 · 글리터 색 · 테 색은 **고른 것만** 적는다. 안 적으면 '맞춤'(펜 색에서 자동 계산)이다 —
    // 예전에는 inkFilm 을 55(은)로 박아 넣어, 맞춤으로 그어도 획은 늘 은빛이었다(2026-11-10).
    // inkGlitterColor 는 아예 빠져 있어서 **직접 고른 글리터 색이 획에 안 남았다**(쓰는 중에는 보이는데
    // 손을 떼면 사라짐 — 쓰는 중에는 설정을 그대로 읽기 때문). 견본(inkFilm)만 되던 이유다.
    // 유리펜 무늬(농담 · 운모 막 · 테 물결 · 글리터)를 **페이지**에 붙이기 위해 그은 자리를 적어 둔다.
    // 없으면 셰이더가 획 자기 좌표를 받아 **어디에 긋든 같은 무늬**가 나온다(실기 측정 2026-11-13:
    // 떨어뜨려 그은 같은 손놀림 두 획의 입자 2162개 중 2158개가 같은 자리였다).
    // 적어 두면 나중에 옮겨도 무늬가 획을 따라간다 — 연필이 grainOrigin 으로 종이 이빨을 붙이는 것과 같다.
    ...(kind === 'glass' && { inkOrigin: { x, y } }),
    ...(kind === 'glass' && { inkGlitter: inkGlitter !== false, inkSheen: inkSheen !== false, inkAmount: inkAmount ?? 1, inkSheenAmount: inkSheenAmount ?? 1,
      ...(Number.isFinite(inkFilm) && { inkFilm }), ...(inkGlitterColor && { inkGlitterColor }), ...(inkSheenColor && { inkSheenColor }) }),
    ...(kind === 'pencil' && { grainOrigin: { x: -x, y: -y, seed: brushSeed(points[0]) } }),
    points: points.map((p) => storedPoint(p, x, y, renderVersion)),
  }
}

// 가변 굵기를 하나의 닫힌 경로로 표현해 SVG 요소 수가 늘어나지 않게 한다.
export function strokeOutline(points, width, { start = false, end = false } = {}) {
  if (points.length < 2) return ''
  const left = [], right = []
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)]
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || 1
    const radius = width * (p.pressure ?? 1) / 2
    left.push(`${p.x - dy / distance * radius} ${p.y + dx / distance * radius}`)
    right.push(`${p.x + dy / distance * radius} ${p.y - dx / distance * radius}`)
  })
  if (!start && !end) return `M${left.join('L')}L${right.reverse().join('L')}Z`
  const cap = (point, neighbour) => {
    const angle = Math.atan2(point.y - neighbour.y, point.x - neighbour.x) + Math.PI / 2
    const radius = width * (point.pressure ?? 1) / 2
    return Array.from({ length: 12 }, (_, n) => {
      const a = angle - Math.PI * (n + 1) / 12
      return `${point.x + Math.cos(a) * radius} ${point.y + Math.sin(a) * radius}`
    })
  }
  return `M${left.join('L')}L${end ? cap(points.at(-1), points.at(-2)).join('L') : right.at(-1)}L${right.slice().reverse().join('L')}${start ? 'L' + cap(points[0], points[1]).join('L') : ''}Z`
}

export function strokePath(points) {
  if (!points?.length) return ''
  const [first] = points
  // round linecap으로 단순 탭도 점을 남긴다.
  if (points.length === 1) return `M${first.x} ${first.y}l0.01 0`
  if (points.length === 2) return `M${first.x} ${first.y}L${points[1].x} ${points[1].y}`
  // 점과 점을 직선으로 이으면 작은 동그라미가 다각형처럼 각진다. 입력 점을 조절점으로 두고 이웃 점의 가운데를 잇는
  // 2차 곡선으로 그린다(점 수만큼의 명령이라 미리보기 비용은 같다). 시작 · 끝점은 그대로 지난다.
  let path = `M${first.x} ${first.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], q = points[i + 1]
    path += `Q${p.x} ${p.y} ${(p.x + q.x) / 2} ${(p.y + q.y) / 2}`
  }
  const last = points[points.length - 1]
  return path + `L${last.x} ${last.y}`
}

const boundedTangent = (value, delta) => delta === 0 ? 0 : delta * Math.max(0, Math.min(3, value / delta))

// 두 점 사이 곡선 위의 점. 앞뒤 점으로 접선을 잡되 구간 길이 비율로 줄여(chordal) 점 간격이 고르지 않아도 튀지 않는다.
function curvePoint(p0, a, b, p3, t) {
  const dab = Math.hypot(b.x - a.x, b.y - a.y)
  const d0 = Math.hypot(a.x - p0.x, a.y - p0.y), d3 = Math.hypot(p3.x - b.x, p3.y - b.y)
  const ka = dab / ((d0 + dab) || 1), kb = dab / ((dab + d3) || 1)
  // cubic Bézier 제어점(a + ta/3, b - tb/3)을 구간 경계 안에 제한한다.
  // 얇은 ㄱ자도 기존 저장 AABB 밖으로 부풀지 않으며 원본 점·크기는 유지한다.
  const tax = boundedTangent((b.x - p0.x) * ka, b.x - a.x), tay = boundedTangent((b.y - p0.y) * ka, b.y - a.y)
  const tbx = boundedTangent((p3.x - a.x) * kb, b.x - a.x), tby = boundedTangent((p3.y - a.y) * kb, b.y - a.y)
  const t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2
  return { x: h00 * a.x + h10 * tax + h01 * b.x + h11 * tbx, y: h00 * a.y + h10 * tay + h01 * b.y + h11 * tby }
}

// Render-only samples: document coordinates, pressure and sensor records stay intact.
// Use a per-segment budget so preview chunks and the saved stroke share geometry.
export function samplePenCurve(points, startDistance = 0, { first = 0, last = points.length - 1 } = {}) {
  if (!points.length) return []
  const sampled = [{ ...points[first], inkDistance: points[first].inkDistance ?? startDistance }]
  let travelled = startDistance
  for (let i = first + 1; i <= last; i++) {
    const a = points[i - 1], b = points[i], p0 = points[i - 2] ?? a, p3 = points[i + 1] ?? b
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const from = a.inkDistance ?? travelled, to = b.inkDistance ?? from + length
    const curved = [0.25, 0.5, 0.75].some(t => {
      const p = curvePoint(p0, a, b, p3, t)
      return Math.hypot(p.x - a.x - (b.x - a.x) * t, p.y - a.y - (b.y - a.y) * t) > 0.01
    })
    const steps = Math.min(512, Math.max(curved ? 2 : 1, Math.ceil(length / 6 - 1e-9)))
    for (let j = 1; j <= steps; j++) {
      const t = j / steps
      const point = j === steps ? { ...b } : { ...a,
        ...(curved ? curvePoint(p0, a, b, p3, t) : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }),
        pressure: (a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * t }
      if (j !== steps) for (const key of Object.keys(SENSOR_PRECISION)) {
        if (a[key] != null && b[key] != null) point[key] = a[key] + (b[key] - a[key]) * t
      }
      point.inkDistance = from + (to - from) * t
      sampled.push(point)
    }
    travelled += length
  }
  return sampled
}

// Preview overlaps need the preceding neighbour too; the trailing point is
// tangent context only, otherwise cached chunks freeze an unfinished curve.
export function samplePenPart(part) {
  const points = part.curveBefore ? [part.curveBefore, ...part.points] : part.points
  return samplePenCurve(points, part.startDistance ?? 0, {
    first: part.curveBefore ? 1 : 0,
    last: points.length - (part.continuing ? 2 : 1),
  })
}

// Keep the material renderer's continuous, consistently wound nib sweeps.
export function penContour(points, width, kind) {
  return penSweeps(samplePenCurve(points), width, kind).map(piece => piece.path).join('')
}

// 획 하나가 이 다각형 수백 개로 나온다(구간마다 사각형 + 꺾임마다 부채꼴). 도장 1500개짜리 획이면
// 꼭짓점 3000개 - 글자 10만 자가 **매 프레임** 만들어진다(실측 2026-11-10 실기: 쓸기만 15ms).
// 그래서 여기서는 한 꼭짓점도 헛돌면 안 된다 - 반올림은 한 번만 하고(전에는 넓이용으로 한 벌 만들고
// 글자로 쓸 때 또 했다), 중간 객체 배열과 join 용 글자 배열을 만들지 않는다. 내는 글자는 그대로다.
const polygonPath = points => {
  const n = points.length
  if (!n) return ''
  const xs = new Float64Array(n), ys = new Float64Array(n)
  for (let i = 0; i < n; i++) { xs[i] = Math.round(points[i].x * 1000) / 1000; ys[i] = Math.round(points[i].y * 1000) / 1000 }
  let area = 0
  for (let i = 0; i < n; i++) { const j = i + 1 === n ? 0 : i + 1; area += xs[i] * ys[j] - xs[j] * ys[i] }
  if (Math.abs(area) < 1e-10) return ''
  let d = ''
  // 넓이가 음수면 뒤집어 그린다(앞의 points.reverse() 와 같은 차례다)
  if (area < 0) for (let i = n - 1; i >= 0; i--) d += `${i === n - 1 ? 'M' : 'L'}${xs[i]} ${ys[i]}`
  else for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${xs[i]} ${ys[i]}`
  return d + 'Z'
}

// 농도도 화면 x/y가 아닌 실제 누적 이동 거리를 사용한다.
// 호를 직선으로 나눌 때 허용하는 현 오차(좌표 단위). 0.25 면 화면 픽셀 기준 네 픽셀에 한 번도
// 티가 안 난다. 더 줄이면 점만 늘고 눈에는 같다.
const ARC_SAG = 0.25

export function penSweeps(points, width, kind, startDistance = 0, { capStart = true, capEnd = true } = {}) {
  if (!points.length) return []
  const pieces = []
  // 중복 위치는 마지막 압력을 사용한다. 0 길이 구간의 접선은 만들지 않는다.
  const clean = []
  for (const p of points) {
    const previous = clean.at(-1)
    if (previous && Math.hypot(p.x - previous.x, p.y - previous.y) < 1e-8) clean[clean.length - 1] = p
    else clean.push(p)
  }
  const offset = (angle, radius) => {
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius
    return kind === 'fountain' ? { x: x * 0.94 + y * 0.06, y: x * 0.06 + y * 0.94 } : { x, y }
  }
  const radius = p => width * (p.pressure ?? 1) / 2
  const arc = (p, angle, turn, distance) => {
    // 호를 **반지름에 맞춰** 나눈다. 15도 고정이면 반원 캡이 12조각(= 24각형)이라, 굵거나 확대하면
    //   획 시작 · 끝이 원이 아니라 **직선 모음**으로 보인다(사용자 2026-11-13).
    //   현 오차(원과 직선 사이 가장 먼 거리) = r(1 - cos(θ/2)) 를 ARC_SAG 이하로 두면 그 눈금에서
    //   둥글게 보인다. 좌표가 화면 픽셀로 들어오는 경로(유리펜)는 그대로 픽셀 기준이 된다.
    const r = Math.max(0.5, radius(p))
    const step = Math.min(Math.PI / 12, 2 * Math.acos(Math.max(0, 1 - ARC_SAG / r)))
    const steps = Math.max(1, Math.ceil(Math.abs(turn) / step))
    const vertices = [p]
    for (let i = 0; i <= steps; i++) {
      const d = offset(angle + turn * i / steps, radius(p))
      vertices.push({ x: p.x + d.x, y: p.y + d.y })
    }
    pieces.push({ path: polygonPath(vertices), distance, point: p })
  }
  if (clean.length === 1) { arc(clean[0], 0, Math.PI * 2, startDistance); return pieces }
  let travelled = clean[0].inkDistance ?? startDistance, previousAngle
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1], b = clean[i]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const endDistance = b.inkDistance ?? travelled + length
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    if (i === 1) { if (capStart) arc(a, angle + Math.PI / 2, Math.PI, travelled) }
    else {
      const turn = Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle))
      if (Math.abs(turn) > 1e-8) arc(a, previousAngle - Math.sign(turn) * Math.PI / 2, turn, travelled)
    }
    const da = offset(angle + Math.PI / 2, radius(a)), db = offset(angle + Math.PI / 2, radius(b))
    // 반올림된 접합선이 딱 맞닿기만 하면 SVG 래스터화에서 가는 밝은 이음선이 생긴다.
    // 끝/조인 안쪽으로만 아주 작게 겹쳐 같은 Path의 채움으로 합친다.
    const overlap = Math.min(0.04, radius(a) * 0.02, radius(b) * 0.02)
    const ox = Math.cos(angle) * overlap, oy = Math.sin(angle) * overlap
    pieces.push({ path: polygonPath([
      { x: a.x + da.x - ox, y: a.y + da.y - oy }, { x: b.x + db.x + ox, y: b.y + db.y + oy },
      { x: b.x - db.x + ox, y: b.y - db.y + oy }, { x: a.x - da.x - ox, y: a.y - da.y - oy },
    ]), distance: (travelled + endDistance) / 2, point: { ...a,
      ...(a.force != null && b.force != null && { force: (a.force + b.force) / 2 }),
      ...(a.speed != null && b.speed != null && { speed: (a.speed + b.speed) / 2 }) } })
    travelled = endDistance
    previousAngle = angle
    if (i === clean.length - 1 && capEnd) arc(b, angle - Math.PI / 2, Math.PI, travelled)
  }
  return pieces
}

// 종이 결은 좌표가 고정된 SVG 패턴으로 표현해 저장·새로고침·출력 시 바뀌지 않는다.
export const PENCIL_GRAIN_SIZE = 14
const grainNoise = (i) => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n) }
export const PENCIL_GRAIN = Array.from({ length: 80 }, (_, i) => ({
  x: grainNoise(i + 1) * PENCIL_GRAIN_SIZE,
  y: grainNoise(i + 131) * PENCIL_GRAIN_SIZE,
  radius: 0.2 + grainNoise(i + 261) * 0.65,
  opacity: 0.28 + (i % 5) * 0.13,
}))
