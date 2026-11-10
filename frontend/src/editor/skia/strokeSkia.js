import { BlendMode, FilterMode, MipmapMode, PaintStyle, Skia, StrokeCap, StrokeJoin, TileMode, VertexMode } from '@shopify/react-native-skia'
import { createStrokePreview, partPath } from '../utils/strokePreview.js'
import { isDashedKind, dashedPreviewContour, dashedObjectContour } from '../utils/dashedStroke.js'
import { ballPreviewPaths, ballSweepPath, ballVaries, isNibKind, nibContour, nibPreviewPaths } from '../utils/nibStroke.js'
import { PENCIL_BRUSH, pencilAccumulates, PENCIL_STRAND_SKSL, strandUniforms, brushPartSamples, depositFloor, depositGain, brushSampledPoints, brushSeed, ribbonStretch, copyDabs, previewSegmentFor, shaderCap, shaderDabAlpha, shaderUniforms, PENCIL_SHADER_SKSL, brushTipPower, partRange, partTotal, paperMatrices, paperUniforms, pencilDabs, PENCIL_PAPER_SKSL } from '../utils/pencilBrush.js'
import { HIGHLIGHTER_OPACITY } from '../utils/penSettings.js'
import { drawGlassStroke } from './glassStroke.js'
// 유리펜 잉크 설정(획 설정 · 저장 획 공용). 없으면 기본값(글리터 · 테 켬)
const glassInkOf = one => ({ glitter: one?.inkGlitter !== false, sheen: one?.inkSheen !== false, film: one?.inkFilm, glitterColor: one?.inkGlitterColor, amount: one?.inkAmount, sheenColor: one?.inkSheenColor, sheenAmount: one?.inkSheenAmount })
const glassKey = one => `|${one?.inkGlitter !== false}|${one?.inkSheen !== false}|${one?.inkFilm ?? ''}|${one?.inkGlitterColor ?? ''}|${one?.inkAmount ?? ''}|${one?.inkSheenColor ?? ''}|${one?.inkSheenAmount ?? ''}`
import { PENCIL_CAP, PENCIL_CAP_DIAMETER, PENCIL_COPY, PENCIL_DOME, PENCIL_DOME_DIAMETER, PENCIL_DOME_FIBER, PENCIL_DOMES, PENCIL_GRAIN_PNG, PENCIL_SMALL, PENCIL_STRAND_PNG, PENCIL_SWEEP, PENCIL_TOOTH_PNG, PENCIL_TIP_DIAMETER, PENCIL_TIPS, PENCIL_TIPS_K2 } from './pencilGrain.js'

// 앱(안드로이드 · iOS)의 필기 그리기: 그리기 앱처럼 획을 Skia 캔버스에 그린다(웹은 SVG 그대로).
// 쓰는 중(parts)과 손을 뗀 뒤(object)가 같은 96점 구간 나눔(createStrokePreview) · 같은 경로 함수 · 같은 페이지 크기 캔버스를 써서
// 펜을 떼도 픽셀이 바뀌지 않는다(SVG 때는 획 상자 SVG 로 바뀌며 연필 결 전체가 달라졌다 — 태블릿 무손실 캡처).
// 예전 펜(만년필 · 펠트펜 · 예전 붓)은 지금 펜(볼펜 · 붓펜)으로 그린다.
export const skiaKind = kind => kind === 'fountain' || kind === 'felt' ? 'ball' : kind === 'brush' ? 'taperBrush' : kind

const parse = d => d ? Skia.Path.MakeFromSVGString(d) : null
const join = paths => {
  const builder = Skia.PathBuilder.Make()
  let any = false
  for (const path of paths) if (path) { builder.addPath(path); any = true }
  return any ? builder.build() : null
}
// 끝난 구간은 같은 구간 객체를 다시 받으므로 그 객체에 Skia 경로를 붙여 둔다
const partPaths = new WeakMap()
const cachedParse = (owner, key, make) => {
  let entry = partPaths.get(owner)
  if (!entry) partPaths.set(owner, entry = {})
  if (!(key in entry)) entry[key] = make()
  return entry[key]
}

const fillPaint = (color, alpha = 1) => {
  const paint = Skia.Paint()
  paint.setAntiAlias(true)
  paint.setColor(Skia.Color(color))
  if (alpha < 1) paint.setAlphaf(alpha)
  return paint
}
const strokePaint = (color, width, square = false) => {
  const paint = fillPaint(color)
  paint.setStyle(PaintStyle.Stroke)
  paint.setStrokeWidth(width)
  paint.setStrokeCap(square ? StrokeCap.Square : StrokeCap.Round)
  paint.setStrokeJoin(StrokeJoin.Round)
  return paint
}

// 연필 브러시(pencilBrush): 도장은 평범한 원으로 덮임만 쌓고, 획 하나를 층 두 겹에 모아 종이 높이와 견준다(paperMatrices 설명).
// 모두 보통 그리기라 화면 픽셀마다 계산된다(이미지 필터는 층을 페이지 단위 해상도로 그려 늘려 붙여 결이 깨졌다).
let paperEffect = null, grainShader = null
// 종이 결 타일: 앱 안에 넣어 둔 PNG 를 한 번만 풀어 반복 셰이더로. 칸이 화면 1px 보다 크게 늘어나므로 큐빅(미첼) 보간 —
// 직선 보간은 늘어난 칸이 흐린 네모로 보였다
// 30판: grainNearest 면 결 칸을 보간 없이 읽는다(큐빅은 칸이 번져 물 얼룩 — 사용자: 연필은 흑연 가루)
const grainPng = () => PENCIL_BRUSH.strand?.on ? PENCIL_TOOTH_PNG : PENCIL_GRAIN_PNG
const grain = () => grainShader ??= PENCIL_BRUSH.grainFilter === 'cubic'
  ? Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(grainPng())).makeShaderCubic(TileMode.Repeat, TileMode.Repeat, 1 / 3, 1 / 3)
  : Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(grainPng())).makeShaderOptions(TileMode.Repeat, TileMode.Repeat, PENCIL_BRUSH.grainFilter === 'nearest' ? FilterMode.Nearest : FilterMode.Linear, MipmapMode.None)
