// 유리펜 — **픽셀 단위 고임 장**을 되살린 경로(27판).
//
// 26판에서 포기했던 것: 마스크를 블러한 고임 장을 셰이더가 픽셀마다 읽는 구조.
//   그래야 웅덩이 **안쪽**의 등고선 테, 커피링 그라데이션, 농담 흐름이 나온다.
//   26판은 고임을 "테 띠의 폭" 하나로만 들고 있어서 그게 전부 빠져 있었다.
// 왜 포기했었나: 그 구조를 `Surface.MakeOffscreen` 으로 만들면 이 기기가 죽는다.
// 왜 되살리나: 탐침(2026-11-10, SM-X510) 결과 **Skia 가 스스로 관리하는 층**은 멀쩡했다 —
//   saveLayer · 안쪽 Plus · 블러 이미지 필터 · RuntimeShader 이미지 필터(자식 둘)까지 전부 통과.
//
// 그래서 표면을 하나도 만들지 않고 같은 그림을 그린다:
//   canvas.saveLayer( 이미지 필터 = RuntimeShaderWithChildren(잉크 셰이더,
//                        mask = 층 원본, pool = 같은 층을 가우시안 블러한 것) )
//     층 안: 두께 도장(Lighten) × 덮임(DstIn)   ← 하네스의 마스크 층과 같은 순서
//   canvas.restore()                            ← 여기서 셰이더가 돌며 최종 잉크가 나온다
//
// 좌표계: 이미지 필터의 런타임 셰이더는 **캔버스 지역 좌표**(= 페이지 좌표)로 돈다.
//   자식도 같은 좌표로 읽으므로 org = 0, ppu = 1 로 둔다(셰이더의 q = p 가 된다).
//   덕분에 무늬가 페이지에 붙어 있어 확대해도 그대로다.
import { PixelRatio } from 'react-native'
import { BlendMode, PaintStyle, Skia, StrokeCap, StrokeJoin, TileMode } from '@shopify/react-native-skia'
import { GLASS_INK, GLASS_INK_SKSL, abLineOf, glassDabs, inkDensity, micaAutoFilm, micaColor, sheenAutoColor } from '../utils/glassInk.js'

let builder = null, sparkEffect = null, failed = false
// 글리터 입자만 따로 — **전체 해상도**로 획 위에 덧그린다.
// 고임 필터 층은 이 기기에서 절반 해상도로 계산된다(가장자리가 네모로 끊기고 입자가 사각형이 된다).
// 그래서 눈에 띄는 고주파 — 가장자리와 입자 — 는 필터 밖에서 그리고, 필터 안에는 저주파만 남긴다.
// 색은 하네스와 같은 식이다: col = mix(잉크, 회색화한 잉크 + 밝힘 × 운모색, w) — 알파 w 로 덧칠하면 같다.
const GLASS_SPARK_SKSL = `
uniform float3 base;   // 잉크색(휘도 계산용)
uniform float3 mica;   // 운모 간섭색
uniform float cell;
uniform float dens;
uniform float rmin;
uniform float rmax;
uniform float bmin;
uniform float bmax;
uniform float tail;
uniform float desat;
uniform float cloud;
uniform float cloudScl;
uniform float aa;
float vhash(float2 q) {
  float3 p3 = fract(float3(mod(q.x, 256.0), mod(q.y, 256.0), mod(q.x, 256.0)) * float3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(float2 q) {
  float2 i = floor(q), f = fract(q);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vhash(i), vhash(i + float2(1, 0)), u.x),
             mix(vhash(i + float2(0, 1)), vhash(i + float2(1, 1)), u.x), u.y);
}
half4 main(float2 p) {
  float lum = dot(base, float3(0.299, 0.587, 0.114));
  float cl = 1.0 + cloud * (vnoise(p / cloudScl) - 0.5) * 2.0;
  float3 acc = float3(0.0);
  float aw = 0.0;
  // 25판: 한 겹이면 격자가 보인다 → 간격비가 무리수인 두 겹을 겹쳐 격자를 깬다
  for (int layer = 0; layer < 2; layer++) {
    float lay = float(layer);
    float cs = cell * mix(1.0, 1.37, lay);
    float2 cc = floor(p / cs);
    float2 c = cc + lay * 7.31;
    if (vhash(c * 1.013 + 0.37) >= 0.5 * dens * cl) continue;
    float u1 = vhash(c * 2.117 + 1.11), u2 = vhash(c * 3.721 + 2.53);
    float u3 = vhash(c * 5.313 + 4.19), u4 = vhash(c * 7.919 + 5.87);
    float2 pos = (cc + 0.18 + 0.64 * float2(u1, u2)) * cs;
    float r = mix(rmin, rmax, u3);
    float w = 1.0 - smoothstep(r - aa, r + aa, length(p - pos));
    if (w <= 0.0) continue;
    float boost = mix(bmin, bmax, pow(u4, tail));
    acc += clamp(mix(base, float3(lum) * mica, desat) + boost * mica, 0.0, 1.0) * w;
    aw += w;
  }
  if (aw <= 0.0) return half4(0.0);
  float a = min(1.0, aw);
  return half4(half3(acc / aw * a), half(a));
}
`

