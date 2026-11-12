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
import { BlendMode, ClipOp, PaintStyle, Skia, StrokeCap, StrokeJoin, TileMode } from '@shopify/react-native-skia'
import { ballSweepPath } from '../utils/nibStroke.js'
import { GLASS_INK, GLASS_INK_SKSL, GLASS_SPARK_SKSL, abLineOf, glassDabs, glitterColorOf, glitterTint, inkDensity, micaAutoFilm, micaColor, sheenAutoColor } from '../utils/glassInk.js'

let builder = null, sparkEffect = null, failed = false
// 쓰는 중인 획은 점이 하나 늘 때마다 **획 전체를 다시 그린다**. 그런데 색 · 굵기 · 잉크 · 배율은
// 획 내내 그대로라, 거기서만 나오는 것들(uniform 45개 · 입자 셰이더 · 블러 · 필터)을 프레임마다
// 새로 만들던 것이 느린 프레임의 큰 몫이었다(실측 2026-11-10: 입자 12~24ms, uniform 최대 18ms).
// 그래서 **같은 열쇠면 지난 것을 그대로 쓴다**. 열쇠는 그 넷을 전부 담으므로 다른 획에서는 반드시 다시 만든다.
const inkKey = (color, width, S, ink) =>
  `${color}|${width}|${S}|${ink.sheen}|${ink.sheenAmount}|${ink.glitter}|${ink.amount}|${ink.film}|${ink.glitterColor}|${ink.sheenColor}`
let uniKey = null, sparkKey = null, sparkCache = null, blurKey = -1, blurCache = null, filterKey = null, filterCache = null
let haloKey = -1, haloBlur = null
const hex3 = color => { const c = Skia.Color(color); return [c[0], c[1], c[2]] }

// 두께 마스크는 도장이 겹쳐야 매끈하다. 경로용(0.38)보다 촘촘하되, 긴 획에서는 수를 제한한다.
const MASK_SPACING = 0.18
const MASK_MAX_DABS = 3000
// 페이지 1단위가 화면 몇 px 인가. 눈대중으로 두면 입자 가장자리(aa)와 도장 여유(fringe)가
// 실제 픽셀보다 커져 그대로 뭉개진다 — 기기 배율 × 확대율로 정확히 구한다.
// 넘겨받는 zoom 이 **이미** 기기 배율 × 확대율이다(strokesPicture · previewPicture 를 부르는 쪽이 모두
// zoom * PixelRatio.get() 이나 그 굽는 배율을 넘긴다. 연필의 surfaceSize 도 같은 값을 그대로 쓴다).
// 여기서 PixelRatio 를 또 곱하면 S 가 기기 배율의 제곱이 되어 필터 1px 이 화면 0.5px(2배 기기)이 되고
// 굽는 픽셀이 네 배가 된다(MR !534 리뷰).
// 무늬를 페이지에 붙이는 밀어주기의 기본값(옛 획 · 원점을 모르는 호출)
const ORIGIN0 = { x: 0, y: 0 }
const smooth01 = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t) }
// 셰이더의 vnoise 와 같은 식(값 노이즈). 도장마다 한 번 — 획 하나에 많아야 MASK_MAX_DABS 번이다.
const vhash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s) }
function vnoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = vhash2(ix, iy), b = vhash2(ix + 1, iy), c = vhash2(ix, iy + 1), e = vhash2(ix + 1, iy + 1)
  const top = a + (b - a) * ux
  return top + (c + (e - c) * ux - top) * uy
}
const pxPerUnit = scale => Math.max(0.2, Math.max(0.05, scale))
// 필터 층은 진짜 가장자리보다 이만큼(화면 px) 넓게 그린 뒤 마지막에 깎는다 — 필터 쪽 네모난 끊김을
// 획 밖으로 밀어내기 위해서다. 그래서 **필터가 보는 획은 실제보다 2·margin 만큼 굵다**.
const MARGIN = 3