// 결 리본: 곡선 표본(x, y, inkDistance)을 따라 점마다 ±M 법선 정점 두 개 → 삼각형 띠. 결 좌표 = (원점.x + s / E, 원점.y ± M) 라 결이 획 방향으로 E 배 늘어난다.
// 양 끝은 접선 방향으로 M 만큼 연장한다. 점이 2 개 미만이거나 길이가 굵기 × 0.5 미만이면 null(기존 사각형 결로)
function ribbonMesh(samples, origin, width, e) {
  const pts = []
  for (const p of samples) if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.inkDistance) && (!pts.length || p.inkDistance > pts.at(-1).inkDistance)) pts.push(p)
  if (pts.length < 2 || pts.at(-1).inkDistance - pts[0].inkDistance < width * 0.5) return null
  const m = width * 1.9 + 2, positions = [], textures = []
  const push = (x, y, nx, ny, s) => {
    positions.push({ x: x + nx * m, y: y + ny * m }, { x: x - nx * m, y: y - ny * m })
    textures.push({ x: origin.x + s / e, y: origin.y + m }, { x: origin.x + s / e, y: origin.y - m })
  }
  const dir = i => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l] }
  const [fx, fy] = dir(0)
  push(pts[0].x - fx * m, pts[0].y - fy * m, -fy, fx, pts[0].inkDistance - m)
  pts.forEach((p, i) => { const [tx, ty] = dir(i); push(p.x, p.y, -ty, tx, p.inkDistance) })
  const [lx, ly] = dir(pts.length - 1), end = pts.at(-1)
  push(end.x + lx * m, end.y + ly * m, -ly, lx, end.inkDistance + m)
  return Skia.MakeVertices(VertexMode.TriangleStrip, positions, textures)
}
// 32판 가닥 리본: 곡선 표본마다 ±M 법선 정점, 텍스처 좌표 = (시드 + 진행 거리, 시드 ± M). 쓰는 중 · 뗀 뒤 · 지우개 조각이 같은 진행 거리 · 시드라 같은 가닥을 읽는다
let strandEffect, strandTile
// 그물은 표본 두 개에 하나면 충분하다(표본 간격 2, 결은 획 방향으로 길어 꺾임이 안 보인다). capStart · capEnd: 획의 진짜 시작 · 끝만 바깥으로 늘인다(구간 경계는 이웃과 맞닿는다)
function strandMesh(samples, width, seed, capStart = true, capEnd = true) {
  const all = []
  for (const p of samples) if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.inkDistance) && (!all.length || p.inkDistance > all.at(-1).inkDistance)) all.push(p)
  if (all.length < 2) return null
  const pts = all.filter((p, i) => i % 2 === 0 || i === all.length - 1)
  const m = width * 1.9 + 2, su = seed * 400, sv = seed * 733, positions = [], textures = []
  const push = (x, y, nx, ny, s) => {
    positions.push({ x: x + nx * m, y: y + ny * m }, { x: x - nx * m, y: y - ny * m })
    textures.push({ x: su + s, y: sv + m }, { x: su + s, y: sv - m })
  }
  const dir = i => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l] }
  const [fx, fy] = dir(0)
  if (capStart) push(pts[0].x - fx * m, pts[0].y - fy * m, -fy, fx, pts[0].inkDistance - m)
  pts.forEach((p, i) => { const [tx, ty] = dir(i); push(p.x, p.y, -ty, tx, p.inkDistance) })
  const [lx, ly] = dir(pts.length - 1), end = pts.at(-1)
  if (capEnd) push(end.x + lx * m, end.y + ly * m, -ly, lx, end.inkDistance + m)
  return Skia.MakeVertices(VertexMode.TriangleStrip, positions, textures)
}
// 쓰는 중: 끝난 구간의 그물은 다시 만들지 않는다(펜이 움직일 때마다 획 전체를 다시 만들면 획이 길수록 펜을 못 따라온다)
const partMeshes = new WeakMap()
function partMesh(part, width, seed) {
  const key = `${width}|${seed}`, cached = part.continuing && partMeshes.get(part)
  if (cached?.key === key) return cached.mesh
  const mesh = strandMesh(brushPartSamples(part), width, seed, !part.key, !part.continuing)
  if (part.continuing) partMeshes.set(part, { key, mesh })
  return mesh
}
function drawStrandGrain(canvas, paper, bounds, ribbon, width, seed, zoom) {
  const { tooth, strand } = PENCIL_BRUSH.strand
  paper.setBlendMode(BlendMode.Plus)
  paper.setAlphaf(tooth)
  canvas.drawRect(bounds, paper)
  strandEffect ??= Skia.RuntimeEffect.Make(PENCIL_STRAND_SKSL)
  strandTile ??= Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(PENCIL_STRAND_PNG)).makeShaderOptions(TileMode.Repeat, TileMode.Repeat, FilterMode.Linear, MipmapMode.None)
  const shader = Skia.Paint(), plus = Skia.Paint(), meshes = (ribbon?.parts ? ribbon.parts.map(part => partMesh(part, width, seed)) : [ribbon?.samples ? strandMesh(ribbon.samples, width, seed) : null]).filter(Boolean)
  shader.setShader(strandEffect.makeShaderWithChildren(strandUniforms(zoom, width), [strandTile]))
  plus.setBlendMode(BlendMode.Plus)
  plus.setAlphaf(strand)
  // 겹친 리본은 결이 두 배로 더해지지 않게 한쪽만 남긴다 → 되돌릴 때 Plus 로 합친다. 점(탭)은 리본이 없어 그 자리 사각형으로
  // 먼저 그려진 결이 남도록 페인트를 DstOver 로 둔다(2026-11-04 사용자: 쓰는 중 이미 그어진 획의 결이 파동처럼 밀린다). 리본은 굵기 8 에서 절반 폭 17 로 획보다 훨씬 넓어,
  // 나중 리본이 덮어쓰면 펜이 닿지 않은 옆 획의 결까지 펜을 따라 바뀌었다. drawVertices 의 블렌드 인자는 정점 색과 셰이더를 섞는 값이라 정점 색이 없는 여기선 쓰이지 않는다
  shader.setBlendMode(BlendMode.DstOver)
  canvas.saveLayer(plus, bounds)
  if (meshes.length) for (const mesh of meshes) canvas.drawVertices(mesh, BlendMode.Src, shader)
  else canvas.drawRect(bounds, shader)
  canvas.restore()
}
function paperLayer(canvas, origin, width, color, bounds, draw, zoom = 1, ribbon = null, opacity = 1) {
  paperEffect ??= Skia.RuntimeEffect.Make(PENCIL_PAPER_SKSL)
  const [m1, m2] = paperMatrices(width, Skia.Color(color), opacity)
  const black = fillPaint('#000000'), outer = Skia.Paint(), inner = Skia.Paint(), paper = Skia.Paint()
  outer.setColorFilter(Skia.ColorFilter.MakeMatrix(m2))
  inner.setColorFilter(Skia.ColorFilter.MakeMatrix(m1))
  paper.setShader(paperEffect.makeShaderWithChildren(paperUniforms(origin, zoom, width), [grain()]))
  const strandOn = PENCIL_BRUSH.strand?.on, mesh = !strandOn && ribbon && origin ? ribbonMesh(ribbon.samples, origin, width, ribbon.e) : null
  canvas.saveLayer(outer, bounds)
  canvas.drawRect(bounds, black)
  canvas.saveLayer(inner, bounds)
  canvas.drawRect(bounds, black)
  draw()
  if (strandOn) drawStrandGrain(canvas, paper, bounds, ribbon, width, brushSeed(origin), zoom)
  else if (mesh) {
    // 결 전용 한 겹: 겹친 리본은 나중 것이 덮어써서(Src) 결이 두 배로 더해지지 않는다 → 되돌릴 때 Plus 로 합친다
    const plus = Skia.Paint()
    plus.setBlendMode(BlendMode.Plus)
    canvas.saveLayer(plus, bounds)
    canvas.drawVertices(mesh, BlendMode.Src, paper)
    canvas.restore()
  } else {
    paper.setBlendMode(BlendMode.Plus)
    canvas.drawRect(bounds, paper)
  }
  canvas.restore()
  canvas.restore()
}
// 층 크기: 점들을 감싼 상자 + 가장 큰 도장(세게 · 눕혀 · 흔들림)
function inkBounds(pointLists, width, copy = false) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const points of pointLists) for (const p of points) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  const m = copy ? width * 3.2 + 2 : width * 1.9 + 2
  return Skia.XYWHRect(x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m)
}
// 도장 = 흑연 알갱이 붓 끝 그림(PENCIL_TIPS)을 접선 방향으로 돌려 drawAtlas 로 한 번에. 색 (1, 0, v) × 진하기를 붓 끝과 곱해(Modulate)
// 덮임을 R 에, 필압 깊이 v 를 B 에 쌓는다. 펜 색은 paperLayer 의 행렬 2 가 입힌다.
// 확대할수록 더 잘고 많은 알갱이 판을 쓴다(알갱이가 화면에서 커지지 않게). zoom: 화면 픽셀 / 페이지 단위
const tipImages = []
const tipIndex = zoom => zoom / 1.75 < 1.35 ? 0 : zoom / 1.75 < 2.1 ? 1 : 2
// 얇은 선(간격 2배)은 알파를 1 - (1 - α)² 로 올린 판(K2)을 쓴다 — 겹침이 절반이라 덮임이 같다
const tipImage = (index, power) => tipImages[index + 3 * (power - 1)] ??= Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64((power > 1 ? PENCIL_TIPS_K2 : PENCIL_TIPS)[index]))
const TIP_SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear }
// 3-4 개발 전용 소요 시간 훅(기본 꺼짐): PENCIL_PROFILE.on = true 로 바꾸면 Metro 콘솔에 '[pencil] drawDabs n=도장 수 ms=…' 와
// '[pencil] drawBrushDabs parts=… ms=…' 를 찍는다(쓰는 중 매 프레임 · 획 굽기 때). 릴리스 빌드(__DEV__ 거짓)에선 아무 일도 안 한다.
export const PENCIL_PROFILE = { on: process.env.EXPO_PUBLIC_PENCIL_PROFILE === '1' }
const profiling = () => PENCIL_PROFILE.on
// 화면 라벨용 통계(console.log 는 logcat 에 안 나옴): globalThis.__PENCIL_PROFILE__ = { label: { n, avg, max, last } }
export const recordProfile = (label, ms) => {
  const all = globalThis.__PENCIL_PROFILE__ ??= {}, one = all[label] ??= { n: 0, sum: 0, max: 0, last: 0 }
  one.n++; one.last = ms; (one.w ??= []).push(ms); if (one.w.length > 60) one.w.shift(); one.avg = one.w.reduce((a, b) => a + b, 0) / one.w.length; one.max = Math.max(...one.w)
}
export const nowMs = () => typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
// 12판 시험(sweep): 쓸어 둔 가로 붓 끝 — 변형 v 장이 위아래로 쌓인 한 장에서 도장 번호 해시로 하나를 고른다(같은 번호는 늘 같은 변형)
let sweepImg, sweepRects, smallImg
const sweepVariant = i => Math.abs(Math.imul(i | 0, 2654435761) >>> 7) % PENCIL_SWEEP.v
// 30판 흑연 퇴적 모델: 돔 판을 Plus 로 쌓는다. R += flow · v · 돔(r). 끝 캡은 따로 찍지 않는다(돔이 쌓인 끝이 둥글고 조금 옅다 — 참고 브러시의 흐린 끝)
const domeImages = new Map()
let fiberImage
function drawDepositDabs(canvas, dabs, width = 6) {
  const tier = PENCIL_DOMES.find(row => width <= row.maxWidth)
  if (!domeImages.has(tier)) domeImages.set(tier, Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(tier.png)))
  if (PENCIL_BRUSH.deposit.fiber) fiberImage ??= Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(PENCIL_DOME_FIBER))
  const stamp = PENCIL_BRUSH.deposit.fiber ? fiberImage : domeImages.get(tier)
  const size = stamp.width(), c = size / 2, src = Skia.XYWHRect(0, 0, size, size), { flow, radius } = PENCIL_BRUSH.deposit
  const srcs = [], dsts = [], colors = [], vf = depositFloor(width), gain = depositGain(width)
  for (const one of dabs) {
    const k = 2 * one.r * radius / (PENCIL_DOME_DIAMETER * size), cos = k * Math.cos(one.angle ?? 0), sin = k * Math.sin(one.angle ?? 0)
    srcs.push(src)
    dsts.push(Skia.RSXform(cos, sin, one.x - (cos * c - sin * c), one.y - (sin * c + cos * c)))
    // 묻는 양 = flow · (vFloor + (1 − vFloor)·v) · a — 약한 필압은 굵기(지름)가 이미 줄므로 양은 바닥을 두어 끝 · 약한 선이 점선으로 끊기지 않게(조사 담당 31판: 램프 끝폭비 .09, 2.5 약함 구멍 22%)
    const fc = tier.k * (PENCIL_BRUSH.deposit.fComp ? Math.min(PENCIL_BRUSH.deposit.fMax, width / (2 * one.r)) : 1)
    colors.push(Float32Array.of(Math.min(1, flow * fc * gain * one.a), 0, Math.min(1, flow * fc * (vf + (1 - vf) * (one.v ?? 0.8)) * one.a), 1))
  }
  const screen = Skia.Paint()
  screen.setBlendMode(BlendMode.Screen)
  canvas.drawAtlas(stamp, srcs, dsts, screen, BlendMode.Modulate, colors, TIP_SAMPLING)
}
function drawDabs(canvas, dabs, zoom = 1, width = 6) {
  if (!dabs.length) return
  if (PENCIL_BRUSH.deposit?.on) return drawDepositDabs(canvas, dabs, width)
  const t0 = profiling() ? nowMs() : 0
  const sweep = PENCIL_BRUSH.sweep.on
  let image, src, rects, cx, cy, d
  if (sweep) {
    sweepImg ??= Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(PENCIL_SWEEP.image))
    sweepRects ??= Array.from({ length: PENCIL_SWEEP.v }, (_, v) => Skia.XYWHRect(0, v * PENCIL_SWEEP.h, PENCIL_SWEEP.w, PENCIL_SWEEP.h))
    image = sweepImg; rects = sweepRects; cx = PENCIL_SWEEP.w / 2; cy = PENCIL_SWEEP.h / 2; d = PENCIL_SWEEP.d
  } else if (PENCIL_BRUSH.smallTip.on && width <= PENCIL_BRUSH.smallTip.width) {
    smallImg ??= Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(PENCIL_SMALL.image))
    image = smallImg; src = Skia.XYWHRect(0, 0, PENCIL_SMALL.size, PENCIL_SMALL.size); cx = cy = PENCIL_SMALL.size / 2; d = PENCIL_SMALL.d
  } else {
    image = tipImage(tipIndex(zoom), brushTipPower(width))
    const size = image.width(); src = Skia.XYWHRect(0, 0, size, size); cx = cy = size / 2; d = PENCIL_TIP_DIAMETER * size
  }
  const ac = PENCIL_BRUSH.accum, accumOn = ac.on, accum = []
  const srcs = [], dsts = [], colors = []
  for (const one of dabs) {
    const k = 2 * one.r / d, cos = k * Math.cos(one.angle ?? 0), sin = k * Math.sin(one.angle ?? 0)
    srcs.push(sweep ? rects[one.i != null ? sweepVariant(one.i) : 0] : src)
    dsts.push(Skia.RSXform(cos, sin, one.x - (cos * cx - sin * cy), one.y - (sin * cx + cos * cy)))
    colors.push(accumOn ? Float32Array.of(1, 0, 0, one.a) : Float32Array.of(1, 0, one.v ?? 0, one.a))
    if (accumOn) accum.push(Float32Array.of(0, 0, Math.min(1, ac.kk * Math.pow(one.v ?? 0, ac.gam)), 1))
  }
  canvas.drawAtlas(image, srcs, dsts, Skia.Paint(), BlendMode.Modulate, colors, TIP_SAMPLING)
  if (accumOn) {   // 되짚기: 같은 srcs · dsts 로 B 채널에 도장이 쌓인 양을 더한다(Plus)
    const plus = Skia.Paint()
    plus.setBlendMode(BlendMode.Plus)
    if (ac.cap) {   // 29판: 쌓임 패스는 알갱이 붓 끝 판 대신 평평한 거친 원판(캡 판, 지름 ac.cap·D) — 판의 가운데 밀도가 쌓일수록 두드러져 가운데 어두운 줄(심)이 되던 것을 없앤다
      capImage ??= Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(PENCIL_CAP))
      const cs = capImage.width(), cc = cs / 2, csrc = Skia.XYWHRect(0, 0, cs, cs), csrcs = [], cdsts = []
      for (const one of dabs) {
        const k = 2 * one.r * ac.cap / (PENCIL_CAP_DIAMETER * cs), cos = k * Math.cos(one.angle ?? 0), sin = k * Math.sin(one.angle ?? 0)
        csrcs.push(csrc)
        cdsts.push(Skia.RSXform(cos, sin, one.x - (cos * cc - sin * cc), one.y - (sin * cc + cos * cc)))
      }
      canvas.drawAtlas(capImage, csrcs, cdsts, plus, BlendMode.Modulate, accum, TIP_SAMPLING)
    } else canvas.drawAtlas(image, srcs, dsts, plus, BlendMode.Modulate, accum, TIP_SAMPLING)
  }
  drawCaps(canvas, dabs)
  if (t0) { const ms = nowMs() - t0; console.log(`[pencil] drawDabs n=${dabs.length} ms=${ms.toFixed(1)}`); recordProfile('drawDabs', ms); recordProfile('dabs/call', dabs.length) }
}
// 둥근 끝: 획 첫 도장 · 끝점 도장 자리에 거친 원판을 덧찍는다(방향 없음). 도장과 같은 (1, 0, v) 색 — 덮임만 더해 끝을 둥글게 채운다
let capImage
function drawCaps(canvas, dabs) {
  const caps = dabs.filter(one => one.cap)
  if (!caps.length) return
  capImage ??= Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(PENCIL_CAP))
  const size = capImage.width(), c = size / 2, src = Skia.XYWHRect(0, 0, size, size), { diameter, alpha } = PENCIL_BRUSH.cap
  const dsts = [], colors = []
  for (const one of caps) {
    const k = 2 * one.r * diameter / (PENCIL_CAP_DIAMETER * size)
    dsts.push(Skia.RSXform(k, 0, one.x - k * c, one.y - k * c))
    colors.push(Float32Array.of(1, 0, one.v ?? 0, alpha))
  }
  canvas.drawAtlas(capImage, caps.map(() => src), dsts, Skia.Paint(), BlendMode.Modulate, colors, TIP_SAMPLING)
}
// 구간마다 도장 그림을 한 번만 녹화한다(끝난 구간). 구간은 자기 진행 거리 몫의 도장만 찍어 이웃 구간과 겹쳐 찍지 않는다.
const dabPictures = new WeakMap()
function drawBrushDabs(canvas, parts, style) {
  const t0 = profiling() ? nowMs() : 0
  try { return drawBrushDabs0(canvas, parts, style) } finally { if (t0) console.log(`[pencil] drawBrushDabs parts=${parts.length} ms=${(nowMs() - t0).toFixed(1)}`) }
}
function drawBrushDabs0(canvas, parts, style) {
  if (parts.length === 1 && parts[0].points.length === 1) return drawDabs(canvas, pencilDabs(brushSampledPoints(parts[0].points), style.width, -Infinity, Infinity, Infinity, brushSeed(style.origin)), style.zoom, style.width)
  const key = `${style.width}|${tipIndex(style.zoom)}`
  for (const part of parts) {
    const cached = part.continuing && dabPictures.get(part)
    if (cached?.key === key) { canvas.drawPicture(cached.picture); continue }
    const [from, to] = partRange(part), dabs = pencilDabs(brushPartSamples(part), style.width, from, to, partTotal(part), brushSeed(style.origin))
    if (!part.continuing) { drawDabs(canvas, dabs, style.zoom, style.width); continue }
    const recorder = Skia.PictureRecorder()
    drawDabs(recorder.beginRecording(), dabs, style.zoom, style.width)
    const picture = recorder.finishRecordingAsPicture()
    dabPictures.set(part, { key, picture })
    canvas.drawPicture(picture)
  }
}