const hex3 = color => { const c = Skia.Color(color); return [c[0], c[1], c[2]] }

// 두께 마스크는 도장이 겹쳐야 매끈하다. 경로용(0.38)보다 촘촘하되, 긴 획에서는 수를 제한한다.
const MASK_SPACING = 0.18
const MASK_MAX_DABS = 3000
// 페이지 1단위가 화면 몇 px 인가. 눈대중으로 두면 입자 가장자리(aa)와 도장 여유(fringe)가
// 실제 픽셀보다 커져 그대로 뭉개진다 — 기기 배율 × 확대율로 정확히 구한다.
const pxPerUnit = zoom => Math.max(0.2, PixelRatio.get() * Math.max(0.05, zoom))

function setUniforms(color, width, ink, S) {
  const P = GLASS_INK
  const rgb = hex3(color)
  const sheenOn = ink.sheen !== false
  const sheenAmount = sheenOn ? (ink.sheenAmount ?? 1) : 0
  const glitterAmount = ink.glitter === false ? 0 : (ink.amount ?? 1)
  const film = ink.film ?? micaAutoFilm(rgb)
  const tilt = P.glFilmTilt * Math.PI / 180
  const glit = ink.glitterColor ? hex3(ink.glitterColor) : null
  const u = (name, ...v) => builder.setUniform(name, v)

  // 좌표계는 **화면 픽셀**이다(아래 drawGlassPooled 에서 캔버스를 1/S 로 줄이고 기하를 S 배로 그린다).
  // 그래서 길이 uniform 은 전부 S 를 곱한다 — 하네스가 S 를 곱해 넘기던 것과 같은 규칙이다.
  u('org', 0, 0); u('ppu', 1)
  u('aa', 0.5)   // 화면 0.5px
  u('ink', ...rgb); u('dens', ...inkDensity(rgb))
  u('satK', P.satK); u('tMax', P.T_MAX)
  u('rad', P.rimR * width * S)
  u('ringStart', P.ringStart); u('ringFull', P.ringFull)
  u('fIn', P.fIn); u('fRim', P.fRim); u('tGamma', P.tGamma); u('alphaK', P.alphaK)
  u('satStart', P.satStart); u('satMax', P.satMax)
  u('flowAmp', P.flowAmp); u('flowScl', P.flowScale * S)
  u('sheenCol', ...(ink.sheenColor ? hex3(ink.sheenColor) : sheenAutoColor(rgb)))
  u('sheenAmp', P.sheenAmp * sheenAmount)
  u('sheenRimA', P.sheenRimA); u('sheenRimBand', P.sheenRimBand)
  u('sheenGate0', P.sheenGate0); u('sheenGate1', P.sheenGate1)
  u('sheenInT', P.sheenInT); u('sheenInAmp', P.sheenInAmp)
  u('sheenEdge', P.sheenEdge * sheenAmount)
  u('sheenPatch', P.sheenPatch); u('sheenGrain', P.sheenGrain)
  u('abLine', abLineOf(width)); u('poolMix', P.poolMix)
  u('sheenWiggle', P.sheenWiggle); u('sheenWScl', P.sheenWScale * S)
  u('micaA', ...(glit ?? micaColor(film, 1)))
  u('micaB', ...(glit ?? micaColor(film, Math.cos(tilt * 0.5))))
  u('micaC', ...(glit ?? micaColor(film, Math.cos(tilt))))
  u('glVeil', P.glVeil); u('glVeilDesat', P.glVeilDesat)
  u('glVeilLift', P.glVeilLift); u('glVeilScl', P.glVeilScale * S)
  u('glAmp', 0)   // 입자는 필터 밖에서 전체 해상도로 그린다(drawSpark)
  u('glCellPx', P.glCell * S); u('glP', P.glP)
  u('glRThin', P.glRThin * S); u('glThinP', P.glThinP)
  u('glRMin', P.glRMin * S); u('glRMax', P.glRMax * S)
  u('glBMin', P.glBMin); u('glBMax', P.glBMax)
  u('glTail', P.glTail); u('glDesat', P.glDesat)
  u('glCloud', P.glCloud); u('glCloudScl', P.glCloudScale * S)
  u('sparkAmp', P.sparkAmp)
  u('glintCellPx', P.glintCell * S); u('glintLenPx', P.glintLen * S)
  u('dry', P.dry); u('dryLag', P.dryLag)
  u('wetDark', P.wetDark); u('wetGloss', P.wetGloss)
}

