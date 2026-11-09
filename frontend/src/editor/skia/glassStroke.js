// 유리펜(글라스 딥펜) 획 그리기 — PC 하네스(`유리펜 설계/하네스`) 23판 구조.
//   (1) 두께 마스크 한 장(도장을 Lighten 으로 drawAtlas 한 번)
//   (2) 그 마스크를 가우시안 블러한 "고임 장"(액체 평탄화 — 테 · 건조 · 글리터 밀도 판정)
//   (3) 런타임 셰이더 한 번(염료 투과 · 커피링 · 농담 · 테 · 운모 막 · 글리터)
//
// 쓰는 중과 손을 뗀 뒤가 같은 그림이 되도록 같은 함수를 쓴다.
// 쓰는 중에 표면을 매 프레임 만들면 이 기기(SM-X510)에서 MakeOffscreen 이 죽는다(pencilBrush.js 주석).
// 그래서 획 하나당 표면을 한 번만 잡고, 프레임마다 새로 생긴 도장만 덧찍는다(Lighten 은 누적이라 된다).
// 프레임마다 뜨는 스냅숏 이미지는 다음 프레임 첫머리에 놓아 준다(GPU 메모리가 쌓이지 않게).
import { BlendMode, FilterMode, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia'
import { abLineOf, GLASS_INK, GLASS_INK_SKSL, GLASS_LIVE_SKSL, glassDabs, inkDensity, micaColor, sheenAutoColor } from '../utils/glassInk.js'

// 표면 상한 — 크게 잡으면 기기가 죽는다. 2026-11-09 실기: 확대(ppu 5.5)에서 획 하나가
// 3789x1059(400만 화소) 짜리 표면을 3장씩 쓰고, 확대할 때마다 보이는 획이 전부 다시 그려져
// librnskia 가 SIGTRAP 으로 죽었다. 품질보다 안 죽는 게 먼저다.
const MAX_EDGE = 2048, MAX_PIXELS = 640 * 1024
// 배율을 **고정**한다. zoom 을 따라가면 확대 · 축소 · 베이크마다 배율이 달라져 같은 획이
// 계속 다시 구워진다(실기 로그: 같은 획이 ppu 3.00 <-> 1.57 로 번갈아 재생성 → 메모리 폭증 → SIGTRAP).
// 한 번 구운 그림을 캔버스가 늘려 쓰므로, 많이 확대하면 조금 부드러워진다(구운 잉크답기도 하다).
const FIXED_PPU = 3.0     // 캔버스가 쓰는 배율(실기 로그 3.00)에 맞춘다 — 더 낮추면 눈에 띄게 뿌옇다
const POOL_DIV = 2            // 고임 장은 저주파라 절반 해상도로 블러해도 같다(블러 비용 1/4)
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None }   // 밉맵은 축소할 때 알파를 깎는다 → 획이 반투명해진다
const makeSurface = (w, h) => Skia.Surface.MakeOffscreen ? Skia.Surface.MakeOffscreen(w, h) : Skia.Surface.Make(w, h)
const hex3 = color => { const c = Skia.Color(color); return [c[0], c[1], c[2]] }

let effect = null, liveEffect = null, broken = false, logDone = 0
// 마스크 · 고임 장 표면은 이 함수 안에서만 쓰고 밖으로 안 나간다 → 재사용해도 안전하다.
// (밖으로 나가는 건 구운 이미지뿐이고, 그 표면만 획마다 새로 만든다.)
let scratch = null
function acquireScratch(pw, ph) {
  const w = Math.ceil(pw / 256) * 256, h = Math.ceil(ph / 256) * 256
  if (scratch && scratch.w >= w && scratch.h >= h && scratch.w * scratch.h <= 4 * w * h) return scratch
  scratch?.mask?.dispose?.(); scratch?.blur?.dispose?.(); scratch = null
  const mask = makeSurface(w, h), blur = makeSurface(Math.ceil(w / POOL_DIV), Math.ceil(h / POOL_DIV))
  if (!mask || !blur) { mask?.dispose?.(); blur?.dispose?.(); throw new Error(`MakeOffscreen ${w}x${h} 실패`) }
  return (scratch = { w, h, mask, blur })
}
export const glassBroken = () => broken

