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
import { Skia } from '@shopify/react-native-skia'
import { GLASS_INK, GLASS_LIVE_SKSL, GLASS_RIM_SKSL, glassBand, glassDabs, glassPool, inkDensity, micaColor, sheenAutoColor } from '../utils/glassInk.js'
import { strokeOutline } from '../utils/strokes.js'

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

function bodyPaint(color, ink, P) {
  bodyEffect ??= Skia.RuntimeEffect.Make(GLASS_LIVE_SKSL)
  if (!bodyEffect) throw new Error('RuntimeEffect.Make(body) 실패')
  const amount = ink.glitter === false ? 0 : (ink.amount ?? 1) * P.glAmp
  const mica = micaColor(ink.film ?? P.glFilm, 1)
  const r = Math.max(0.3, P.glRThin * 4)
  const paint = Skia.Paint()
  paint.setAntiAlias(true)
  paint.setShader(bodyEffect.makeShader([...hex3(color), ...mica, r * 0.7, amount,
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

// 점 목록 → 외곽선 경로. pressure 에 (그 자리 굵기 / 기준 굵기)를 넣어 가변 굵기를 만든다.
const outlinePath = (pts, width) => {
  const d = strokeOutline(pts, width, { start: true, end: true })
  return d ? Skia.Path.MakeFromSVGString(d) : null
}

// 획 하나를 그린다. 쓰는 중과 손을 뗀 뒤가 같은 함수를 쓴다(그림이 같다).
export function drawGlassStroke(canvas, points, width, color, _zoom = 1, ink = {}) {
  if (broken || !points?.length) return false
  const P = GLASS_INK
  try {
    const dabs = glassDabs(points, width)
    if (dabs.length < 2) return false
    const { pool } = glassPool(dabs, width)
    const sheenEdge = ink.sheen === false ? 0 : P.sheenEdge * (ink.sheenAmount ?? 1)
    const outer = [], inner = []
    for (let i = 0; i < dabs.length; i++) {
      const one = dabs[i], w = 2 * one.r
      const band = sheenEdge > 0 ? glassBand(pool[i], w, sheenEdge) : 0
      outer.push({ x: one.x, y: one.y, pressure: w / width })
      inner.push({ x: one.x, y: one.y, pressure: Math.max(0.04, (w - 2 * band) / width) })
    }
    const body = outlinePath(inner, width)
    if (!body) return false
    if (sheenEdge > 0) {
      const rim = outlinePath(outer, width)
      if (rim) canvas.drawPath(rim, rimPaint(color, ink, P))
    }
    canvas.drawPath(body, bodyPaint(color, ink, P))
    return true
  } catch (error) {
    broken = true
    console.warn('[유리펜] 경로 그리기 실패 — 평범한 선으로 전환:', error?.message ?? error)
    return false
  }
}