// 25판 'shader' 엔진: 도장을 덮임 이미지(오프스크린 표면, 화면 해상도)에 쌓고 런타임 셰이더가 덮임 · 필압 · 종이 결을 읽어 최종 색을 계산한다(색 행렬 1차식 제약 없음).
let shaderEffect = null
function inkBox(pointLists, width) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const points of pointLists) for (const p of points) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y }
  const m = width * 1.9 + 2
  return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m }
}
const makeSurface = (w, h) => Skia.Surface.MakeOffscreen ? Skia.Surface.MakeOffscreen(w, h) : Skia.Surface.Make(w, h)
const surfaceSize = (box, zoom) => { const c = PENCIL_BRUSH.shader, ppu = Math.min(zoom, c.maxEdge / box.w, c.maxEdge / box.h); return { ppu, pw: Math.max(1, Math.ceil(box.w * ppu)), ph: Math.max(1, Math.ceil(box.h * ppu)) } }
// dabs 를 표면(box · ppu 로 페이지 → 픽셀)에 찍는다. which: 'cov'(알파 합집합) | 'prs'(필압 최댓값, 검은 바탕). clear 가 거짓이면 이미 있는 내용 위에 더 찍는다
function stampDabs(surface, dabs, box, ppu, which, zoom, clear = false, width = 6) {
  if (!dabs.length && !clear) return
  const c = PENCIL_BRUSH.shader, sc = surface.getCanvas(), paint = Skia.Paint()
  if (clear) sc.clear(Skia.Color(which === 'prs' ? 'black' : 'transparent'))
  if (!dabs.length) return
  const image = tipImage(tipIndex(zoom), 1), size = image.width(), cx = size / 2, d = PENCIL_TIP_DIAMETER * size, src = Skia.XYWHRect(0, 0, size, size)
  const srcs = [], dsts = [], colors = []
  for (const one of dabs) {
    const k = 2 * one.r * c.sizeK / d, cos = k * Math.cos(one.angle ?? 0), sin = k * Math.sin(one.angle ?? 0)
    srcs.push(src)
    dsts.push(Skia.RSXform(cos, sin, one.x - (cos * cx - sin * cx), one.y - (sin * cx + cos * cx)))
    colors.push(which === 'prs' ? Float32Array.of(one.v ?? 0.8, 0, 0, 1) : Float32Array.of(1, 1, 1, shaderDabAlpha(one, width)))
  }
  const caps = dabs.filter(one => one.cap)
  sc.save(); sc.scale(ppu, ppu); sc.translate(-box.x, -box.y)
  paint.setBlendMode(which === 'prs' ? BlendMode.Lighten : BlendMode.SrcOver)
  sc.drawAtlas(image, srcs, dsts, paint, BlendMode.Modulate, colors, TIP_SAMPLING)
  if (caps.length) {
    capImage ??= Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(PENCIL_CAP))
    const cs = capImage.width(), cc = cs / 2, csrc = Skia.XYWHRect(0, 0, cs, cs), { diameter } = PENCIL_BRUSH.cap
    sc.drawAtlas(capImage, caps.map(() => csrc), caps.map(one => { const k = 2 * one.r * diameter / (PENCIL_CAP_DIAMETER * cs); return Skia.RSXform(k, 0, one.x - k * cc, one.y - k * cc) }), paint, BlendMode.Modulate,
      caps.map(one => which === 'prs' ? Float32Array.of(one.v ?? 0.8, 0, 0, 1) : Float32Array.of(1, 1, 1, shaderCap(width).alpha)), TIP_SAMPLING)
  }
  sc.restore()
}
// 덮임 · 필압 이미지(surfaceBox 기준)를 읽는 최종 셰이더로 ink 상자만 그린다
// 덮임 · 필압 이미지(surfaceBox 기준) + (쓰는 중) 보조 이미지(delta: { x, y, pw, ph, cov, prs })를 읽는 최종 셰이더로 ink 상자만 그린다
function paintShader(canvas, covImage, prsImage, surfaceBox, ppu, color, origin, ink, zoom, delta = null, width = 10) {
  shaderEffect ??= Skia.RuntimeEffect.Make(PENCIL_SHADER_SKSL)
  const paint = Skia.Paint(), shader = (image) => image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None)
  paint.setShader(shaderEffect.makeShaderWithChildren(shaderUniforms(surfaceBox, ppu, zoom, origin, Skia.Color(color), delta, width),
    [shader(covImage), shader(prsImage), shader(delta?.cov ?? covImage), shader(delta?.prs ?? prsImage), grain()]))
  canvas.drawRect(Skia.XYWHRect(ink.x, ink.y, ink.w, ink.h), paint)
}
// 표면 · 메모리 상한(출시 안전): 한 표면 최대 화소 수. 넘는 획은 이 경로를 쓰지 않고 own 으로 그린다. 표면 생성이 실패 · 예외면 이후 전부 own 으로(크래시 대신 품질 저하)
const SHADER_MAX_PIXELS = 4 * 1024 * 1024
let shaderBroken = false
const shaderOk = (box, zoom) => !shaderBroken && box.w > 0 && box.h > 0 && (() => { const { pw, ph } = surfaceSize(box, zoom); return pw * ph <= SHADER_MAX_PIXELS })()
const shaderFail = error => { shaderBroken = true; releaseLive(); console.warn('[pencil] shader 경로 실패 — own 으로 전환:', error?.message ?? error) }
// 한 획(또는 앞 두 구간까지의 쓰는 중)을 위한 덮임 · 필압 표면 한 쌍을 풀로 재사용한다(256 화소 단위로 올림, 4배 넘게 크면 다시 만듦)
const shaderPools = {}
const acquirePool = (pw, ph, slot = 'main') => {
  const shaderPool = shaderPools[slot]
  const w = Math.ceil(pw / 256) * 256, h = Math.ceil(ph / 256) * 256
  if (shaderPool && shaderPool.w >= w && shaderPool.h >= h && shaderPool.w * shaderPool.h <= 4 * w * h) return shaderPool
  shaderPool?.cov?.dispose?.(); shaderPool?.prs?.dispose?.(); delete shaderPools[slot]
  const cov = makeSurface(w, h), prs = makeSurface(w, h)
  if (!cov || !prs) { cov?.dispose?.(); prs?.dispose?.(); throw new Error(`MakeOffscreen ${w}x${h} 실패`) }
  return (shaderPools[slot] = { w, h, cov, prs })
}
// 풀 표면에 덮임 · 필압을 찍고 셰이더로 이 획 상자 크기의 최종 이미지 한 장(투명 바탕)으로 만든다 → 그림 요소에는 이 작은 이미지만 남는다(풀은 바로 다시 쓴다)
function drawShaderStroke(canvas, dabs, width, color, origin, box, zoom) {
  if (!dabs.length) return true
  if (!shaderOk(box, zoom)) return false
  try {
    const { ppu, pw, ph } = surfaceSize(box, zoom), pool = acquirePool(pw, ph), out = makeSurface(pw, ph)
    if (!out) throw new Error(`MakeOffscreen ${pw}x${ph} 실패`)
    stampDabs(pool.cov, dabs, box, ppu, 'cov', zoom, true, width); stampDabs(pool.prs, dabs, box, ppu, 'prs', zoom, true, width)
    pool.cov.flush(); pool.prs.flush()
    const covImage = pool.cov.makeImageSnapshot(), prsImage = pool.prs.makeImageSnapshot(), oc = out.getCanvas()
    oc.scale(pw / box.w, ph / box.h); oc.translate(-box.x, -box.y)
    paintShader(oc, covImage, prsImage, box, ppu, color, origin, box, zoom, null, width)
    out.flush()
    const image = out.makeImageSnapshot()
    covImage.dispose?.(); prsImage.dispose?.(); out.dispose?.()
    canvas.save(); canvas.translate(box.x, box.y); canvas.scale(box.w / pw, box.h / ph); canvas.drawImage(image, 0, 0); canvas.restore()
    return true
  } catch (error) { shaderFail(error); return false }
}
// 쓰는 중: 끝난 구간은 누적 표면에 한 번만 찍고, 진행 중 구간(마지막)만 복사본 표면에 더 찍어 그린다(PENCIL_PROFILE 로 시간 측정)
let liveShader = null
// 한 프레임에 만든 이미지(보조 표면 스냅샷)는 다음 프레임 시작에 JS 쪽 참조를 풀어 준다(GPU 메모리는 JS GC 를 기다리면 쌓인다)
let frameImages = []
const releaseFrame = () => { for (const image of frameImages) image?.dispose?.(); frameImages = [] }
const releaseLive = () => { for (const k of ['cov', 'prs']) liveShader?.[k]?.dispose?.(); liveShader = null }
const partDabs = (part, width, seed) => { const [from, to] = partRange(part); return pencilDabs(brushPartSamples(part), width, from, to, partTotal(part), seed) }
function shaderParts(canvas, parts, style) {
  if (!PENCIL_BRUSH.shader.live) return false   // 쓰는 중 shader 는 GPU 메모리가 쌓여(아래 설명) 기본 꺼 둠 — 쓰는 중은 own, 뗀 뒤만 shader 가 되면 픽셀이 달라져 own 기본일 때만 의미가 있다
  releaseFrame()
  const t0 = profiling() ? nowMs() : 0
  try { return shaderParts0(canvas, parts, style) } catch (error) { shaderFail(error); return false } finally { if (t0) { const ms = nowMs() - t0; recordProfile('shaderParts', ms); recordProfile(`parts${Math.min(parts.length, 6)}`, ms) } }
}
function shaderParts0(canvas, parts, style) {
  const tt = profiling() ? nowMs() : 0, t0 = tt
  const width = style.width, seed = brushSeed(style.origin), ink = inkBox(parts.map(part => part.points), width)
  if (parts.length === 1 && parts[0].points.length === 1) return drawShaderStroke(canvas, pencilDabs(brushSampledPoints(parts[0].points), width, -Infinity, Infinity, Infinity, seed), width, style.color, style.origin, ink, style.zoom)
  if (!shaderOk(ink, style.zoom)) return false
  const finished = parts.filter(part => part.continuing), last = parts.find(part => !part.continuing)
  if (finished.length < 2) return drawShaderStroke(canvas, parts.flatMap(part => partDabs(part, width, seed)), width, style.color, style.origin, ink, style.zoom)
  const key = `${width}|${style.zoom}`, inside = liveShader && liveShader.key === key && liveShader.first === finished[0]
    && ink.x >= liveShader.box.x && ink.y >= liveShader.box.y && ink.x + ink.w <= liveShader.box.x + liveShader.box.w && ink.y + ink.h <= liveShader.box.y + liveShader.box.h
  if (!inside) {
    releaseLive()
    const pad = Math.max(48, width * 6), box = { x: ink.x - pad, y: ink.y - pad, w: ink.w + 2 * pad, h: ink.h + 2 * pad }, { ppu, pw, ph } = surfaceSize(box, style.zoom)
    if (pw * ph > SHADER_MAX_PIXELS) return drawShaderStroke(canvas, parts.flatMap(part => partDabs(part, width, seed)), width, style.color, style.origin, ink, style.zoom)
    const cov = makeSurface(pw, ph), prs = makeSurface(pw, ph)
    if (!cov || !prs) { cov?.dispose?.(); prs?.dispose?.(); throw new Error(`MakeOffscreen ${pw}x${ph} 실패`) }
    liveShader = { key, first: finished[0], box, ppu, cov, prs, drawn: new Set(), covImage: null, prsImage: null }
    stampDabs(cov, [], box, ppu, 'cov', style.zoom, true); stampDabs(prs, [], box, ppu, 'prs', style.zoom, true)
  }
  // 누적 표면 스냅샷을 다시 뜨면(표면이 바뀌면) GPU 가 표면 크기만큼 복사본을 만든다 → 새 구간이 쌓여 보조 표면이 충분히 커졌을 때만 누적 표면에 합친다.
  // 그 전까지 끝난 새 구간은 진행 중 구간과 함께 보조 표면에 찍는다(보조 표면은 작다).
  const L = liveShader, fresh = finished.filter(part => !L.drawn.has(part)), freshDabs = fresh.flatMap(part => partDabs(part, width, seed))
  let delta = null
  const extent = list => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const one of list) { x0 = Math.min(x0, one.x); y0 = Math.min(y0, one.y); x1 = Math.max(x1, one.x); y1 = Math.max(y1, one.y) } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
  if (!L.covImage || (freshDabs.length && extent(freshDabs).w * extent(freshDabs).h * L.ppu * L.ppu > 600000)) {
    stampDabs(L.cov, freshDabs, L.box, L.ppu, 'cov', style.zoom, false, width); stampDabs(L.prs, freshDabs, L.box, L.ppu, 'prs', style.zoom, false, width)
    L.cov.flush(); L.prs.flush(); L.covImage?.dispose?.(); L.prsImage?.dispose?.()
    L.covImage = L.cov.makeImageSnapshot(); L.prsImage = L.prs.makeImageSnapshot()
    fresh.forEach(part => L.drawn.add(part))
    L.pendingDabs = []
  } else L.pendingDabs = freshDabs
  const tA = t0 ? nowMs() : 0
  const tail = last ? partDabs(last, width, seed) : []
  const dabs = [...(L.pendingDabs ?? []), ...tail], m = width * 1.9 + 2
  if (dabs.length) {
    const e = extent(dabs), dbox = { x: e.x - m, y: e.y - m, w: e.w + 2 * m, h: e.h + 2 * m }, dpw = Math.max(1, Math.ceil(dbox.w * L.ppu)), dph = Math.max(1, Math.ceil(dbox.h * L.ppu))
    if (dpw * dph <= SHADER_MAX_PIXELS) {
      const dp = acquirePool(dpw, dph, 'delta')
      stampDabs(dp.cov, dabs, dbox, L.ppu, 'cov', style.zoom, true, width); stampDabs(dp.prs, dabs, dbox, L.ppu, 'prs', style.zoom, true, width)
      dp.cov.flush(); dp.prs.flush()
      // 풀 표면의 GPU 스냅샷은 다음 프레임에 표면을 다시 쓸 때마다 표면 크기만큼 복사본을 만들어 GPU 메모리가 쌓였다 → 작은 보조 표면은 CPU 이미지로 떼어 낸다
      const snap = surface => { const gpu = surface.makeImageSnapshot(), cpu = gpu.makeNonTextureImage?.() ?? gpu; if (cpu !== gpu) gpu.dispose?.(); return cpu }
      delta = { x: dbox.x, y: dbox.y, pw: dp.w, ph: dp.h, cov: snap(dp.cov), prs: snap(dp.prs) }
      frameImages.push(delta.cov, delta.prs)
    }
  }
  const tB = t0 ? nowMs() : 0
  paintShader(canvas, L.covImage, L.prsImage, L.box, L.ppu, style.color, style.origin, ink, style.zoom, delta, width)
  if (t0) { const tC = nowMs(); recordProfile('accum', tA - tt); recordProfile('delta', tB - tA); recordProfile('paint', tC - tB) }
  return true
}
// 리본 입력(쓰는 중): 각 구간이 맡는 진행 거리 범위의 곡선 표본을 이어 붙인다
const ribbonFor = (parts, width) => {
  const e = ribbonStretch(width)
  if (e <= 1 && !PENCIL_BRUSH.strand?.on) return null
  // 탭(점 하나)은 그물 없이 그 자리 사각형으로
  if (PENCIL_BRUSH.strand?.on) return parts.length === 1 && parts[0].points.length === 1 ? { e, samples: null } : { e, parts }
  const samples = parts.flatMap(part => { const [from, to] = partRange(part); return brushPartSamples(part).filter(p => p.inkDistance >= from && (p.inkDistance < to || to === Infinity)) })
  return { e, samples }
}
const drawBrushParts = (canvas, parts, style) => PENCIL_BRUSH.engine === 'shader' && shaderParts(canvas, parts, style) ? undefined : PENCIL_BRUSH.engine === 'copy'
  ? copyLayer(canvas, style.origin, style.color, inkBounds(parts.map(part => part.points), style.width, true), () => drawCopyParts(canvas, parts, style), style.zoom)
  : paperLayer(canvas, style.origin, style.width, style.color, inkBounds(parts.map(part => part.points), style.width), () => drawBrushDabs(canvas, parts, style), style.zoom, ribbonFor(parts, style.width), style.opacity)


