// 유리펜(글라스 딥펜) 획 그리기 — PC 하네스(`유리펜 설계/하네스`) 18판 구조.
//   ① 두께 마스크 한 장(도장을 Lighten 으로 한 번에 — drawAtlas)
//   ② 그 마스크를 가우시안 블러한 "고임 장"(액체 평탄화 — 테 · 건조 · 글리터 밀도 판정)
//   ③ 런타임 셰이더 한 번(염료 투과 · 커피링 · 농담 · 테 · 운모 막 · 글리터)
//
// 중요 — **쓰는 중에는 이 경로를 쓰지 않는다.** 연필이 같은 기기(SM-X510)에서 겪은 문제 그대로다:
//   프레임마다 오프스크린 표면을 만들면 GPU 이미지가 쌓여 MakeOffscreen 에서 SIGTRAP 으로 죽는다
//   (pencilBrush.js engine 주석). 그래서 쓰는 중은 평범한 선, 손을 뗀 뒤 한 번만 이 경로로 그린다.
// 좌표는 페이지 단위로 통일한다. 자식 이미지만 셰이더 안에서 픽셀 좌표로 바꿔 읽는다 → 확대해도 무늬가 그대로.
import { BlendMode, FilterMode, MipmapMode, PaintStyle, Skia, StrokeCap, StrokeJoin, TileMode } from '@shopify/react-native-skia'
import { abLineOf, GLASS_INK, GLASS_INK_SKSL, GLASS_LIVE_SKSL, glassDabs, inkDensity, micaColor, sheenAutoColor } from '../utils/glassInk.js'

const MAX_EDGE = 4096, MAX_PIXELS = 4 * 1024 * 1024   // 연필 shader 경로와 같은 상한
const TIP = 64, TIP_R = TIP / 2 - 1
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None }   // 밉맵은 축소할 때 알파를 깎는다 → 획이 반투명해진다
const makeSurface = (w, h) => Skia.Surface.MakeOffscreen ? Skia.Surface.MakeOffscreen(w, h) : Skia.Surface.Make(w, h)
const hex3 = color => { const c = Skia.Color(color); return [c[0], c[1], c[2]] }

let effect = null, liveEffect = null, tip = null, pool = null, broken = false
export const glassBroken = () => broken

// 도장 스프라이트: 안티에일리어스 흰 원 한 장. 모든 도장을 drawAtlas 한 번으로 찍는다(도장마다 drawCircle 하면 느리다)
function tipImage() {
  if (tip) return tip
  const s = makeSurface(TIP, TIP)
  if (!s) throw new Error(`MakeOffscreen ${TIP}x${TIP} 실패`)
  const c = s.getCanvas(), p = Skia.Paint()
  c.clear(Skia.Color('transparent'))
  p.setAntiAlias(true); p.setColor(Skia.Color('white'))
  c.drawCircle(TIP / 2, TIP / 2, TIP_R, p)
  s.flush()
  tip = s.makeImageSnapshot()
  s.dispose?.()
  return tip
}
// 표면 두 장(마스크 · 고임 장)을 재사용한다. 256 화소 단위로 올림, 4배 넘게 크면 다시 만든다(연필 acquirePool 과 같은 방식)
function acquire(pw, ph) {
  const w = Math.ceil(pw / 256) * 256, h = Math.ceil(ph / 256) * 256
  if (pool && pool.w >= w && pool.h >= h && pool.w * pool.h <= 4 * w * h) return pool
  pool?.mask?.dispose?.(); pool?.blur?.dispose?.(); pool = null
  const mask = makeSurface(w, h), blur = makeSurface(w, h)
  if (!mask || !blur) { mask?.dispose?.(); blur?.dispose?.(); throw new Error(`MakeOffscreen ${w}x${h} 실패`) }
  return (pool = { w, h, mask, blur })
}

// 획 상자: 점 범위 + 여유(테 · 고임 장 블러가 획 밖으로 번진다)
export function glassBox(points, width) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const one of points) { x0 = Math.min(x0, one.x); y0 = Math.min(y0, one.y); x1 = Math.max(x1, one.x); y1 = Math.max(y1, one.y) }
  const pad = width * (GLASS_INK.poolBlur * 2 + 1.5)
  return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + 2 * pad, h: (y1 - y0) + 2 * pad }
}
// 화면 픽셀 / 페이지 단위. 긴 획이 흐려지지 않게 한 변 상한과 넓이 상한을 따로 본다
const sizeOf = (box, zoom) => {
  const ppu = Math.max(0.25, Math.min(zoom, MAX_EDGE / box.w, MAX_EDGE / box.h, Math.sqrt(MAX_PIXELS / (box.w * box.h))))
  return { ppu, pw: Math.max(1, Math.ceil(box.w * ppu)), ph: Math.max(1, Math.ceil(box.h * ppu)) }
}