function setUniforms(color, width, ink, S, org) {
  const key = inkKey(color, width, S, ink)
  if (key === uniKey) return key   // 지난번과 같은 획 — builder 가 그 값을 아직 들고 있다
  uniKey = key
  const P = GLASS_INK
  const rgb = hex3(color)
  const sheenOn = ink.sheen !== false
  const sheenAmount = sheenOn ? (ink.sheenAmount ?? 1) : 0
  const glitterAmount = ink.glitter === false ? 0 : (ink.amount ?? 1)
  const film = ink.film ?? micaAutoFilm(rgb)
  const tilt = P.glFilmTilt * Math.PI / 180
  // 고른 색은 반사 색조로(그대로 쓰면 입자가 잉크보다 어두워 안 보인다 — 28판)
  const glit = ink.glitterColor ? glitterTint(hex3(ink.glitterColor)) : null
  const u = (name, ...v) => builder.setUniform(name, v)

  // 좌표계는 **화면 픽셀**이다(아래 drawGlassPooled 에서 캔버스를 1/S 로 줄이고 기하를 S 배로 그린다).
  // 그래서 길이 uniform 은 전부 S 를 곱한다 — 하네스가 S 를 곱해 넘기던 것과 같은 규칙이다.
  u('org', 0, 0); u('ppu', 1)
  u('aa', 0.5)   // 화면 0.5px
  u('ink', ...rgb); u('dens', ...inkDensity(rgb))
  u('satK', P.satK); u('satThin', P.satThin); u('tMax', P.T_MAX)
  u('rad', P.rimR * width * S)
  u('ringStart', P.ringStart); u('ringFull', P.ringFull)
  u('fIn', P.fIn); u('fRim', P.fRim); u('tGamma', P.tGamma); u('dyePool', P.dyePool); u('dyeRef', P.dyeRef); u('alphaK', P.alphaK)
  u('satStart', P.satStart); u('satMax', P.satMax)
  u('paperAmp', P.paperAmp); u('paperScl', P.paperScale * S)
  u('flowAmp', P.flowAmp); u('flowScl', P.flowScale * S); u('flowFloor', P.flowFloor); u('flowClear', P.flowClear)
  u('thinFlow', P.thinFlow); u('thinFlowScl', P.thinFlowScale)
  u('thinPatch', P.thinPatch); u('thinPatchScl', P.thinPatchScale)
  const sheenRgb = ink.sheenColor ? hex3(ink.sheenColor) : sheenAutoColor(rgb)
  u('sheenCol', ...sheenRgb)
  u('sheenAmp', P.sheenAmp * sheenAmount)
  u('sheenRimA', P.sheenRimA); u('sheenRimBand', P.sheenRimBand)
  u('sheenGate0', P.sheenGate0); u('sheenGate1', P.sheenGate1)
  u('sheenInT', P.sheenInT); u('sheenInAmp', P.sheenInAmp)
  // 가는 획 전용 테는 **펜 굵기**로 켠다(픽셀 굵기로 켜면 굵은 펜이 얇아진 자리가 회색으로 끊긴다)
  const thinRim = 1 - smooth01((width - P.thinRimW0) / (P.thinRimW1 - P.thinRimW0))
  u('sheenEdge', P.sheenEdge * sheenAmount * thinRim)
  u('sheenMax', P.sheenMax); u('sheenThinMax', P.sheenThinMax); u('sheenSharp', P.sheenSharp)
  u('sheenPatch', P.sheenPatch); u('sheenGrain', P.sheenGrain)
  // 굵기 기준은 **필터가 보는 굵기**여야 한다(실제 굵기로 재면 가는 획에서 An 이 1 에 붙어 버려
  // 획 가운데 ↔ 가장자리 구분이 사라진다 — 가는 획의 테가 통째로 밋밋해지던 원인, 2026-11-10).
  u('abLine', abLineOf(width + 2 * MARGIN / S)); u('poolMix', P.poolMix)
  u('sheenWiggle', P.sheenWiggle); u('sheenWScl', P.sheenWScale * S)
  u('micaA', ...(glit ?? micaColor(film, 1)))
  // 30b: 구름결(운모 막)은 **테 색**을 따른다 — 넓은 면에서 결과 테가 따로 놀지 않게(사용자 2026-11-12).
  //   테를 껐으면 쓰지 않는 색으로 결을 칠할 수 없으니 운모 간섭색으로 되돌린다.
  u('veilCol', ...(sheenOn ? sheenRgb : (glit ?? micaColor(film, 1))))
  u('micaB', ...(glit ?? micaColor(film, Math.cos(tilt * 0.5))))
  u('micaC', ...(glit ?? micaColor(film, Math.cos(tilt))))
  u('glVeil', P.glVeil); u('glVeilAvoid', P.glVeilAvoid); u('glVeilDesat', P.glVeilDesat)
  u('glVeilLift', P.glVeilLift); u('glVeilScl', P.glVeilScale * S)
  u('glVeilAlign', P.glVeilAlign); u('glVeilLong', P.glVeilLong); u('glVeilCross', P.glVeilCross)
  u('glAmp', 0)   // 입자는 필터 밖에서 전체 해상도로 그린다(drawSpark)
  // 운모 막(구름결)은 필터 안에 남는다 — 저주파라 필터 해상도로 충분하다.
  // 27판에서 glAmp 를 0 으로 두면서 막까지 같이 꺼져 있었다(글리터를 켜도 안 나왔다).
  // 46판: 막은 **잉크의 것**이다(43판에서 잉크의 공용 구름에 묶었다). 글리터 양을 따라가게 두면
  //   글리터를 켤 때 막이 한 겹 더 얹혀 두 겹이 된다(사용자 2026-11-13).
  u('veilAmp', 1)
  u('glCellPx', P.glCell * S); u('glP', P.glP)
  u('glRThin', P.glRThin * S); u('glThinP', P.glThinP)
  u('glRMin', P.glRMin * S); u('glRMax', P.glRMax * S)
  u('glBMin', P.glBMin); u('glBMax', P.glBMax)
  u('glTail', P.glTail); u('glDesat', P.glDesat)
  u('glCloud', P.glCloud); u('glCloudScl', P.glCloudScale * S)
  u('sparkAmp', P.sparkAmp)
  // 49판: 무늬를 **페이지**에 붙인다 — 화면 px 공간이므로 S 를 곱해 넘긴다
  u('noiseOrg', org.x * S, org.y * S)
  u('glintCellPx', P.glintCell * S); u('glintLenPx', P.glintLen * S)
  u('dry', P.dry); u('dryLag', P.dryLag)
  u('wetDark', P.wetDark); u('wetGloss', P.wetGloss)
  return key
}