// 도장 스프라이트: 안티에일리어스 흰 원. 많이 줄이면 가장자리가 거칠어지므로 크기를 몇 단계로 나눠 둔다.
const tips = new Map()
function tipImage(radiusPx) {
  const want = Math.max(8, radiusPx * 4)
  const size = Math.min(64, Math.max(8, 1 << Math.ceil(Math.log2(want))))
  let tip = tips.get(size)
  if (tip) return tip
  const s = makeSurface(size, size)
  if (!s) throw new Error(`MakeOffscreen ${size}x${size} 실패`)
  const c = s.getCanvas(), p = Skia.Paint()
  c.clear(Skia.Color('transparent'))
  p.setAntiAlias(true); p.setColor(Skia.Color('white'))
  c.drawCircle(size / 2, size / 2, size / 2 - 1, p)
  s.flush()
  tip = { image: s.makeImageSnapshot(), size, r: size / 2 - 1 }
  s.dispose?.()
  tips.set(size, tip)
  return tip
}

// 획 상자: 점 범위 + 여유(고임 장 블러가 획 밖으로 번진다)
export function glassBox(points, width) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const one of points) { x0 = Math.min(x0, one.x); y0 = Math.min(y0, one.y); x1 = Math.max(x1, one.x); y1 = Math.max(y1, one.y) }
  const pad = GLASS_INK.poolSpread * 2 + width * 1.5
  return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + 2 * pad, h: (y1 - y0) + 2 * pad }
}
// 화면 픽셀 / 페이지 단위. 긴 획이 흐려지지 않게 한 변 상한과 넓이 상한을 따로 본다
const sizeOf = box => {
  const ppu = Math.max(0.25, Math.min(FIXED_PPU, MAX_EDGE / box.w, MAX_EDGE / box.h, Math.sqrt(MAX_PIXELS / (box.w * box.h))))
  return { ppu, pw: Math.max(1, Math.ceil(box.w * ppu)), ph: Math.max(1, Math.ceil(box.h * ppu)) }
}

const uniforms = (box, ppu, color, width, ink, P = GLASS_INK) => {
  const rgb = hex3(color)
  const sheenCol = ink.sheenColor ? hex3(ink.sheenColor) : sheenAutoColor(rgb)
  const film = ink.film ?? P.glFilm, tilt = P.glFilmTilt * Math.PI / 180
  const amount = ink.glitter === false ? 0 : (ink.amount ?? 1) * P.glAmp
  return [
    box.x, box.y, ppu, 0.5 / ppu,
    ...rgb, ...inkDensity(rgb), P.satK, P.T_MAX, P.rimR, P.ringStart, P.ringFull, P.fIn, P.fRim, P.tGamma, P.alphaK, P.satStart, P.satMax, P.flowAmp, P.flowScale,
    ...sheenCol, ink.sheen === false ? 0 : P.sheenAmp * (ink.sheenAmount ?? 1), P.sheenRimA, P.sheenRimBand, P.sheenGate0, P.sheenGate1,
    P.sheenInT, P.sheenInAmp, P.sheenEdge, P.sheenPatch, P.sheenGrain, abLineOf(width, P.poolSpread), P.poolMix, P.sheenWiggle, P.sheenWScale,
    ...micaColor(film, 1), ...micaColor(film, Math.cos(tilt / 2)), ...micaColor(film, Math.cos(tilt)),
    P.glVeil, P.glVeilDesat, P.glVeilLift, P.glVeilScale,
    amount, P.glCell, P.glP, P.glRThin, P.glThinP, P.glRMin, P.glRMax, P.glBMin, P.glBMax, P.glTail, P.glDesat, P.glCloud, P.glCloudScale,
    P.sparkAmp, P.glintCell, P.glintLen,
    ink.dry ?? P.dry, P.dryLag, P.wetDark, P.wetGloss,
  ]
}

