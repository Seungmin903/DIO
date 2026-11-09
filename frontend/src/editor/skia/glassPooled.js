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
import { GLASS_INK, GLASS_INK_SKSL, abLineOf, glassDabs, inkDensity, micaColor, sheenAutoColor } from '../utils/glassInk.js'

let builder = null, failed = false, reported = 0
const hex3 = color => { const c = Skia.Color(color); return [c[0], c[1], c[2]] }

// 두께 마스크는 도장이 겹쳐야 매끈하다. 경로용(0.38)보다 촘촘하되, 긴 획에서는 수를 제한한다.
const MASK_SPACING = 0.22
const MASK_MAX_DABS = 3000
// 페이지 1단위가 화면 몇 px 인가. 눈대중으로 두면 입자 가장자리(aa)와 도장 여유(fringe)가
// 실제 픽셀보다 커져 그대로 뭉개진다 — 기기 배율 × 확대율로 정확히 구한다.
const pxPerUnit = zoom => Math.max(0.2, PixelRatio.get() * Math.max(0.05, zoom))

function setUniforms(color, width, ink, zoom) {
  const P = GLASS_INK
  const rgb = hex3(color)
  const sheenOn = ink.sheen !== false
  const sheenAmount = sheenOn ? (ink.sheenAmount ?? 1) : 0
  const glitterAmount = ink.glitter === false ? 0 : (ink.amount ?? 1)
  const film = ink.film ?? P.glFilm
  const tilt = P.glFilmTilt * Math.PI / 180
  const u = (name, ...v) => builder.setUniform(name, v)

  u('org', 0, 0); u('ppu', 1)
  u('aa', 0.5 / pxPerUnit(zoom))   // 화면 0.5px 에 해당하는 페이지 길이
  u('ink', ...rgb); u('dens', ...inkDensity(rgb))
  u('satK', P.satK); u('tMax', P.T_MAX)
  u('rad', P.rimR * width)
  u('ringStart', P.ringStart); u('ringFull', P.ringFull)
  u('fIn', P.fIn); u('fRim', P.fRim); u('tGamma', P.tGamma); u('alphaK', P.alphaK)
  u('satStart', P.satStart); u('satMax', P.satMax)
  u('flowAmp', P.flowAmp); u('flowScl', P.flowScale)
  u('sheenCol', ...(ink.sheenColor ? hex3(ink.sheenColor) : sheenAutoColor(rgb)))
  u('sheenAmp', P.sheenAmp * sheenAmount)
  u('sheenRimA', P.sheenRimA); u('sheenRimBand', P.sheenRimBand)
  u('sheenGate0', P.sheenGate0); u('sheenGate1', P.sheenGate1)
  u('sheenInT', P.sheenInT); u('sheenInAmp', P.sheenInAmp)
  u('sheenEdge', P.sheenEdge * sheenAmount)
  u('sheenPatch', P.sheenPatch); u('sheenGrain', P.sheenGrain)
  u('abLine', abLineOf(width)); u('poolMix', P.poolMix)
  u('sheenWiggle', P.sheenWiggle); u('sheenWScl', P.sheenWScale)
  u('micaA', ...micaColor(film, 1))
  u('micaB', ...micaColor(film, Math.cos(tilt * 0.5)))
  u('micaC', ...micaColor(film, Math.cos(tilt)))
  u('glVeil', P.glVeil); u('glVeilDesat', P.glVeilDesat)
  u('glVeilLift', P.glVeilLift); u('glVeilScl', P.glVeilScale)
  u('glAmp', P.glAmp * glitterAmount)
  u('glCellPx', P.glCell); u('glP', P.glP)
  u('glRThin', P.glRThin); u('glThinP', P.glThinP)
  u('glRMin', P.glRMin); u('glRMax', P.glRMax)
  u('glBMin', P.glBMin); u('glBMax', P.glBMax)
  u('glTail', P.glTail); u('glDesat', P.glDesat)
  u('glCloud', P.glCloud); u('glCloudScl', P.glCloudScale)
  u('sparkAmp', P.sparkAmp)
  u('glintCellPx', P.glintCell); u('glintLenPx', P.glintLen)
  u('dry', P.dry); u('dryLag', P.dryLag)
  u('wetDark', P.wetDark); u('wetGloss', P.wetGloss)
}