// 그리기용 붓은 설정이 고정이라 **한 벌만 만들어 돌려 쓴다**(saveLayer · drawPath 는 호출 순간의
// 값을 복사해 가므로 같은 객체를 이어 써도 안전하다). 획마다 7개씩 새로 만들던 것을 없앤다.
let paints = null
const makePaints = () => {
  // 48판에서 겹친 획이 진해지도록 Multiply 로 바꿔 봤지만 **되돌렸다**(사용자 2026-11-13
  //   "겹칠 때 곱해지는 거 안 뺐어?"). 덧칠이 진해지는 대신 겹친 자리가 베이컨처럼 층져 보였고,
  //   획 하나를 타일 · 벡터로 나눠 그리는 구조에서는 경계가 한 줄만 어긋나도 그 줄이 곱으로
  //   진해져 눈에 띄었다. 수채처럼 섞으려면 획마다 끝낸 색을 겹칠 게 아니라 **밀도장을 합쳐야**
  //   한다(C안) — 블렌드만 바꿔서 될 일이 아니다.
  // Darken 은 같은 자리를 두 번 그려도 값이 그대로라(멱등) 타일 경계에도 너그럽다.
  const sheet = Skia.Paint(); sheet.setBlendMode(BlendMode.Darken)
  const body = Skia.Paint()
  const dab = Skia.Paint(); dab.setAntiAlias(true); dab.setBlendMode(BlendMode.Lighten)
  const dstIn = Skia.Paint(); dstIn.setBlendMode(BlendMode.DstIn)
  const cover = Skia.Paint(); cover.setAntiAlias(true)
  const grow = strokeStyle(Skia.Paint(), 2 * MARGIN)   // 실루엣을 margin 만큼 부풀리는 테두리
  const layer = Skia.Paint()
  // 29판: 입자를 깎는 고임 마스크. Lighten 이라 도장이 겹쳐도 알파가 쌓이지 않고 **최댓값**이 남는다
  const pool = Skia.Paint(); pool.setAntiAlias(true); pool.setBlendMode(BlendMode.Lighten)
  pool.setColor(Skia.Color('#FFFFFF'))
  // saveLayer 는 **Paint 를 반드시** 받는다 — null 을 넘기면 던지고, 한 번 던지면 그 뒤로는
  // 평범한 선으로 떨어진다(모듈 깃발이 남는다). 아무것도 바꾸지 않는 빈 붓을 둔다.
  const plain = Skia.Paint()
  // 32판: 획 밖으로 번진 고리. **Darken** 이라 흰 종이 위에서는 연하게 얹히고, 이미 진한 획 위에
  //   겹쳐도 그 획을 밝게 만들지 않는다(본체를 얹는 규칙과 같다).
  const halo = Skia.Paint(); halo.setAntiAlias(true); halo.setBlendMode(BlendMode.Darken)
  return { sheet, body, dab, dstIn, cover, grow, layer, pool, plain, halo }
}
let bodyColorKey = null, bodyColor = null
// 도장 하나마다 Float32Array 를 새로 만들면 긴 획에서 프레임당 수천 개가 쌓인다 — 한 개를 고쳐 쓴다
const dabColor = Float32Array.of(0, 0, 0, 1)