const strokeStyle = (paint, w) => {
  paint.setAntiAlias(true)
  paint.setStyle(PaintStyle.Stroke)
  paint.setStrokeWidth(Math.max(0.1, w))
  paint.setStrokeCap(StrokeCap.Round)
  paint.setStrokeJoin(StrokeJoin.Round)
  return paint
}

// 표본 → 중심선 경로(표본 사이는 2차 곡선 — 직선으로 이으면 각져 보인다)
function centerPath(dabs, s = 1, from = 0, to = dabs.length - 1) {
  const pb = Skia.PathBuilder.Make()
  pb.moveTo(dabs[from].x * s, dabs[from].y * s)
  if (to <= from) { pb.lineTo(dabs[from].x * s + 0.01, dabs[from].y * s); return pb.build() }
  for (let i = from + 1; i < to; i++) {
    const a = dabs[i], b = dabs[i + 1]
    pb.quadTo(a.x * s, a.y * s, (a.x + b.x) / 2 * s, (a.y + b.y) / 2 * s)
  }
  pb.lineTo(dabs[to].x * s, dabs[to].y * s)
  return pb.build()
}

// 필압에 따라 도장 반지름이 달라지므로 획은 굵기가 변한다. Skia 는 한 번에 한 굵기만 그으므로
// 비슷한 굵기끼리 구간으로 묶어 이어 긋는다(몸통색이 같아 이음새는 보이지 않는다).
// 필압이 없으면(모두 같은 반지름) 구간이 하나라 예전과 똑같다.
const WIDTH_LEVELS = 6
function widthRuns(dabs) {
  let min = Infinity, max = -Infinity
  for (const d of dabs) { if (d.r < min) min = d.r; if (d.r > max) max = d.r }
  if (!(max > min * 1.02)) return [{ from: 0, to: dabs.length - 1, w: 2 * (dabs[0]?.r ?? 0.5) }]
  const level = d => Math.round((d.r - min) / (max - min) * (WIDTH_LEVELS - 1))
  const runs = []
  let from = 0, lv = level(dabs[0])
  for (let i = 1; i < dabs.length; i++) {
    const next = level(dabs[i])
    if (next === lv) continue
    runs.push({ from, to: i, w: 2 * (min + (max - min) * lv / (WIDTH_LEVELS - 1)) })
    from = Math.max(0, i - 1); lv = next
  }
  runs.push({ from, to: dabs.length - 1, w: 2 * (min + (max - min) * lv / (WIDTH_LEVELS - 1)) })
  return runs
}

// 입자를 전체 해상도로 획 위에 덧그린다(필터 밖). 경로를 굵기대로 그으므로 획 밖으로 나가지 않는다.
function drawSpark(canvas, path, width, color, ink, zoom) {
  const P = GLASS_INK
  const amount = ink.glitter === false ? 0 : (ink.amount ?? 1) * P.glAmp
  if (amount <= 0.001) return
  sparkEffect ??= Skia.RuntimeEffect.Make(GLASS_SPARK_SKSL)
  if (!sparkEffect) return
  // 반지름 바닥값: 그대로 두면 확대율이 낮을 때 입자가 화면 반 픽셀 아래로 내려가 사라진다
  const rmin = Math.max(P.glRMin, 0.6 / pxPerUnit(zoom))
  const paint = Skia.Paint()
  paint.setShader(sparkEffect.makeShader([...hex3(color), ...(ink.glitterColor ? hex3(ink.glitterColor) : micaColor(ink.film ?? micaAutoFilm(hex3(color)), 1)),
    P.glCell, P.glP * amount,
    rmin, rmin * (P.glRMax / P.glRMin),
    P.glBMin, P.glBMax, P.glTail, P.glDesat,
    P.glCloud, P.glCloudScale, 0.5 / pxPerUnit(zoom)]))
  canvas.drawPath(path, strokeStyle(paint, width))
}

export function glassPooledFailed() { return failed }

