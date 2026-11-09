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
import { abLineOf, GLASS_INK, GLASS_INK_SKSL, glassDabs, inkDensity, micaColor, sheenAutoColor } from '../utils/glassInk.js'

const MAX_EDGE = 4096, MAX_PIXELS = 4 * 1024 * 1024
const POOL_DIV = 2            // 고임 장은 저주파라 절반 해상도로 블러해도 같다(블러 비용 1/4)
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None }   // 밉맵은 축소할 때 알파를 깎는다 → 획이 반투명해진다
const makeSurface = (w, h) => Skia.Surface.MakeOffscreen ? Skia.Surface.MakeOffscreen(w, h) : Skia.Surface.Make(w, h)
const hex3 = color => { const c = Skia.Color(color); return [c[0], c[1], c[2]] }

let effect = null, broken = false, logLive = 0, logDone = 0
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
const sizeOf = (box, zoom) => {
  const ppu = Math.max(0.25, Math.min(zoom, MAX_EDGE / box.w, MAX_EDGE / box.h, Math.sqrt(MAX_PIXELS / (box.w * box.h))))
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
// 획 하나당 표면 한 쌍을 잡아 두고 새 도장만 덧찍는다. 상자를 벗어나면 다시 잡고 전부 다시 찍는다.
// 쓰는 중 그림도 **구운 이미지 한 장**으로 넘긴다. Picture 에 셰이더를 직접 기록하면 Picture 가
// 마스크 · 고임 장 이미지를 계속 참조하는데, 그건 다음 프레임에 놓아 주는 이미지라 그릴 때쯤이면 없다
// (쓰는 중 획이 아예 안 보이던 원인). 구운 이미지는 몇 프레임 살려 두었다가 놓아 준다.
let live = null, keep = []
const sweep = (n = 3) => { while (keep.length > n) keep.shift()?.dispose?.() }
export function endGlassLive() {
  while (keep.length) keep.shift()?.dispose?.()
  live?.mask?.dispose?.(); live?.blur?.dispose?.(); live?.outs?.[0]?.dispose?.(); live?.outs?.[1]?.dispose?.(); live = null
}
export function drawGlassLive(canvas, points, width, color, zoom = 1, ink = {}) {
  if (broken || !points?.length) return false
  try {
    const dabs = glassDabs(points, width)
    if (!dabs.length) return false
    const need = glassBox(points, width)
    const key = `${width}|${Math.round(zoom * 100)}|${color}|${ink.film ?? ''}|${ink.glitter}|${ink.sheen}|${ink.amount ?? ''}|${ink.sheenColor ?? ''}|${ink.sheenAmount ?? ''}`
    const inside = live && live.key === key && need.x >= live.box.x && need.y >= live.box.y
      && need.x + need.w <= live.box.x + live.box.w && need.y + need.h <= live.box.y + live.box.h
    if (!inside) {
      endGlassLive()
      const grow = Math.max(72, width * 10)    // 획이 자랄 여유(크게 잡으면 매 프레임 블러 비용이 커진다)
      const box = { x: need.x - grow, y: need.y - grow, w: need.w + 2 * grow, h: need.h + 2 * grow }
      const { ppu, pw, ph } = sizeOf(box, zoom)
      if (pw * ph > MAX_PIXELS) return false
      // 구울 표면은 **두 장을 번갈아** 쓴다. 한 장만 쓰면 다음 프레임에 그 표면을 지우는 순간
      // 아직 화면에 그려지지 않은 앞 프레임의 이미지까지 비어 버린다(쓰는 중 획이 안 보이던 원인).
      const mask = makeSurface(pw, ph), blur = makeSurface(Math.ceil(pw / POOL_DIV), Math.ceil(ph / POOL_DIV))
      const outs = [makeSurface(pw, ph), makeSurface(pw, ph)]
      if (!mask || !blur || !outs[0] || !outs[1]) {
        mask?.dispose?.(); blur?.dispose?.(); outs[0]?.dispose?.(); outs[1]?.dispose?.()
        throw new Error(`MakeOffscreen ${pw}x${ph} 실패`)
      }
      live = { key, box, ppu, pw, ph, mask, blur, outs, turn: 0, count: 0 }
      stampDabs(mask, dabs, 0, box, ppu, true)
      live.count = dabs.length
    } else if (dabs.length > live.count) {
      stampDabs(live.mask, dabs, Math.max(0, live.count - 2), live.box, live.ppu, false)
      live.count = dabs.length
    }
    live.mask.flush()
    const maskImage = live.mask.makeImageSnapshot(Skia.XYWHRect(0, 0, live.pw, live.ph))
    blurPool(live.blur, maskImage, live.ppu)
    live.blur.flush()
    const poolImage = live.blur.makeImageSnapshot()
    live.turn ^= 1
    const out = live.outs[live.turn]
    const oc = out.getCanvas()
    oc.clear(Skia.Color('transparent'))
    oc.save(); oc.scale(live.ppu, live.ppu); oc.translate(-live.box.x, -live.box.y)
    paintInk(oc, live.box, live.ppu, color, width, ink, maskImage, poolImage)
    oc.restore()
    out.flush()
    const baked = out.makeImageSnapshot()
    maskImage.dispose?.(); poolImage.dispose?.()   // 굽는 데만 썼다(이 자리에서 다 쓰임)
    keep.push(baked); sweep(2)
    if (logLive < 40) { logLive++; console.log(`[유리펜] 쓰는중 ${live.pw}x${live.ph} 도장 ${dabs.length} 상자 ${Math.round(live.box.x)},${Math.round(live.box.y)} ${Math.round(live.box.w)}x${Math.round(live.box.h)}`) }
    canvas.save()
    canvas.translate(live.box.x, live.box.y); canvas.scale(live.box.w / live.pw, live.box.h / live.ph)
    canvas.drawImage(baked, 0, 0)
    canvas.restore()
    return true
  } catch (error) {
    broken = true
    endGlassLive()
    console.warn('[유리펜] 쓰는 중 셰이더 실패 — 평범한 선으로 전환:', error?.message ?? error)
    return false
  }
}

// 손을 뗀 뒤 ─────────────────────────────────────────────────────────────────
// 완성 획은 Picture 에 기록됐다가 나중에 재생된다. 제자리에 칠하면 Picture 가 자식 이미지를 계속
// 참조하는데 그 표면은 다음 획이 쓴다 → 독립 표면에 한 장으로 구워 그 이미지만 넘긴다.
export function drawGlassStroke(canvas, points, width, color, zoom = 1, ink = {}) {
  if (broken || !points?.length) return false
  const box = glassBox(points, width)
  if (!(box.w > 0 && box.h > 0)) return false
  const { ppu, pw, ph } = sizeOf(box, zoom)
  let mask = null, blur = null, out = null, maskImage = null, poolImage = null
  try {
    const dabs = glassDabs(points, width)
    if (!dabs.length) return false
    endGlassLive()                      // 쓰는 중 표면은 여기서 놓아 준다
    mask = makeSurface(pw, ph)
    blur = makeSurface(Math.ceil(pw / POOL_DIV), Math.ceil(ph / POOL_DIV))
    out = makeSurface(pw, ph)
    if (!mask || !blur || !out) throw new Error(`MakeOffscreen ${pw}x${ph} 실패`)
    stampDabs(mask, dabs, 0, box, ppu, true)
    mask.flush(); maskImage = mask.makeImageSnapshot()
    blurPool(blur, maskImage, ppu)
    blur.flush(); poolImage = blur.makeImageSnapshot()
    const oc = out.getCanvas()
    oc.clear(Skia.Color('transparent'))
    oc.save(); oc.scale(ppu, ppu); oc.translate(-box.x, -box.y)
    paintInk(oc, box, ppu, color, width, ink, maskImage, poolImage)
    oc.restore()
    out.flush()
    const baked = out.makeImageSnapshot()   // 이 이미지만 Picture 가 들고 간다(해제하지 않는다)
    canvas.save()
    canvas.translate(box.x, box.y); canvas.scale(box.w / pw, box.h / ph)
    canvas.drawImage(baked, 0, 0)
    canvas.restore()
    if (logDone < 12) { logDone++; console.log(`[유리펜] 완성 ${pw}x${ph} ppu ${ppu.toFixed(2)} 도장 ${dabs.length}`) }
    return true
  } catch (error) {
    broken = true
    console.warn('[유리펜] 셰이더 경로 실패 — 평범한 선으로 전환:', error?.message ?? error)
    return false
  } finally {
    maskImage?.dispose?.(); poolImage?.dispose?.(); mask?.dispose?.(); blur?.dispose?.(); out?.dispose?.()
  }
}