const strokeStyle = (paint, w) => {
  paint.setAntiAlias(true)
  paint.setStyle(PaintStyle.Stroke)
  paint.setStrokeWidth(Math.max(0.1, w))
  paint.setStrokeCap(StrokeCap.Round)
  paint.setStrokeJoin(StrokeJoin.Round)
  return paint
}

// 쓸기 외곽선(SVG 경로 문자열) → Skia 경로. 볼펜 · 붓펜이 쓰는 것과 같은 길이다.
const parse = d => d ? Skia.Path.MakeFromSVGString(d) : null

// 입자를 전체 해상도로 획 위에 덧그린다(필터 밖). 경로를 굵기대로 그으므로 획 밖으로 나가지 않는다.
// 셰이더는 **획 하나에 하나만** 만든다. 구간마다 만들면 makeShader 가 구간당 약 1ms 라
// 필압이 출렁여 구간이 20개가 되는 획에서 프레임의 25ms 를 입자가 먹었다(실측 2026-11-10).
// 셀 크기만 굵기를 따르는데, 필압으로 달라지는 폭은 무늬에 티가 안 나므로 획의 기준 굵기로 정한다.
function sparkPaint(width, color, ink, zoom, S, org) {
  const key = `${inkKey(color, width, S, ink)}|${org.x}|${org.y}`
  if (key === sparkKey) return sparkCache   // makeShader 가 1ms 넘게 드는데 획 내내 같은 값이다
  sparkKey = key
  const P = GLASS_INK
  const amount = ink.glitter === false ? 0 : (ink.amount ?? 1) * P.glAmp
  if (amount <= 0.001) return (sparkCache = null)
  sparkEffect ??= Skia.RuntimeEffect.Make(GLASS_SPARK_SKSL)
  if (!sparkEffect) return (sparkCache = null)
  // 반지름 바닥값: 그대로 두면 확대율이 낮을 때 입자가 화면 반 픽셀 아래로 내려가 사라진다
  const rmin = Math.max(P.glRMin, 0.6 / S) * S   // 화면 px 공간(캔버스를 S 로 키워 그린다)
  // 셀은 획보다 좁아야 한다 — 넓으면 셀 하나의 입자가 획 밖에 떨어져 가는 획만 입자가 사라진다(28판)
  const cell = Math.min(P.glCell, Math.max(P.glCellMin, width * P.glCellW))
  const paint = Skia.Paint()
  paint.setShader(sparkEffect.makeShader([...hex3(color), ...glitterColorOf(hex3(color), ink),
    cell * S, P.glP * amount,
    rmin, rmin * (P.glRMax / P.glRMin),
    P.glBMin, P.glBMax, P.glTail, P.glDesat,
    P.glCloud, P.glCloudScale * S, 0.5,
    P.glPatchLo, P.glPatchHi, P.glPatchA, P.glPatchB, P.glCloudScale * P.glPatchScale * S,
    org.x * S, org.y * S]))
  return (sparkCache = paint)
}