export function glassPooledFailed() { return failed }

export function drawGlassPooled(canvas, points, width, color, zoom = 1, ink = {}) {
  if (failed) return false
  const P = GLASS_INK
  const t0 = Date.now()
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
  // 블러가 바깥으로 번지므로 상자를 넉넉히. 테 판정은 이 번짐을 읽는다.
  const pad = P.poolSpread * 3 + width
  const bounds = Skia.XYWHRect(x0 - pad, y0 - pad, (x1 - x0) + pad * 2, (y1 - y0) + pad * 2)

  setUniforms(color, width, ink, zoom)
  const layer = Skia.Paint()
  const blur = Skia.ImageFilter.MakeBlur(P.poolSpread, P.poolSpread, TileMode.Decal, null)
  layer.setImageFilter(Skia.ImageFilter.MakeRuntimeShaderWithChildren(builder, 0, ['mask', 'pool'], [null, blur]))
  canvas.saveLayer(layer, bounds)

  // 두께: 도장을 Lighten(최댓값)으로 — 겹쳐도 끝없이 두꺼워지지 않는다. 안티에일리어스는 끈다
  // (켜면 도장 경계마다 반투명 테두리가 생겨 두께에 결이 간다). 대신 반지름을 조금 키워 틈을 메운다.
  const fringe = 0.5 / pxPerUnit(zoom)   // 화면 0.5px — 안티에일리어스를 끈 도장 사이의 틈만 메운다
  const dab = Skia.Paint()
  dab.setAntiAlias(false)
  dab.setBlendMode(BlendMode.Lighten)
  for (const d of dabs) {
    const g = Math.min(1, d.t / P.T_MAX)
    dab.setColor(Float32Array.of(g, g, g, 1))
    canvas.drawCircle(d.x, d.y, d.r + fringe, dab)
  }
  // 덮임(알파): 중심선을 굵기대로 그은 안티에일리어스 도형으로 곱한다 → 가장자리가 매끈해지고
  // 잉크가 내가 그은 영역 밖으로 번지지 않는다.
  const dstIn = Skia.Paint()
  dstIn.setBlendMode(BlendMode.DstIn)
  canvas.saveLayer(dstIn, bounds)
  const cov = Skia.Paint()
  cov.setAntiAlias(true)
  cov.setStyle(PaintStyle.Stroke)
  cov.setStrokeWidth(width)
  cov.setStrokeCap(StrokeCap.Round)
  cov.setStrokeJoin(StrokeJoin.Round)
  const pb = Skia.PathBuilder.Make()
  pb.moveTo(dabs[0].x, dabs[0].y)
  if (dabs.length === 1) pb.lineTo(dabs[0].x + 0.01, dabs[0].y)
  for (let i = 1; i < dabs.length - 1; i++) {
    const a = dabs[i], b = dabs[i + 1]
    pb.quadTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2)
  }
  if (dabs.length > 1) pb.lineTo(dabs[dabs.length - 1].x, dabs[dabs.length - 1].y)
  canvas.drawPath(pb.build(), cov)
  canvas.restore()

  canvas.restore()
  // 화질을 눈대중 말고 숫자로 보기 위해 처음 몇 획만 찍는다(그 뒤로는 조용하다).
  if (reported < 3) {
    reported++
    console.log('[유리펜 27판]', JSON.stringify({
      배율: PixelRatio.get(), 확대: zoom, 페이지1단위px: +pxPerUnit(zoom).toFixed(2),
      굵기: width, 도장: dabs.length, 간격: +spacing.toFixed(3),
      층px: [Math.round((x1 - x0 + pad * 2) * pxPerUnit(zoom)), Math.round((y1 - y0 + pad * 2) * pxPerUnit(zoom))],
      블러시그마px: +(P.poolSpread * pxPerUnit(zoom)).toFixed(1),
      ms: +(Date.now() - t0).toFixed(0),
    }))
  }
  return true
}