// 22판 'copy' 엔진(PENCIL_BRUSH.engine): 모양 도장은 펜 색 × 필압 알파로 SrcOver 누적 → 종이 고정 결을 Modulate 로 곱함 → 층 알파 × 최대 불투명도로 합성
let copyShape, copyGrain
const copyShapeImage = () => copyShape ??= Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(PENCIL_COPY.shape))
const copyGrainImage = () => copyGrain ??= Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(PENCIL_COPY.grain))
// 층 두 겹(paperLayer 와 같은 구조, SPEC §4.1): 안쪽 = 도장이 R 에 덮임 a 를 쌓고 결이 G 에 더해짐 → 행렬 1: R = G(결 마스크), A = R(덮임) → 바깥: 행렬 2: A = R × 최대 불투명도, 색 = 펜 색.
// 결: 화면 고정 크기(한 칸 = grainScale 화면 px = grainScale / zoom 페이지 단위), 좌표는 획 첫 점 기준(지금 종이 결과 같게)
function copyLayer(canvas, origin, color, bounds, draw, zoom = 1) {
  const c = PENCIL_BRUSH.copy, [r, g, b] = Skia.Color(color), black = fillPaint('#000000'), outer = Skia.Paint(), inner = Skia.Paint(), gp = Skia.Paint()
  outer.setColorFilter(Skia.ColorFilter.MakeMatrix([0, 0, 0, 0, r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, c.maxOpacity, 0, 0, 0, 0]))
  inner.setColorFilter(Skia.ColorFilter.MakeMatrix([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]))
  const k = c.grainScale / Math.max(zoom, 1e-6)
  gp.setShader(copyGrainImage().makeShaderOptions(TileMode.Repeat, TileMode.Repeat, FilterMode.Linear, MipmapMode.None, Skia.Matrix([k, 0, origin?.x ?? 0, 0, k, origin?.y ?? 0, 0, 0, 1])))
  gp.setColorFilter(Skia.ColorFilter.MakeMatrix([0, 0, 0, 0, 0, 0, 0, 0, c.grainDepth * c.grainContrast, c.grainDepth * (0.5 - 0.5 * c.grainContrast) + 1 - c.grainDepth, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]))   // 결 알파 → G = depth·(대비를 건 결) + (1 − depth), 결 대비 = 0.5 중심 배율
  gp.setBlendMode(BlendMode.Plus)
  canvas.saveLayer(outer, bounds)
  canvas.drawRect(bounds, black)
  canvas.saveLayer(inner, bounds)
  canvas.drawRect(bounds, black)
  draw()
  canvas.drawRect(bounds, gp)
  canvas.restore()
  canvas.restore()
}
// 도장: 모양을 'max'(Lighten, 최댓값) 또는 'union'(SrcOver)로 R 에 쌓는다. 색 (α, 0, 0, 1) × 모양
function drawCopyDabs(canvas, dabs) {
  if (!dabs.length) return
  const image = copyShapeImage(), size = PENCIL_COPY.shapeSize, c = size / 2, src = Skia.XYWHRect(0, 0, size, size), paint = Skia.Paint()
  const max = PENCIL_BRUSH.copy.blend === 'max'
  if (max) paint.setBlendMode(BlendMode.Lighten)
  const srcs = [], dsts = [], colors = []
  for (const one of dabs) {
    const k = one.side / size, cos = k * Math.cos(one.angle), sin = k * Math.sin(one.angle)
    srcs.push(src)
    dsts.push(Skia.RSXform(cos, sin, one.x - (cos * c - sin * c), one.y - (sin * c + cos * c)))
    colors.push(max ? Float32Array.of(one.a, 0, 0, 1) : Float32Array.of(1, 0, 0, one.a))   // max: R = α·모양 의 최댓값 / union: 모양 알파 × α 를 SrcOver 로 합집합
  }
  canvas.drawAtlas(image, srcs, dsts, paint, BlendMode.Modulate, colors, TIP_SAMPLING)
}
const copyPictures = new WeakMap()
function drawCopyParts(canvas, parts, style) {
  if (parts.length === 1 && parts[0].points.length === 1) return drawCopyDabs(canvas, copyDabs(brushSampledPoints(parts[0].points), style.width))
  const key = `${style.width}|${PENCIL_BRUSH.copy.blend}`
  for (const part of parts) {
    const cached = part.continuing && copyPictures.get(part)
    if (cached?.key === key) { canvas.drawPicture(cached.picture); continue }
    const [from, to] = partRange(part), dabs = copyDabs(brushPartSamples(part), style.width, from, to)
    if (!part.continuing) { drawCopyDabs(canvas, dabs); continue }
    const recorder = Skia.PictureRecorder()
    drawCopyDabs(recorder.beginRecording(), dabs)
    const picture = recorder.finishRecordingAsPicture()
    copyPictures.set(part, { key, picture })
    canvas.drawPicture(picture)
  }
}