export function glassPooledFailed() { return failed }

export function drawGlassPooled(canvas, points, width, color, zoom = 1, ink = {}, org = ORIGIN0) {
  if (failed) return false
  const t0 = globalThis.__GLASS_PROFILE__ ? Date.now() : 0
  // 색이 없으면 Skia.Color 가 던진다("Value is undefined, expected a String"). 층을 쌓기 전에 거른다.
  if (typeof color !== 'string') return false
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
  const t1 = t0 ? Date.now() : 0    // 도장 찍기까지

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const d of dabs) { if (d.x < x0) x0 = d.x; if (d.y < y0) y0 = d.y; if (d.x > x1) x1 = d.x; if (d.y > y1) y1 = d.y }

  // 굵기가 변하는 획의 **실제 실루엣**을 한 번에 만든다.
  // 27판까지는 비슷한 굵기끼리 구간으로 묶어 구간마다 일정 굵기로 그었는데, 그러면 구간 경계마다
  // 외곽선이 계단으로 꺾여 필압이 줄어드는 자리가 구겨져 보였다(사용자 2026-11-10).
  // 볼펜이 필압 획에 쓰는 쓸기 외곽선(ballSweepPath)을 그대로 쓴다 — 같은 앱 안에서 같은 방식이다.
  // 외곽선은 두께 도장만큼 촘촘할 필요가 없다(그대로 다 쓰면 경로 만드는 데만 5~14ms — 실측).
  // 다만 **일정 간격으로 솎으면 꺾이는 자리가 각져 보인다**(사용자 2026-11-10) — 쓸기 외곽선은
  // 표본 사이를 직선으로 잇기 때문이다. 그래서 곧은 데서만 솎고, **방향이 틀어지거나 굵기가
  // 바뀌는 자리는 남긴다**(굽은 곳은 촘촘, 곧은 곳은 성기게).
  const S0 = pxPerUnit(zoom)
  const minGap = 0.45 * width, MAX_TURN = 0.12   // 라디안 약 7도
  const outline = [dabs[0]]
  let lastAngle = null
  for (let i = 1; i < dabs.length - 1; i++) {
    const prev = outline[outline.length - 1], d = dabs[i]
    const dx = d.x - prev.x, dy = d.y - prev.y, len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    const angle = Math.atan2(dy, dx)
    const turn = lastAngle == null ? 0 : Math.abs(Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle)))
    if (len >= minGap || turn > MAX_TURN || Math.abs(d.r - prev.r) > prev.r * 0.08) {
      outline.push(d); lastAngle = angle
    }
  }
  if (dabs.length > 1) outline.push(dabs[dabs.length - 1])
  const t2 = t0 ? Date.now() : 0    // 외곽선 솎기까지
  const sweep = ballSweepPath(outline.map(d => ({ x: d.x * S0, y: d.y * S0, pressure: 2 * d.r / width })), width * S0)
  const t3 = t0 ? Date.now() : 0    // 쓸기 외곽선 문자열까지
  const shape = parse(sweep)
  if (!shape) return false
  const tA = t0 ? Date.now() : 0    // ① 표본 · 외곽선까지

  // ② 고임이 만드는 것(커피링 · 테 · 농담 흐름)을 그 위에 얹는다.
  //
  // 좌표계를 **화면 픽셀**로 바꿔서 그린다. 런타임 셰이더 이미지 필터는 화면 픽셀 밀도를
  // 반영하지 않기 때문이다(react-native-skia 문서에 명시 — "RuntimeShader is not taking into
  // account the pixel density scaling", 권장 해법도 크게 그려 줄이기다).
  // 그대로 두면 필터가 논리 픽셀로 래스터화돼 가장자리와 무늬가 네모로 끊긴다(실측).
  // 캔버스를 1/S 로 줄이고 기하를 S 배로 그리면 필터의 1픽셀 = 화면 1픽셀이 된다.
  const S = S0
  const pad = (P.poolSpread * 3 + width) * S
  const bounds = Skia.XYWHRect(x0 * S - pad, y0 * S - pad, (x1 - x0) * S + pad * 2, (y1 - y0) * S + pad * 2)
  const key = setUniforms(color, width, ink, S, org)
  const tB = t0 ? Date.now() : 0    // ② uniform 넣기까지
  paints ??= makePaints()
  const layer = paints.layer
  const sigma = P.poolSpread * S
  // 블러와 필터는 둘 다 못 고치는 값이라 열쇠가 같으면 지난 것을 그대로 쓴다
  // (필터는 만들 때 builder 의 uniform 을 복사해 두므로, uniform 이 그대로면 같은 필터다)
  if (sigma !== blurKey) { blurKey = sigma; blurCache = Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal, null) }
  const fKey = `${key}|${sigma}`
  if (fKey !== filterKey) { filterKey = fKey; filterCache = Skia.ImageFilter.MakeRuntimeShaderWithChildren(builder, 0, ['mask', 'pool'], [null, blurCache]) }
  layer.setImageFilter(filterCache)
  const tC = t0 ? Date.now() : 0    // ③ 필터 만들기까지


  const margin = MARGIN   // 화면 px — 필터 쪽 가장자리를 진짜 가장자리 바깥으로 밀어낸다
  // 여기부터는 save · saveLayer 를 쌓는다. 도중에 하나라도 던지면 **캔버스가 그대로 남는다** —
  // 남은 층(Darken · DstIn)과 1/S 배율 위로 뒤 획들이 그려져 그림 전체가 네모로 망가진다
  // (지우개 · 되돌리기처럼 모든 획을 한 번에 다시 구울 때 '네모난 흰 선'으로 보였다, 2026-11-10).
  // 그래서 들어올 때의 깊이를 적어 두고, 실패하면 거기까지 되돌린 뒤 평범한 경로에 넘긴다.
  // save() 는 **되돌릴 깊이**를 돌려준다(이 바인딩에 getSaveCount 는 없다).
  const depth = canvas.save()
  try {
  canvas.scale(1 / S, 1 / S)
  // 획 하나를 통째로 **곱해서** 종이에 얹는다.
  //
  // 덮어쓰기(SrcOver)로 두면 위 획의 옅은 테(쉰)가 아래 획 위에 테두리로 떠서,
  // 글자가 아니라 겹쳐 놓은 획들로 읽힌다(사용자 2026-11-10: ㅠ · ㅍ 이 어색하다).
  // Multiply 는 그 테를 없애 주지만 겹칠수록 계속 곱해져 교차점이 새까매졌다(사용자: 어색).
  // 우리 모델은 이미 두께가 포화한다고 본다(satStart · satMax — 겹쳐도 끝없이 진해지지 않는다).
  // 그래서 **더 진한 쪽을 남기는** Darken 을 쓴다: 옅은 테는 아래 잉크에 먹혀 사라지고,
  // 같은 잉크끼리 겹친 자리는 더 진해지지 않아 이음새가 없다. 빈 종이 위에서는 그대로다.
  // 몸통 · 테 · 고임을 한 층에 모아 그린 뒤 그 층을 얹는다(따로 얹으면 테가 다시 떠오른다).
  canvas.saveLayer(paints.sheet, bounds)   // 바깥 층(필터 없음) — 이 층 전체가 종이에 곱해진다

  // ① 몸통을 벡터로 먼저 긋는다. 실루엣은 이 획이 정한다 — 형광펜 · 볼펜과 똑같이 또렷하다.
  const body = paints.body
  if (color !== bodyColorKey) { bodyColorKey = color; bodyColor = Skia.Color(color) }
  body.setColor(bodyColor)
  canvas.drawPath(shape, body)

  canvas.saveLayer(layer, bounds)

  // 두께: 도장을 Lighten(최댓값)으로. 안티에일리어스는 켠다 — 셰이더가 T = m.g / m.a 로 되돌려 읽으므로
  // 두께가 망가지지 않고, Lighten 은 같은 값끼리 제자리라 겹친 가장자리에 이음매도 안 생긴다.
  const dab = paints.dab
  for (const d of dabs) {
    const g = Math.min(1, d.t / P.T_MAX)
    dabColor[0] = dabColor[1] = dabColor[2] = g
    dab.setColor(dabColor)
    canvas.drawCircle(d.x * S, d.y * S, d.r * S + margin + 1, dab)
  }
  // 덮임(알파): 중심선을 굵기대로 그은 안티에일리어스 도형으로 곱한다
  canvas.saveLayer(paints.dstIn, bounds)
  // 같은 실루엣을 margin 만큼 부풀린다(채우기 + 테두리 긋기 = 바깥으로 margin 만큼 넓힌 모양)
  canvas.drawPath(shape, paints.cover)
  canvas.drawPath(shape, paints.grow)
  canvas.restore()
  canvas.restore()   // 필터 층 끝

  // 필터가 그린 것이 내가 그은 획 밖으로 넘치지 않게 깎는다(사용자 규칙).
  // **층 안에서 합친 뒤 한 번만** DstIn 한다. 구간마다 바로 DstIn 하면 구간이 겹치는 자리
  // (구간은 표본 하나씩 겹친다)에서 알파가 두 번 곱해져 안티에일리어스 가장자리가 패인다 —
  // 필압으로 굵기가 변할 때 테두리에 보이던 '픽셀'이 이것이다(사용자 2026-11-10).
  // [실험 2026-11-13] 사용자 요청: '획 밖으로 안 넘치게 딱 자르는' 리미트를 풀면 어떻게 되나.
  //   필터는 실루엣을 MARGIN 만큼 부풀린 자리까지 그려 두므로, 깎지 않으면 그만큼 번져 나온다.
  // canvas.saveLayer(paints.dstIn, bounds)
  // canvas.drawPath(shape, paints.cover)
  // canvas.restore()
  canvas.restore()   // 바깥 층 끝
  canvas.restore()   // 배율 되돌리기 — 입자는 **페이지 좌표**로 그려야 한다

  const tD = t0 ? Date.now() : 0    // ④ 본체 그리기(녹화)까지
  // 32판: 획 **밖**으로 번진 연한 고리(헤일로). 실루엣을 블러해 **바깥만** 남긴다 —
  //   염료 전선이 용매보다 뒤처져 바깥 고리에는 염료가 적다(= 연하다).
  //   고인 획에만 번진다: 빠르게 그은 가는 획은 번질 잉크가 없다.
  if (P.haloAlpha > 0.001) {
    let sum = 0
    for (const d of dabs) sum += d.t
    const pooled = smooth01((sum / dabs.length * abLineOf(width) - P.glPoolLo) / (P.glPoolHi - P.glPoolLo))
    const alpha = P.haloAlpha * pooled
    if (alpha > 0.004) {
      const sigma = P.haloSpread * S
      if (sigma !== haloKey) { haloKey = sigma; haloBlur = Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal, null) }
      const halo = paints.halo
      halo.setColor(bodyColor); halo.setAlphaf(alpha); halo.setImageFilter(haloBlur)
      canvas.save()
      canvas.scale(1 / S, 1 / S)
      canvas.clipPath(shape, ClipOp.Difference, true)   // 그은 획 안쪽은 본체가 맡는다
      canvas.drawPath(shape, halo)
      canvas.restore()
    }
  }
  // ③ 입자는 필터 밖에서 전체 해상도로. **페이지 좌표** 경로여야 한다
  //    (S 배 경로를 넘기면 화면 밖 먼 곳에 그려져 글리터가 통째로 사라진다)
  // 입자도 같은 실루엣 안에만. 외곽선이 화면 px 공간이라 캔버스를 S 로 키워 그리고
  // 셰이더의 길이 uniform 에도 S 를 곱해 뒀다(무늬 크기는 페이지에 붙어 있다).
  const spark = sparkPaint(width, color, ink, zoom, S, org)
  if (spark) {
    canvas.save()
    canvas.scale(1 / S, 1 / S)
    // 29판: 입자를 **고르게** 깔지 않는다. 실물(참고 01 · 03 · 04, 유리 딥펜)은 가는 선에 글리터가
    //   거의 없고 고인 덩어리는 통째로 금속색이 된다. 11판에 있던 '밀도 ∝ 고임 장' 이 27a 에서
    //   입자를 필터 밖으로 빼며 빠져 있었다(밖에서는 밀도가 상수다, 사용자 2026-11-12).
    //   고임 장은 필터 **안**의 값이라 여기로 들고 올 수 없고, 입자를 필터 안으로 되돌리면 획을
    //   종이에 얹는 Darken 이 잉크보다 밝은 입자를 먹어 **덧칠한 자리의 글리터가 사라진다**(확인함).
    //   그래서 고임을 **도장 두께로 만든 마스크**로 넘긴다. 블러를 한 번 더 돌리지 않으려고
    //   Tb0 를 `도장 두께 x abLine(굵기)` 로 근사한다 — 굵기 16 한 획 0.81(실측 0.8),
    //   칠 1.05, 웅덩이 1.9(2.0)로 맞는다. 가는 획은 abLine 이 작아 저절로 바닥값만 남는다.
    canvas.saveLayer(paints.plain, bounds)
    canvas.drawPath(shape, spark)
    canvas.saveLayer(paints.dstIn, bounds)
    const pool = paints.pool, wPool = abLineOf(width), span = P.glPoolHi - P.glPoolLo
    // 49판: 고임만으로 정하면 **같은 손놀림이 같은 무늬**를 낸다(발색 기록 속지의 병 여섯 개가
    //   똑같이 비었다 — 사용자 2026-11-13). 종이에 붙은 노이즈로 고임을 흔들어 자리마다 다르게
    //   한다. 노이즈는 **페이지 좌표**라 겹쳐 그어도 무늬가 맞고, 확대해도 그대로다.
    const vary = P.glPoolVary, varyScl = Math.max(1, P.glPoolVaryScale)
    for (const d of dabs) {
      const t = vary > 0 ? d.t * wPool * (1 + vary * (2 * vnoise2((d.x + org.x) / varyScl, (d.y + org.y) / varyScl) - 1)) : d.t * wPool
      pool.setAlphaf(P.glPoolFloor + (1 - P.glPoolFloor) * smooth01((t - P.glPoolLo) / span))
      canvas.drawCircle(d.x * S, d.y * S, d.r * S + 1, pool)
    }
    canvas.restore()
    canvas.restore()
    canvas.restore()
  }
  // 느린 프레임만 찍는다 — 매 프레임 console.log 는 그 자체로 다리를 막아 측정이 측정을 망친다
  if (t0 && Date.now() - t0 >= 6) console.log(`[유리펜] ms=${Date.now() - t0} (표본${tA - t0}[도장${t1 - t0} 솎기${t2 - t1} 쓸기${t3 - t2} 파싱${tA - t3}] uni${tB - tA} 필터${tC - tB} 본체${tD - tC} 입자${Date.now() - tD}) 도장=${dabs.length} 외곽선=${outline.length} 글자수=${sweep.length} 굵기=${width}`)
  return true
  } finally {
    // 성공이든 실패든 들어올 때 깊이로 되돌린다(배율 · 남은 층까지 한 번에)
    canvas.restoreToCount(depth)
  }
}
