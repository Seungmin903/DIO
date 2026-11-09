// 유리펜(글라스 딥펜) 획 그리기 — **오프스크린 표면을 쓰지 않는 경로 방식**.
//
// 왜 이렇게 바꿨나(2026-11-09 실기 SM-X510):
//   마스크 → 가우시안 블러 고임 장 → 셰이더 한 번 구조는 PC 하네스에서는 잘 되지만,
//   그 구조가 요구하는 `Surface.MakeOffscreen` 이 이 기기에서 librnskia 를 죽인다
//   (SIGTRAP · SIGSEGV, 연필도 같은 이유로 shader 엔진을 꺼 두었다).
//   표면 크기 · 배율 고정 · 표면 재사용 · dispose 조정으로 다섯 번 우회했지만 전부 증상만 옮겼다.
//
// 그래서 고임 계산을 **CPU 로** 옮기고, GPU 는 경로만 그린다.
//   ① CPU: 표본마다 이웃이 얼마나 겹쳤는지 센다(glassPool) — 블러가 하던 일과 같다.
//   ② 그 고임으로 **테 띠의 폭**을 정한다. 고임이 없으면 폭 0 이라 테가 안 보인다
//      (기하가 경계까지의 거리를 들고 있게 하는 방식 — 블러 패스를 없애는 표준 수법).
//   ③ 경로 두 겹: 바깥(획 전체)에 테 페인트, 안쪽(띠만큼 줄인 것)에 몸통 페인트.
//      둘 다 페이지 좌표 절차적 셰이더라 확대해도 무늬가 그대로고, 쓰는 중 · 뗀 뒤가 같은 그림이다.
//
// 잃은 것: 픽셀 단위 고임 장(겹쳐 칠한 웅덩이 안쪽의 등고선 테 · 커피링 그라데이션).
//   고임은 띠 폭으로만 들어간다. 되살리려면 saveLayer + Plus 경로를 따로 확인해야 한다.
import { PaintStyle, Skia, StrokeCap, StrokeJoin } from '@shopify/react-native-skia'
import { GLASS_INK, GLASS_LIVE_SKSL, GLASS_RIM_SKSL, glassBand, glassDabs, glassPool, inkDensity, micaColor, sheenAutoColor } from '../utils/glassInk.js'

let bodyEffect = null, rimEffect = null, broken = false
export const glassBroken = () => broken
export function endGlassLive() {}           // 표면을 안 쓰므로 치울 것이 없다

const hex3 = color => { const c = Skia.Color(color); return [c[0], c[1], c[2]] }
// 베르-람베르트: 진하기 f 에서의 종이 위 색(염료는 알파 혼합이 아니라 투과)
const inkAt = (rgb, f) => inkDensity(rgb).map(d => Math.pow(Math.exp(-d * f), 1 / 2.2))
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

// 테 색 = 커피링(진해진 잉크) 위에 쉰 색을 얹은 것. 쉰을 끄면 커피링만 남는다.
function rimColor(rgb, ink, P) {
  const ring = inkAt(rgb, P.fRim)
  if (ink.sheen === false) return ring
  const sheen = ink.sheenColor ? hex3(ink.sheenColor) : sheenAutoColor(rgb)
  return mix3(ring, sheen, 0.62 * (ink.sheenAmount ?? 1))
}

function bodyPaint(color, ink, P, width = 2.5) {
  bodyEffect ??= Skia.RuntimeEffect.Make(GLASS_LIVE_SKSL)
  if (!bodyEffect) throw new Error('RuntimeEffect.Make(body) 실패')
  const amount = ink.glitter === false ? 0 : (ink.amount ?? 1) * P.glAmp
  const mica = micaColor(ink.film ?? P.glFilm, 1)
  // 입자 크기: 현미경 레퍼런스(참고 25 · 28 · 29)는 획 폭의 1~4%. 다만 그대로 두면 화면에서
  // 반 픽셀도 안 돼 사라지므로 바닥값을 둔다. 바닥값을 낮출수록 더 고운 가루가 된다.
  const r = Math.max(P.glRMinLive, width * 0.025)
  const paint = Skia.Paint()
  paint.setAntiAlias(true)
  paint.setShader(bodyEffect.makeShader([...hex3(color), ...mica, r * 0.6, amount,
    P.glCell, P.glP * P.glThinP, r, r * 1.6, P.glBMin, P.glBMax, P.glTail, P.glDesat,
    P.glCloud, P.glCloudScale, P.glVeil, P.glVeilDesat, P.glVeilLift, P.glVeilScale]))
  return paint
}
function rimPaint(color, ink, P) {
  rimEffect ??= Skia.RuntimeEffect.Make(GLASS_RIM_SKSL)
  if (!rimEffect) throw new Error('RuntimeEffect.Make(rim) 실패')
  const paint = Skia.Paint()
  paint.setAntiAlias(true)
  paint.setShader(rimEffect.makeShader([...rimColor(hex3(color), ink, P), P.sheenPatch, P.sheenGrain, P.sheenWScale]))
  return paint
}