// 볼펜 · 형광펜: 구간마다 저장 획과 같은 2차 곡선(partPath)을 굵기만큼 그은 선
function linePath(parts) {
  return join(parts.map(part => part.continuing ? cachedParse(part, 'line', () => parse(partPath(part))) : parse(partPath(part))))
}

// 그리는 중 · 손을 뗀 뒤 공통. style: { kind, width, color, dotWidth, lineCap, origin }
function drawParts(canvas, parts, style) {
  const kind = skiaKind(style.kind)
  if (!parts.length || !parts[0].points.length) return
  if (isDashedKind(kind)) {
    const key = ['dashed', kind, style.width, style.dashLength, style.dashGap].join(':')
    const parsePart = part => parse(dashedPreviewContour(part, style.width, kind, style))
    const path = join(parts.map(part => part.continuing
      ? cachedParse(part, key, () => parsePart(part))
      : parsePart(part)))
    if (path) canvas.drawPath(path, fillPaint(style.color))
    return
  }
  if (kind === 'pencil') return drawBrushParts(canvas, parts, style)
  // 유리펜: 손을 뗀 뒤는 마스크 · 고임 장 · 셰이더 전체 경로, 쓰는 중은 표면 없는 가벼운 셰이더.
  // 쓰는 중에 오프스크린 표면을 쓰면 이 기기에서 librnskia 가 죽는다(2026-11-09 실기 SIGTRAP · SIGSEGV).
  // 유리펜: 쓰는 중과 손을 뗀 뒤가 **같은 함수**다(그림이 같다). 오프스크린 표면을 쓰지 않는다 —
  // 이 기기에서 MakeOffscreen 이 librnskia 를 죽인다(2026-11-09 실기 SIGTRAP · SIGSEGV).
  if (kind === 'glass' && drawGlassStroke(canvas, parts.flatMap(part => part.points), style.width, style.color, style.zoom ?? 1, style.ink)) return
  if (isNibKind(kind)) {
    const paths = nibPreviewPaths(parts, style.width, kind)
    const path = join(paths.map((d, i) => i < parts.length - 2 ? cachedParse(parts[i], 'nib', () => parse(d)) : parse(d)))
    if (path) canvas.drawPath(path, fillPaint(style.color))
    return
  }
  // 볼펜: 필압 · 기울기로 굵기가 변하는 획은 외곽선을 채운다(힘 정보가 없는 획은 예전처럼 일정한 선)
  if (kind === 'ball' && parts.some(part => ballVaries(part.points))) {
    const paths = ballPreviewPaths(parts, style.width)
    const path = join(paths.map((d, i) => i < parts.length - 1 ? cachedParse(parts[i], 'ball', () => parse(d)) : parse(d)))
    if (path) canvas.drawPath(path, fillPaint(style.color))
    return
  }
  const path = linePath(parts)
  const width = parts.length === 1 && parts[0].points.length === 1 ? style.dotWidth : style.width
  if (path) canvas.drawPath(path, strokePaint(style.color, width, kind === 'highlighter' && style.lineCap === 'square'))
}