export function drawGlassPooled(canvas, points, width, color, zoom = 1, ink = {}) {
  if (failed) return false
  const P = GLASS_INK
  if (!builder) {
    const effect = Skia.RuntimeEffect.Make(GLASS_INK_SKSL)
    if (!effect) { failed = true; console.warn('[유리펜] 고임 셰이더 컴파일 실패'); return false }
    builder = Skia.RuntimeShaderBuilder(effect)
  }
  // 도장: 긴 획이면 간격을 벌려 수를 묶는다(고임은 블러가 맡으므로 조금 성겨도 된다)
  let len = 0
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  const spacing = Math.max(MASK_SPACING, len / (MASK_MAX_DABS * width))
  const dabs = glassDabs(points, width, { ...P, spacing })
  if (dabs.length < 1) return false

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const d of dabs) { if (d.x < x0) x0 = d.x; if (d.y < y0) y0 = d.y; if (d.x > x1) x1 = d.x; if (d.y > y1) y1 = d.y }

  // ① 몸통을 **벡터로 먼저 긋는다**. 실루엣은 이 획이 정한다 — 형광펜 · 볼펜과 똑같이 또렷하다.
  const body = Skia.Paint()
  body.setColor(Skia.Color(color))
  const runs = widthRuns(dabs)
  for (const run of runs) canvas.drawPath(centerPath(dabs, 1, run.from, run.to), strokeStyle(body, run.w))

  // ② 고임이 만드는 것(커피링 · 테 · 농담 흐름)을 그 위에 얹는다.
  //
  // 좌표계를 **화면 픽셀**로 바꿔서 그린다. 런타임 셰이더 이미지 필터는 화면 픽셀 밀도를
  // 반영하지 않기 때문이다(react-native-skia 문서에 명시 — "RuntimeShader is not taking into
  // account the pixel density scaling", 권장 해법도 크게 그려 줄이기다).
  // 그대로 두면 필터가 논리 픽셀로 래스터화돼 가장자리와 무늬가 네모로 끊긴다(실측).
  // 캔버스를 1/S 로 줄이고 기하를 S 배로 그리면 필터의 1픽셀 = 화면 1픽셀이 된다.
  const S = pxPerUnit(zoom)
  const pad = (P.poolSpread * 3 + width) * S
  const bounds = Skia.XYWHRect(x0 * S - pad, y0 * S - pad, (x1 - x0) * S + pad * 2, (y1 - y0) * S + pad * 2)
  setUniforms(color, width, ink, S)
  const layer = Skia.Paint()
  const sigma = P.poolSpread * S
  const blur = Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal, null)
  layer.setImageFilter(Skia.ImageFilter.MakeRuntimeShaderWithChildren(builder, 0, ['mask', 'pool'], [null, blur]))


  const margin = 3      // 화면 px — 필터 쪽 가장자리를 진짜 가장자리 바깥으로 밀어낸다
  canvas.save()
  canvas.scale(1 / S, 1 / S)
  canvas.saveLayer(Skia.Paint(), bounds)   // 바깥 층(필터 없음)
  canvas.saveLayer(layer, bounds)

  // 두께: 도장을 Lighten(최댓값)으로. 안티에일리어스는 켠다 — 셰이더가 T = m.g / m.a 로 되돌려 읽으므로
  // 두께가 망가지지 않고, Lighten 은 같은 값끼리 제자리라 겹친 가장자리에 이음매도 안 생긴다.
  const dab = Skia.Paint()
  dab.setAntiAlias(true)
  dab.setBlendMode(BlendMode.Lighten)
  for (const d of dabs) {
    const g = Math.min(1, d.t / P.T_MAX)
    dab.setColor(Float32Array.of(g, g, g, 1))
    canvas.drawCircle(d.x * S, d.y * S, d.r * S + margin + 1, dab)
  }
  // 덮임(알파): 중심선을 굵기대로 그은 안티에일리어스 도형으로 곱한다
  const dstIn = Skia.Paint()
  dstIn.setBlendMode(BlendMode.DstIn)
  canvas.saveLayer(dstIn, bounds)
  for (const run of runs) canvas.drawPath(centerPath(dabs, S, run.from, run.to), strokeStyle(Skia.Paint(), run.w * S + 2 * margin))
  canvas.restore()
  canvas.restore()   // 필터 층 끝

  // 필터가 그린 것이 내가 그은 획 밖으로 넘치지 않게 깎는다(사용자 규칙).
  const edge = Skia.Paint()
  edge.setBlendMode(BlendMode.DstIn)
  for (const run of runs) canvas.drawPath(centerPath(dabs, S, run.from, run.to), strokeStyle(edge, run.w * S))
  canvas.restore()   // 바깥 층 끝
  canvas.restore()   // 배율 되돌리기

  // ③ 입자는 필터 밖에서 전체 해상도로. **페이지 좌표** 경로여야 한다
  //    (S 배 경로를 넘기면 화면 밖 먼 곳에 그려져 글리터가 통째로 사라진다)
  for (const run of runs) drawSpark(canvas, centerPath(dabs, 1, run.from, run.to), run.w, color, ink, zoom)
  return true
}