const uniforms = (box, ppu, color, ink, P = GLASS_INK) => {
  const rgb = hex3(color)
  const sheenCol = ink.sheenColor ? hex3(ink.sheenColor) : sheenAutoColor(rgb)
  const film = ink.film ?? P.glFilm, tilt = P.glFilmTilt * Math.PI / 180
  const amount = ink.glitter === false ? 0 : (ink.amount ?? 1) * P.glAmp
  return [
    box.x, box.y, ppu, 0.5 / ppu,
    ...rgb, ...inkDensity(rgb), P.satK, P.T_MAX, P.rimR, P.fIn, P.fRim, P.tGamma, P.alphaK, P.satStart, P.satMax, P.flowAmp, P.flowScale,
    ...sheenCol, ink.sheen === false ? 0 : P.sheenAmp * (ink.sheenAmount ?? 1), P.sheenRimA, P.sheenRimBand, P.sheenGate0, P.sheenGate1, P.sheenInT, P.sheenInAmp, P.sheenEdge, P.sheenPatch, P.sheenGrain, abLineOf(P.poolBlur), P.poolMix, P.sheenWiggle, P.sheenWScale,
    ...micaColor(film, 1), ...micaColor(film, Math.cos(tilt / 2)), ...micaColor(film, Math.cos(tilt)),
    P.glVeil, P.glVeilDesat, P.glVeilLift, P.glVeilScale,
    amount, P.glCell, P.glP, P.glRThin, P.glThinP, P.glRMin, P.glRMax, P.glBMin, P.glBMax, P.glTail, P.glDesat, P.glCloud, P.glCloudScale,
    P.sparkAmp, P.glintCell, P.glintLen,
    P.dry, P.dryLag, P.wetDark, P.wetGloss,
  ]
}

// 두께 마스크: G = 두께 / T_MAX, 알파 = 덮임. 도장끼리 Lighten(최대) — 한 획 안에서 겹쳐도 끝없이 진해지지 않는다
function stampMask(surface, dabs, box, ppu, pw, ph, width) {
  const sc = surface.getCanvas(), img = tipImage()
  sc.save()
  sc.clipRect(Skia.XYWHRect(0, 0, pw, ph), 1 /* Intersect */, false)
  sc.clear(Skia.Color('transparent'))
  const src = Skia.XYWHRect(0, 0, TIP, TIP), srcs = [], dsts = [], colors = []
  for (const one of dabs) {
    const k = ((one.r + 0.6 / ppu) * ppu) / TIP_R
    const x = (one.x - box.x) * ppu, y = (one.y - box.y) * ppu
    srcs.push(src)
    dsts.push(Skia.RSXform(k, 0, x - k * (TIP / 2), y - k * (TIP / 2)))
    const g = Math.min(1, Math.max(0, one.t / GLASS_INK.T_MAX))
    colors.push(Float32Array.of(g, g, g, 1))
  }
  const paint = Skia.Paint()
  paint.setBlendMode(BlendMode.Lighten)
  sc.drawAtlas(img, srcs, dsts, paint, BlendMode.Modulate, colors, SAMPLING)
  // 덮임: 획 경로를 안티에일리어스로 그어 알파를 깎는다(DstIn). 도장만 쓰면 안쪽 알파가 1 에 못 미쳐
  // 획 전체가 반투명해지고(종이가 비쳐 뿌옇다) 가장자리도 거칠다. 하네스와 같은 두 겹 구조다.
  const dstIn = Skia.Paint(); dstIn.setBlendMode(BlendMode.DstIn)
  sc.saveLayer(dstIn)
  const line = Skia.Paint()
  line.setAntiAlias(true); line.setStyle(PaintStyle.Stroke); line.setColor(Skia.Color('white'))
  line.setStrokeCap(StrokeCap.Round); line.setStrokeJoin(StrokeJoin.Round); line.setStrokeWidth(width * ppu)
  const pb = Skia.PathBuilder.Make()
  pb.moveTo((dabs[0].x - box.x) * ppu, (dabs[0].y - box.y) * ppu)
  for (const one of dabs) pb.lineTo((one.x - box.x) * ppu, (one.y - box.y) * ppu)
  sc.drawPath(pb.build(), line)
  const fill = Skia.Paint(); fill.setAntiAlias(true); fill.setColor(Skia.Color('white'))
  for (const one of dabs) if (one.r > width / 2 * 1.01) sc.drawCircle((one.x - box.x) * ppu, (one.y - box.y) * ppu, one.r * ppu, fill)
  sc.restore()
  sc.restore()
}

