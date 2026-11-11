// 유리펜 SVG 그림 — 미리보기 · 웹 · 썸네일 · 내보내기가 쓴다.
//
// 캔버스(네이티브)는 Skia 셰이더로 고임 장까지 계산하지만, SVG 로는 같은 그림을 못 그린다.
// 그래서 **눈에 남는 세 가지**만 도형으로 옮긴다. 캔버스와 같은 상수 · 같은 색 계산식을 쓰므로
// 색은 어긋나지 않는다.
//   ① 몸통: 베르-람베르트로 구한 종이 위 잉크색
//   ② 테: 같은 경로를 테 색으로 굵게 깔고 그 위를 몸통으로 좁게 덮는다(띠 폭이 테가 된다)
//   ③ 글리터: 경로를 따라 결정적으로 흩뿌린 작은 점
import { useMemo } from 'react'
import { G, Circle, Path } from 'react-native-svg'
import { GLASS_INK, glitterColorOf, inkDensity, sampleCurve, sheenAutoColor } from '../../utils/glassInk.js'

const to255 = v => Math.round(Math.min(1, Math.max(0, v)) * 255)
const css = rgb => `rgb(${to255(rgb[0])}, ${to255(rgb[1])}, ${to255(rgb[2])})`
const hex3 = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
// 진하기 f 에서의 종이 위 색(염료는 알파 혼합이 아니라 투과 — 캔버스와 같은 식)
const inkAt = (rgb, f) => inkDensity(rgb).map(d => Math.pow(Math.exp(-d * f), 1 / 2.2))
// 결정적 난수: 같은 획은 언제 그려도 같은 자리에 반짝인다
const rand = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

export default function GlassStrokeContent({ d, points, width, color, ink = {} }) {
  const P = GLASS_INK
  const rgb = hex3(color)
  const body = css(inkAt(rgb, 1))
  const sheenAmount = ink.sheen === false ? 0 : (ink.sheenAmount ?? 1)
  const rim = css(mix3(inkAt(rgb, P.fRim), ink.sheenColor ? hex3(ink.sheenColor) : sheenAutoColor(rgb), 0.62 * sheenAmount))
  // 띠 폭: 캔버스의 가는 획 띠와 같은 비율
  const band = sheenAmount > 0 ? Math.min(width * 0.2, width * 0.17 * Math.min(1, P.sheenEdge * sheenAmount) + width * 0.06) : 0
  const stroke = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }

  const amount = ink.glitter === false ? 0 : (ink.amount ?? 1)
  // StrokeContent 가 ink 를 렌더마다 새 객체로 넘기므로 값으로 묶는다
  const dots = useMemo(() => glitterDots(points, width, rgb, band, amount, ink.glitterColor, ink.film),
    [points, width, color, band, amount, ink.glitterColor, ink.film])   // eslint-disable-line react-hooks/exhaustive-deps
  return <G>
    {band > 0 && <Path d={d} stroke={rim} strokeWidth={width} {...stroke} />}
    <Path d={d} stroke={body} strokeWidth={Math.max(0.1, width - 2 * band)} {...stroke} />
    {dots}
  </G>
}

// 획 하나의 글리터 점 상한. 점마다 SVG 노드라 상한이 없으면 긴 획 하나에 수백~수천 개가 되어
// (폭 4 · 길이 3000 이면 약 900개, 폭 1 이면 약 2000개) 웹 렌더 · 썸네일 · 내보내기가 느려진다(MR !534 리뷰).
// 넘으면 점을 줄이지 않고 **간격을 넓혀** 획 전체에 고르게 흩는다.
const MAX_GLITTER_DOTS = 240
const polyLength = points => { let n = 0; for (let i = 1; i < points.length; i++) n += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y); return n }

function glitterDots(points, width, rgb, band, amount, glitterColor, film) {
  const dots = []
  if (amount > 0 && points.length > 1) {
    const share = Math.min(1, amount * 0.55)
    const step = Math.max(0.8, width * 0.45, polyLength(points) * share / MAX_GLITTER_DOTS)
    const line = sampleCurve(points, step)
    const r0 = Math.max(0.28, width * 0.03)
    const glitter = css(glitterColorOf(rgb, { glitterColor, film }))
    for (let i = 1; i < line.length; i++) {
      const u = rand(i * 1.7)
      if (u > share) continue
      const a = line[i - 1], b = line[i]
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len
      const off = (rand(i * 3.1) - 0.5) * (width - 2 * r0 - 2 * band)
      const r = r0 * (0.7 + 0.9 * rand(i * 5.3))
      dots.push(<Circle key={i} cx={b.x + nx * off} cy={b.y + ny * off} r={r} fill={glitter} opacity={0.45 + 0.5 * rand(i * 7.9)} />)
    }
  }
  return dots
}
