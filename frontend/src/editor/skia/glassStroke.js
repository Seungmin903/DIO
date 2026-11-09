// 유리펜(글라스 딥펜) 획 그리기 — PC 하네스(`유리펜 설계/하네스`)의 18판 구조를 그대로 옮긴 것.
//   ① 두께 마스크 한 장(도장 Lighten × 덮임 DstIn)
//   ② 그 마스크를 가우시안 블러한 "고임 장"(액체 평탄화 — 테 · 건조 · 글리터 밀도 판정)
//   ③ 런타임 셰이더 한 번(염료 투과 · 커피링 · 농담 · 테 · 운모 막 · 글리터)
// 좌표는 페이지 단위로 통일한다. 자식 이미지만 셰이더 안에서 픽셀 좌표로 바꿔 읽는다 → 확대해도 무늬가 그대로.
import { BlendMode, FilterMode, MipmapMode, PaintStyle, Skia, StrokeCap, StrokeJoin, TileMode } from '@shopify/react-native-skia'
import { GLASS_INK, GLASS_INK_SKSL, glassDabs, inkDensity, micaColor, sheenAutoColor } from '../utils/glassInk.js'

const MAX_EDGE = 2048, MAX_PIXELS = 4 * 1024 * 1024
const makeSurface = (w, h) => Skia.Surface.MakeOffscreen ? Skia.Surface.MakeOffscreen(w, h) : Skia.Surface.Make(w, h)
const hex3 = color => { const c = Skia.Color(color); return [c[0], c[1], c[2]] }

let effect = null, broken = false
export const glassBroken = () => broken

// 획 상자: 점 범위 + 여유(테 · 고임 장 블러가 획 밖으로 번진다)
export function glassBox(points, width) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const one of points) { x0 = Math.min(x0, one.x); y0 = Math.min(y0, one.y); x1 = Math.max(x1, one.x); y1 = Math.max(y1, one.y) }
  const pad = width * (GLASS_INK.poolBlur * 2 + 1.5)
  return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + 2 * pad, h: (y1 - y0) + 2 * pad }
}

const uniforms = (box, ppu, color, P = GLASS_INK) => {
  const ink = hex3(color)
  const sheen = P.sheenHex ? hex3(P.sheenHex) : sheenAutoColor(ink)
  const tilt = P.glFilmTilt * Math.PI / 180
  return [
    box.x, box.y, ppu, 0.5 / ppu,
    ...ink, ...inkDensity(ink), P.satK, P.T_MAX, P.rimR * 1, P.fIn, P.fRim, P.tGamma, P.alphaK, P.satStart, P.satMax, P.flowAmp, P.flowScale,
    ...sheen, P.sheenAmp, P.sheenRimA, P.sheenRimBand, P.sheenGate0, P.sheenGate1, P.sheenInT, P.sheenInAmp, P.poolMix, P.floodA0, P.floodA1, P.sheenWiggle, P.sheenWScale,
    ...micaColor(P.glFilm, 1), ...micaColor(P.glFilm, Math.cos(tilt / 2)), ...micaColor(P.glFilm, Math.cos(tilt)),
    P.glVeil, P.glVeilDesat, P.glVeilLift, P.glVeilScale,
    P.glAmp, P.glCell, P.glP, P.glRMin, P.glRMax, P.glBMin, P.glBMax, P.glTail, P.glDesat, P.glCloud, P.glCloudScale,
    P.sparkAmp, P.glintCell, P.glintLen,
    P.dry, P.dryLag, P.wetDark, P.wetGloss,
  ]
}