// 페이지 캔버스에 유리펜 획 하나를 그린다(손을 뗀 뒤 한 번). 못 그리면 false → 부르는 쪽이 평범한 선으로.
export function drawGlassStroke(canvas, points, width, color, zoom = 1, ink = {}) {
  if (broken || !points?.length) return false
  const box = glassBox(points, width)
  if (!(box.w > 0 && box.h > 0)) return false
  const { ppu, pw, ph } = sizeOf(box, zoom)
  let maskImage = null, poolImage = null, out = null
  try {
    const dabs = glassDabs(points, width)
    if (!dabs.length) return false
    effect ??= Skia.RuntimeEffect.Make(GLASS_INK_SKSL)
    if (!effect) throw new Error('RuntimeEffect.Make 실패')
    const pair = acquire(pw, ph)
    stampMask(pair.mask, dabs, box, ppu, pw, ph, width)
    pair.mask.flush(); maskImage = pair.mask.makeImageSnapshot(Skia.XYWHRect(0, 0, pw, ph))
    // 고임 장: 마스크를 가우시안 블러(액체 평탄화 규모 = poolBlur × 굵기)
    const bc = pair.blur.getCanvas()
    bc.save(); bc.clipRect(Skia.XYWHRect(0, 0, pw, ph), 1, false)
    bc.clear(Skia.Color('transparent'))
    const blurPaint = Skia.Paint()
    const sigma = GLASS_INK.poolBlur * width * ppu
    blurPaint.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal, null))
    bc.drawImage(maskImage, 0, 0, blurPaint)
    bc.restore()
    pair.blur.flush(); poolImage = pair.blur.makeImageSnapshot(Skia.XYWHRect(0, 0, pw, ph))
    // 완성 획은 Picture 에 기록됐다가 나중에 재생된다. 제자리에 칠하면 Picture 가 마스크 · 고임 장
    // 이미지를 계속 참조하는데, 그건 풀 표면의 스냅숏이라 다음 획이 덮어쓴다 →
    // 지우개로 조각이 한꺼번에 생기면 먼저 만든 조각에 네모난 딴 그림이 보였다.
    // 그래서 독립 표면에 한 장으로 구운 뒤 그 이미지만 넘긴다.
    out = makeSurface(pw, ph)
    if (!out) throw new Error(`MakeOffscreen ${pw}x${ph} 실패`)
    const paint = Skia.Paint()
    paint.setShader(effect.makeShaderWithChildren(uniforms(box, ppu, color, ink), [
      maskImage.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None),
      poolImage.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None)]))
    const oc = out.getCanvas()
    oc.clear(Skia.Color('transparent'))
    oc.save(); oc.scale(ppu, ppu); oc.translate(-box.x, -box.y)
    oc.drawRect(Skia.XYWHRect(box.x, box.y, box.w, box.h), paint)
    oc.restore()
    out.flush()
    const baked = out.makeImageSnapshot()   // 이 이미지만 Picture 가 들고 간다(해제하지 않는다)
    canvas.save()
    canvas.translate(box.x, box.y); canvas.scale(box.w / pw, box.h / ph)
    canvas.drawImage(baked, 0, 0)
    canvas.restore()
    return true
  } catch (error) {
    broken = true
    console.warn('[유리펜] 셰이더 경로 실패 — 평범한 선으로 전환:', error?.message ?? error)
    return false
  } finally {
    maskImage?.dispose?.(); poolImage?.dispose?.(); out?.dispose?.()
  }
}

// 쓰는 중: 마스크 · 고임 장 · 오프스크린 표면 없이 잉크색 + 막 + 입자만. 획 경로에 그대로 칠한다.
export function glassLivePaint(color, ink = {}, P = GLASS_INK) {
  if (broken) return null
  try {
    liveEffect ??= Skia.RuntimeEffect.Make(GLASS_LIVE_SKSL)
    if (!liveEffect) return null
    const amount = ink.glitter === false ? 0 : (ink.amount ?? 1) * P.glAmp
    if (amount <= 0.001) return null
    const mica = micaColor(ink.film ?? P.glFilm, 1)
    const paint = Skia.Paint()
    paint.setShader(liveEffect.makeShader([...hex3(color), ...mica, 0.3, amount,
      P.glCell, P.glP * P.glThinP, P.glRThin, P.glRThin * 1.6, P.glBMin, P.glBMax, P.glTail, P.glDesat, P.glCloud, P.glCloudScale,
      P.glVeil, P.glVeilDesat, P.glVeilLift, P.glVeilScale]))
    return paint
  } catch (error) { console.warn('[유리펜] 라이브 셰이더 실패:', error?.message ?? error); return null }
}