// 표본 목록 → 중심선 경로. 외곽선 다각형을 직접 만들면 꺾이는 곳에서 자기 교차가 생겨
// 획이 직선으로 뚝뚝 끊겨 보인다 → 중심선을 Skia 가 굵기대로 긋게 둔다(이음새 · 끝 처리도 맡긴다).
function centerPath(samples, from, to) {
  const pb = Skia.PathBuilder.Make()
  pb.moveTo(samples[from].x, samples[from].y)
  for (let i = from + 1; i <= to; i++) pb.lineTo(samples[i].x, samples[i].y)
  if (to === from) pb.lineTo(samples[from].x + 0.01, samples[from].y)
  return pb.build()
}
const strokeStyle = (paint, w) => {
  paint.setStyle(PaintStyle.Stroke); paint.setStrokeWidth(Math.max(0.1, w))
  paint.setStrokeCap(StrokeCap.Round); paint.setStrokeJoin(StrokeJoin.Round)
  return paint
}
// 획을 따라가는 1차원 값 노이즈 — 테가 구간마다 떴다 안 떴다 하게(고르게 두르면 마커 윤곽선처럼 보인다)
const hash1 = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x) }
function patch1(d, scale) {
  const t = d / scale, i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f)
  return hash1(i) * (1 - u) + hash1(i + 1) * u
}

// 획 하나를 그린다. 쓰는 중과 손을 뗀 뒤가 같은 함수를 쓴다(그림이 같다).
export function drawGlassStroke(canvas, points, width, color, _zoom = 1, ink = {}) {
  if (broken || !points?.length) return false
  const P = GLASS_INK
  try {
    // 표본 수 상한: 아주 긴 획(되돌아오는 스크리블)은 길이가 수만 px 이라 간격을 그대로 두면
    // 표본이 수만 개가 되고 고임 계산이 프레임을 먹는다(실측 260ms). 길이에 맞춰 간격을 벌린다.
    let len = 0
    for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    const base = Math.max(0.25, width * P.pathSpacing)
    const step = Math.max(base, len / P.pathMaxSamples)
    const dabs = glassDabs(points, width, { ...P, spacing: step / width })
    if (dabs.length < 2) return false
    const { pool } = glassPool(dabs, width, P.poolSpread, step)
    const sheenEdge = ink.sheen === false ? 0 : P.sheenEdge * (ink.sheenAmount ?? 1)
    const body = bodyPaint(color, ink, P, width)
    // 테: 획 전체를 굵기대로 한 번 깔고, 그 위에 몸통을 띠만큼 좁게 덮는다.
    if (sheenEdge > 0) {
      canvas.drawPath(centerPath(dabs, 0, dabs.length - 1), strokeStyle(rimPaint(color, ink, P), 2 * dabs[0].r))
    }
    // 띠 폭은 자리마다 다르므로(고인 곳이 넓다) 몇 단계로 묶어 구간별로 긋는다.
    // 몸통 색은 같으므로 구간끼리 맞닿아도 이음새가 보이지 않는다.
    const LEVELS = 5
    let maxBand = 0, d = 0, from = 0, level = -1
    const bands = new Float32Array(dabs.length)
    for (let i = 0; i < dabs.length; i++) {
      if (i) d += Math.hypot(dabs[i].x - dabs[i - 1].x, dabs[i].y - dabs[i - 1].y)
      const w = 2 * dabs[i].r
      const wobble = 0.25 + 0.75 * patch1(d, P.sheenWScale * 1.6)   // 구간마다 떴다 안 떴다
      bands[i] = sheenEdge > 0 ? glassBand(pool[i], w, sheenEdge) * wobble : 0
      maxBand = Math.max(maxBand, bands[i])
    }
    const widthAt = lv => 2 * dabs[0].r - 2 * (lv / (LEVELS - 1)) * maxBand
    if (maxBand <= 0.001) { canvas.drawPath(centerPath(dabs, 0, dabs.length - 1), strokeStyle(body, 2 * dabs[0].r)); return true }
    for (let i = 0; i < dabs.length; i++) {
      const lv = Math.min(LEVELS - 1, Math.round(bands[i] / maxBand * (LEVELS - 1)))
      if (lv !== level) {
        if (level >= 0) canvas.drawPath(centerPath(dabs, from, i), strokeStyle(body, widthAt(level)))
        from = Math.max(0, i - 1); level = lv
      }
    }
    canvas.drawPath(centerPath(dabs, from, dabs.length - 1), strokeStyle(body, widthAt(level)))
    return true
  } catch (error) {
    broken = true
    console.warn('[유리펜] 경로 그리기 실패 — 평범한 선으로 전환:', error?.message ?? error)
    return false
  }
}