// 한 겹 투명도(획 전체에 한 번): 구간이 겹쳐도 더 진해지지 않는다
function withAlpha(canvas, alpha, draw) {
  if (alpha >= 1) return draw()
  const paint = Skia.Paint()
  paint.setAlphaf(alpha)
  canvas.saveLayer(paint)
  draw()
  canvas.restore()
}

// 그리는 중(페이지 좌표)
export function drawPreview(canvas, { parts, settings }, zoom = 1) {
  const kind = skiaKind(settings.kind)
  const first = parts[0]?.points[0]
  const style = { kind, width: settings.width, color: settings.color, lineCap: settings.lineCap,
    dashLength: settings.dashLength, dashGap: settings.dashGap,
    dotWidth: settings.width * (first?.pressure ?? 1), origin: kind === 'pencil' && PENCIL_BRUSH.strand?.on ? { x: 0, y: 0, seed: brushSeed(first) } : { x: first?.x ?? 0, y: first?.y ?? 0 }, zoom, opacity: settings.opacity ?? 1,
    live: true, ink: glassInkOf(settings) }
  withAlpha(canvas, kind === 'highlighter' ? HIGHLIGHTER_OPACITY : kind === 'pencil' && pencilAccumulates() ? 1 : settings.opacity ?? 1, () => drawParts(canvas, parts, style))
}