// 두께 마스크에 도장을 찍는다. from 부터만 찍으면 덧찍기(쓰는 중)가 된다 — Lighten 은 누적이라 같은 결과.
function stampDabs(surface, dabs, from, box, ppu, clear) {
  const sc = surface.getCanvas()
  if (clear) sc.clear(Skia.Color('transparent'))
  if (from >= dabs.length) return
  const tip = tipImage(Math.max(0.5, dabs[0].r * ppu))
  const src = Skia.XYWHRect(0, 0, tip.size, tip.size), half = tip.size / 2
  const srcs = [], dsts = [], colors = []
  for (let i = from; i < dabs.length; i++) {
    const one = dabs[i], k = (one.r * ppu + 0.5) / tip.r
    const x = (one.x - box.x) * ppu, y = (one.y - box.y) * ppu
    srcs.push(src)
    dsts.push(Skia.RSXform(k, 0, x - k * half, y - k * half))
    const g = Math.min(1, Math.max(0, one.t / GLASS_INK.T_MAX))
    colors.push(Float32Array.of(g, g, g, 1))
  }
  const paint = Skia.Paint()
  paint.setBlendMode(BlendMode.Lighten)
  sc.drawAtlas(tip.image, srcs, dsts, paint, BlendMode.Modulate, colors, SAMPLING)
}

// 마스크 → 고임 장(절반 해상도 가우시안 블러)
function blurPool(blurSurface, maskImage, ppu) {
  const bc = blurSurface.getCanvas()
  bc.clear(Skia.Color('transparent'))
  const paint = Skia.Paint()
  const sigma = GLASS_INK.poolSpread * ppu / POOL_DIV
  paint.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal, null))
  bc.save(); bc.scale(1 / POOL_DIV, 1 / POOL_DIV)
  bc.drawImage(maskImage, 0, 0, paint)
  bc.restore()
}

// 셰이더 한 번 — 페이지 좌표 상자에 칠한다. 고임 장은 절반 해상도라 행렬로 되돌려 읽는다.
function paintInk(canvas, box, ppu, color, width, ink, maskImage, poolImage) {
  effect ??= Skia.RuntimeEffect.Make(GLASS_INK_SKSL)
  if (!effect) throw new Error('RuntimeEffect.Make 실패')
  const paint = Skia.Paint()
  const poolShader = poolImage.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None,
    Skia.Matrix().scale(POOL_DIV, POOL_DIV))
  paint.setShader(effect.makeShaderWithChildren(uniforms(box, ppu, color, width, ink), [
    maskImage.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None), poolShader]))
  canvas.drawRect(Skia.XYWHRect(box.x, box.y, box.w, box.h), paint)
}

// 쓰는 중 ────────────────────────────────────────────────────────────────────
// **오프스크린 표면을 쓰지 않는다.** 이 기기(SM-X510)에서 쓰는 중에 표면을 만들거나 다시 쓰면
// librnskia.so 가 SIGTRAP · SIGSEGV 로 죽는다(2026-11-09 실기 확인, 연필도 같은 이유로
// shader 엔진을 꺼 두었다 — pencilBrush.js engine 주석).
// 그래서 쓰는 중에는 마스크 · 고임 장 없이 **획 경로에 바로 칠하는 가벼운 셰이더**를 쓴다.
// 잉크색 + 운모 막 + 입자까지는 같고, 테 · 커피링은 손을 뗀 뒤에 생긴다.
export function endGlassLive() {}
export function glassLivePaint(color, width, ink = {}, P = GLASS_INK) {
  if (broken) return null
  try {
    liveEffect ??= Skia.RuntimeEffect.Make(GLASS_LIVE_SKSL)
    if (!liveEffect) return null
    const amount = ink.glitter === false ? 0 : (ink.amount ?? 1) * P.glAmp
    if (amount <= 0.001) return null
    const mica = micaColor(ink.film ?? P.glFilm, 1)
    const paint = Skia.Paint()
    const r = Math.max(0.3, P.glRThin * 4)   // 쓰는 중에는 보이는 크기로(0.08 은 AA 에 뭉개져 안 보였다)
    paint.setShader(liveEffect.makeShader([...hex3(color), ...mica, r * 0.7, amount,
      P.glCell, P.glP * P.glThinP, r, r * 1.6, P.glBMin, P.glBMax, P.glTail, P.glDesat,
      P.glCloud, P.glCloudScale, P.glVeil, P.glVeilDesat, P.glVeilLift, P.glVeilScale]))
    return paint
  } catch (error) {
    console.warn('[유리펜] 쓰는 중 셰이더 실패:', error?.message ?? error)
    return null
  }
}

