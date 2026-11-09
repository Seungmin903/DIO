// 2단계 탐침 — 픽셀 단위 고임(웅덩이 안쪽 등고선 테 · 커피링)을 되살릴 수 있는지 확인한다.
//
// 26판에서 포기한 것은 "마스크를 그려 블러한 뒤 셰이더가 그 값을 읽는" 구조였다.
// 그 구조를 `Surface.MakeOffscreen` 으로 만들면 이 기기(SM-X510)에서 librnskia 가 죽는다.
// 그런데 같은 일을 Skia 가 스스로 관리하는 층으로도 할 수 있다:
//     canvas.saveLayer(blur + RuntimeShader 이미지 필터) → 층 안에 도장 → restore
// 이 경로는 우리가 표면을 만들지 않는다. 그래서 죽는 원인과 무관할 수 있다 — 확인이 필요하다.
//
// 죽으면 try/catch 로 못 잡으므로(네이티브 크래시), **단계마다 시작 로그를 먼저 찍는다**.
// 마지막 로그가 N단계 시작이면 N단계에서 죽은 것이다. 획 하나에 한 단계씩만 올라간다.
import { BlendMode, Skia, TileMode } from '@shopify/react-native-skia'

// 5단계용: 자식 둘(선명한 마스크 · 블러된 고임)을 같은 층에서 뽑아 읽는다 — 하네스 구조 그대로.
// 고임이 클수록 붉게 칠해 눈으로도 장이 맞는지 본다.
const PAIR_SKSL = `
uniform shader mask;
uniform shader pool;
half4 main(float2 p) {
  half a = mask.eval(p).a;
  half q = pool.eval(p).a;
  if (a < 0.01) return half4(0.0);
  return half4(q * 1.6, 0.25 - q, 0.0, 1.0) * a;
}`

const PROBE_SKSL = `
uniform shader src;
half4 main(float2 p) {
  half4 c = src.eval(p);
  return half4(c.a * 0.9, c.a * 0.2, 0.0, c.a);   // 고임값을 붉게 — 눈으로도 보이게
}`

const STAGES = [
  'saveLayer(평범한 페인트)',
  'saveLayer + 안쪽 Plus 합성',
  'saveLayer(가우시안 블러 이미지 필터)',
  'saveLayer(블러 → RuntimeShader 이미지 필터) — 고임 장 그대로',
  'saveLayer(자식 둘: 선명한 마스크 + 블러된 고임) — 하네스 구조 그대로',
]

let stage = 0, done = false, builder = null, pairBuilder = null, last = 0

export function glassProbeDone() { return done }

export function glassProbe(canvas, x, y) {
  if (done) return
  // 한 프레임에 여러 번(완료 층이 획마다) 불리므로 단계가 한꺼번에 올라가지 않게 시간으로 막는다.
  // 로그가 Metro 로 빠져나갈 틈도 준다 — 죽으면 마지막 줄이 범인이다.
  const now = Date.now()
  if (now - last < 1500) return
  last = now
  const n = stage++
  if (n >= STAGES.length) { done = true; console.log(`[유리펜 탐침] 전 단계 통과 — 픽셀 단위 고임 복원 가능`); return }
  console.log(`[유리펜 탐침] ${n + 1}단계 시작: ${STAGES[n]}`)
  const bounds = Skia.XYWHRect(x - 50, y - 50, 100, 100)
  const layer = Skia.Paint()
  const dab = Skia.Paint()
  dab.setAntiAlias(true)
  dab.setColor(Skia.Color('#6688ff'))
  if (n >= 1) dab.setBlendMode(BlendMode.Plus)
  if (n === 2) layer.setImageFilter(Skia.ImageFilter.MakeBlur(6, 6, TileMode.Decal, null))
  if (n === 3) {
    const effect = Skia.RuntimeEffect.Make(PROBE_SKSL)
    if (!effect) { console.log('[유리펜 탐침] 4단계 실패: RuntimeEffect.Make 가 null'); done = true; return }
    builder ??= Skia.RuntimeShaderBuilder(effect)
    const blur = Skia.ImageFilter.MakeBlur(6, 6, TileMode.Decal, null)
    layer.setImageFilter(Skia.ImageFilter.MakeRuntimeShader(builder, 'src', blur))
  }
  if (n === 4) {
    const effect = Skia.RuntimeEffect.Make(PAIR_SKSL)
    if (!effect) { console.log('[유리펜 탐침] 5단계 실패: RuntimeEffect.Make 가 null'); done = true; return }
    pairBuilder ??= Skia.RuntimeShaderBuilder(effect)
    const blur = Skia.ImageFilter.MakeBlur(7, 7, TileMode.Decal, null)
    // null = 층 원본(선명한 마스크), blur = 같은 층을 블러한 것(고임 장)
    layer.setImageFilter(Skia.ImageFilter.MakeRuntimeShaderWithChildren(pairBuilder, 0, ['mask', 'pool'], [null, blur]))
  }
  canvas.saveLayer(layer, bounds)
  for (let i = 0; i < 3; i++) canvas.drawCircle(x - 14 + i * 14, y, 16, dab)
  canvas.restore()
  console.log(`[유리펜 탐침] ${n + 1}단계 통과: ${STAGES[n]}`)
}