// 손을 뗀 획(요소 좌표): 쓰는 중과 같은 구간으로 나눠 같은 함수로 그린다. 지우개 조각(sampled)은 이미 곡선 표본이라 통째로.
function drawObjectContent(canvas, object, zoom = 1) {
  if (isDashedKind(object.penKind)) {
    const path = parse(dashedObjectContour(object))
    if (path) canvas.drawPath(path, fillPaint(object.color))
    return
  }
  const kind = skiaKind(object.penKind), { points, strokeWidth: width, color } = object
  const style = { kind, width, color, lineCap: object.lineCap,
    dotWidth: width * (points[0]?.pressure ?? 1), origin: object.grainOrigin ?? points[0], zoom, opacity: object.opacity ?? 1, ink: glassInkOf(object) }
  // 캘리펜 · 붓펜은 저장 점에 진행 거리가 없어 구간으로 그리면 붓펜 전체 길이가 0 이 된다(뗀 뒤 몸통이 끝 굵기로 얇아졌다) → 아래 외곽선(nibContour)이 거리를 다시 재서 쓰는 중과 같은 모양이 된다
  if (!object.sampled && !object.taperBaked && !isNibKind(kind)) return drawParts(canvas, createStrokePreview(previewSegmentFor(kind)).snapshot(points), style)
  if (kind === 'glass' && drawGlassStroke(canvas, points, width, color, zoom, glassInkOf(object))) return
  if (kind === 'pencil' && PENCIL_BRUSH.engine === 'shader') {
    releaseLive()
    if (drawShaderStroke(canvas, pencilDabs(brushSampledPoints(points, object.inkStartDistance ?? 0), width, -Infinity, Infinity, Infinity, brushSeed(style.origin)), width, color, style.origin, inkBox([points], width), zoom)) return
  }
  if (kind === 'pencil' && PENCIL_BRUSH.engine === 'copy') return copyLayer(canvas, style.origin, color, inkBounds([points], width, true),
    () => drawCopyDabs(canvas, copyDabs(brushSampledPoints(points, object.inkStartDistance ?? 0), width)), zoom)
  if (kind === 'pencil') return paperLayer(canvas, style.origin, style.width, color, inkBounds([points], width),
    () => drawDabs(canvas, pencilDabs(brushSampledPoints(points, object.inkStartDistance ?? 0), width, -Infinity, Infinity, Infinity, brushSeed(style.origin)), zoom, width), zoom,
    ribbonStretch(width) > 1 || PENCIL_BRUSH.strand?.on ? { e: ribbonStretch(width), samples: brushSampledPoints(points, object.inkStartDistance ?? 0) } : null, style.opacity)
  if (isNibKind(kind)) {
    const path = parse(nibContour({ ...object, penKind: kind }))
    if (path) canvas.drawPath(path, fillPaint(color))
    return
  }
  if (kind === 'ball' && ballVaries(points)) {
    const swept = parse(ballSweepPath(points, width))
    if (swept) canvas.drawPath(swept, fillPaint(color))
    return
  }
  const path = parse(points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('') + (points.length === 1 ? 'l0.01 0' : ''))
  if (path) canvas.drawPath(path, strokePaint(color, points.length === 1 ? style.dotWidth : width, kind === 'highlighter' && object.lineCap === 'square'))
}