// 손을 뗀 뒤 ─────────────────────────────────────────────────────────────────
// 완성 획은 Picture 에 기록됐다가 나중에 재생된다. 제자리에 칠하면 Picture 가 자식 이미지를 계속
// 참조하는데 그 표면은 다음 획이 쓴다 → 독립 표면에 한 장으로 구워 그 이미지만 넘긴다.
export function drawGlassStroke(canvas, points, width, color, _zoom = 1, ink = {}) {
  if (broken || !points?.length) return false
  const box = glassBox(points, width)
  if (!(box.w > 0 && box.h > 0)) return false
  const { ppu, pw, ph } = sizeOf(box)
  let out = null, maskImage = null, poolImage = null
  try {
    const dabs = glassDabs(points, width)
    if (!dabs.length) return false
    const pad = acquireScratch(pw, ph)
    out = makeSurface(pw, ph)
    if (!out) throw new Error(`MakeOffscreen ${pw}x${ph} 실패`)
    stampDabs(pad.mask, dabs, 0, box, ppu, true)
    pad.mask.flush(); maskImage = pad.mask.makeImageSnapshot(Skia.XYWHRect(0, 0, pw, ph))
    blurPool(pad.blur, maskImage, ppu)
    pad.blur.flush(); poolImage = pad.blur.makeImageSnapshot(Skia.XYWHRect(0, 0, Math.ceil(pw / POOL_DIV), Math.ceil(ph / POOL_DIV)))
    const oc = out.getCanvas()
    oc.clear(Skia.Color('transparent'))
    oc.save(); oc.scale(ppu, ppu); oc.translate(-box.x, -box.y)
    paintInk(oc, box, ppu, color, width, ink, maskImage, poolImage)
    oc.restore()
    out.flush()
    const baked = out.makeImageSnapshot()   // 이 이미지만 Picture 가 들고 간다(해제하지 않는다)
    canvas.save()
    canvas.translate(box.x, box.y); canvas.scale(box.w / pw, box.h / ph)
    // 확대하면 구운 그림을 늘려 쓰므로 **반드시 선형 보간**으로 그린다.
    // 기본(최근접)으로 그리면 화소가 네모로 드러나 글리터가 네모 블록이 되고 가장자리가 깨진다.
    if (canvas.drawImageOptions) canvas.drawImageOptions(baked, 0, 0, FilterMode.Linear, MipmapMode.None)
    else canvas.drawImage(baked, 0, 0)
    canvas.restore()
    if (logDone < 12) { logDone++; console.log(`[유리펜] 완성 ${pw}x${ph} ppu ${ppu.toFixed(2)} 도장 ${dabs.length}`) }
    return true
  } catch (error) {
    broken = true
    console.warn('[유리펜] 셰이더 경로 실패 — 평범한 선으로 전환:', error?.message ?? error)
    return false
  } finally {
    maskImage?.dispose?.(); poolImage?.dispose?.(); out?.dispose?.()
  }
}