// 두께 마스크: G = 두께 / T_MAX, 알파 = 덮임. 획 하나 안은 Lighten(최대), 덮임은 DstIn 으로 깎는다.
function stampMask(surface, dabs, box, ppu, width) {
  const sc = surface.getCanvas()
  sc.clear(Skia.Color('transparent'))
  sc.save(); sc.scale(ppu, ppu); sc.translate(-box.x, -box.y)
  const dab = Skia.Paint(); dab.setAntiAlias(false); dab.setBlendMode(BlendMode.Lighten)
  const fringe = 1 / ppu
  for (const one of dabs) {
    const g = Math.min(1, one.t / GLASS_INK.T_MAX)
    dab.setColor(Skia.Color(`rgba(${Math.round(g * 255)}, ${Math.round(g * 255)}, ${Math.round(g * 255)}, 1)`))
    sc.drawCircle(one.x, one.y, one.r + fringe, dab)
  }
  const dstIn = Skia.Paint(); dstIn.setBlendMode(BlendMode.DstIn)
  sc.saveLayer(dstIn)
  const line = Skia.Paint(); line.setAntiAlias(true); line.setStyle(PaintStyle.Stroke)
  line.setStrokeCap(StrokeCap.Round); line.setStrokeJoin(StrokeJoin.Round); line.setStrokeWidth(width)
  line.setColor(Skia.Color('white'))
  const pb = Skia.PathBuilder.Make()
  pb.moveTo(dabs[0].x, dabs[0].y)
  for (const one of dabs) pb.lineTo(one.x, one.y)
  const path = pb.build()
  sc.drawPath(path, line)
  const fill = Skia.Paint(); fill.setAntiAlias(true); fill.setColor(Skia.Color('white'))
  for (const one of dabs) if (one.r > width / 2 * 1.01) sc.drawCircle(one.x, one.y, one.r, fill)
  sc.restore()
  sc.restore()
}

// 페이지 캔버스에 유리펜 획 하나를 그린다. 못 그리면 false(부르는 쪽이 평범한 선으로 되돌린다).
export function drawGlassStroke(canvas, points, width, color, zoom = 1) {
  if (broken || !points?.length) return false
  const box = glassBox(points, width)
  const ppu = Math.max(0.25, Math.min(zoom, MAX_EDGE / box.w, MAX_EDGE / box.h))
  const pw = Math.max(1, Math.ceil(box.w * ppu)), ph = Math.max(1, Math.ceil(box.h * ppu))
  if (pw * ph > MAX_PIXELS) return false
  let mask = null, pool = null, maskImage = null, poolImage = null
  try {
    const dabs = glassDabs(points, width)
    if (!dabs.length) return false
    effect ??= Skia.RuntimeEffect.Make(GLASS_INK_SKSL)
    if (!effect) throw new Error('RuntimeEffect.Make 실패')
    mask = makeSurface(pw, ph); if (!mask) throw new Error(`MakeOffscreen ${pw}x${ph} 실패`)
    stampMask(mask, dabs, box, ppu, width)
    mask.flush(); maskImage = mask.makeImageSnapshot()
    // 고임 장: 마스크를 가우시안 블러(액체 평탄화 규모 = poolBlur × 굵기)
    pool = makeSurface(pw, ph); if (!pool) throw new Error(`MakeOffscreen ${pw}x${ph} 실패`)
    const pc = pool.getCanvas()
    pc.clear(Skia.Color('transparent'))
    const blur = Skia.Paint()
    const sigma = GLASS_INK.poolBlur * width * ppu
    blur.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal, null))
    pc.drawImage(maskImage, 0, 0, blur)
    pool.flush(); poolImage = pool.makeImageSnapshot()
    const child = image => image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None)
    const paint = Skia.Paint()
    paint.setShader(effect.makeShaderWithChildren(uniforms(box, ppu, color), [
      maskImage.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None), child(poolImage)]))
    canvas.drawRect(Skia.XYWHRect(box.x, box.y, box.w, box.h), paint)
    return true
  } catch (error) {
    broken = true
    console.warn('[유리펜] 셰이더 경로 실패 — 평범한 선으로 전환:', error?.message ?? error)
    return false
  } finally {
    maskImage?.dispose?.(); poolImage?.dispose?.(); mask?.dispose?.(); pool?.dispose?.()
  }
}