// 획 내용(요소 좌표)은 점 배열마다 한 번만 녹화한다: 옮기기 · 돌리기 · 투명도만 바뀐 획은 같은 점 배열이라 모양을 다시 계산하지 않는다
const contents = new WeakMap()
const contentKey = object => [object.penKind, object.strokeWidth, object.color, object.lineCap, object.materialSeed, object.sampled, object.taperBaked,
  object.grainOrigin?.x, object.grainOrigin?.y, object.inkStartDistance, object.dashLength, object.dashGap].join('|')
// 연필은 확대 배율마다 결 크기 · 붓 끝 판이 달라 배율도 열쇠에 넣는다
function contentPicture(object, zoom = 1) {
  const key = contentKey(object) + (skiaKind(object.penKind) === 'pencil' ? `|${zoom}|${PENCIL_BRUSH.engine}|${object.opacity ?? 1}` : '')
    + (skiaKind(object.penKind) === 'glass' ? glassKey(object) : ''), cached = contents.get(object.points)
  if (cached?.key === key) return cached.picture
  const recorder = Skia.PictureRecorder()
  drawObjectContent(recorder.beginRecording(), object, zoom)
  const picture = recorder.finishRecordingAsPicture()
  contents.set(object.points, { key, picture })
  return picture
}

// 획 하나를 페이지 좌표로 놓는다(위치 · 회전 · 반전 · 크기 바꾼 획 포함, PageObject 와 같은 변환). fade: 끌어 옮기는 중 반투명
function drawStroke(canvas, object, fade = 1, zoom = 1) {
  const { x, y, w, h } = object
  canvas.save()
  canvas.translate(x, y)
  if (object.rotation) canvas.rotate(object.rotation, w / 2, h / 2)
  if (object.flipX || object.flipY) {
    canvas.translate(w / 2, h / 2)
    canvas.scale(object.flipX ? -1 : 1, object.flipY ? -1 : 1)
    canvas.translate(-w / 2, -h / 2)
  }
  const sx = object.baseWidth ? w / object.baseWidth : 1, sy = object.baseHeight ? h / object.baseHeight : 1
  if (sx !== 1 || sy !== 1) canvas.scale(sx, sy)
  const kind = skiaKind(object.penKind)
  // 연필은 불투명도를 색 행렬이 맡는다(한 획 안에서 겹치면 쌓인다)
  withAlpha(canvas, (kind === 'pencil' && pencilAccumulates() ? 1 : object.opacity ?? 1) * fade * (kind === 'highlighter' ? HIGHLIGHTER_OPACITY : 1), () => canvas.drawPicture(contentPicture(object, zoom)))
  canvas.restore()
}

// 이어진 획 묶음 하나의 그림. fadeOf(object) → 투명도 배율
// zoom: 화면 픽셀 / 페이지 단위(확대 × 기기 픽셀 배율)
export function strokesPicture(objects, fadeOf = () => 1, zoom = 1) {
  const recorder = Skia.PictureRecorder()
  const canvas = recorder.beginRecording()
  for (const object of objects) drawStroke(canvas, object, fadeOf(object), zoom)
  return recorder.finishRecordingAsPicture()
}
export function previewPicture(preview, zoom = 1) {
  const t0 = profiling() ? nowMs() : 0
  const recorder = Skia.PictureRecorder()
  drawPreview(recorder.beginRecording(), preview, zoom)
  const picture = recorder.finishRecordingAsPicture()
  if (t0) recordProfile('LIVE', nowMs() - t0)
  return picture
}
