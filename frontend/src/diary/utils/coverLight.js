// 다이어리 표지가 책상의 빛을 받는 방식(코덱스 표지 조명 설계): 표지는 책상에 누워 있어 같은 창빛 · 가로등 · 하늘빛에 반응해야 한다.
// 표지 본체 안에만(둥근 모서리로 잘라) 얇은 수광 층을 얹는다: 흰 밝기(screen) + 시간대 색(soft-light) + 그늘 쪽 차가운 곱하기(multiply).
// 글자 · 고무줄 · 스티커 · 버튼에는 얹지 않는다(UI 는 빛을 받지 않는 화면 층). 표지가 빛 조각 안에 있는지는 아직 재지 않고 시간대별로 균일하게 준다(direct = 1).
// 합친 밝기는 0.115, 어두워짐은 0.045 를 넘지 않는다.
import { deskLightAt } from './deskLight.js'

const RECEIVER = [
  { at: 0, key: 'lamp', screen: ['#FFF1D6', 0.055], tint: ['#FFD98B', 0.038], shade: ['#9FB7DC', 0.015], paper: ['#FFF3DC', 0.018], edge: 0.014 },
  { at: 6.5, key: 'afterglow', screen: ['#FFE9DC', 0.03], tint: ['#F7B18B', 0.034], shade: ['#C8D8EC', 0.02], paper: ['#FFE7CB', 0.025], edge: 0.016 },
  { at: 8, key: 'sun', screen: ['#FFF7EE', 0.08], tint: ['#FFCD9E', 0.052], shade: ['#C8D8EC', 0.018], paper: ['#FFF0DD', 0.022], edge: 0.032 },
  { at: 10, key: 'sun', screen: ['#FFF9F1', 0.07], tint: ['#FFE0BC', 0.042], shade: ['#D7E2F0', 0.014], paper: ['#FFF7E9', 0.015], edge: 0.023 },
  { at: 12, key: 'sun', screen: ['#FFFDF6', 0.06], tint: ['#FFF4DA', 0.03], shade: ['#DCE9FF', 0.01], paper: ['#FFF7E9', 0.015], edge: 0 },
  { at: 15, key: 'sun', screen: ['#FFF9F1', 0.07], tint: ['#FFE0BC', 0.042], shade: ['#D7E2F0', 0.014], paper: ['#FFF7E9', 0.015], edge: 0.023 },
  { at: 17.5, key: 'sun', screen: ['#FFF5EC', 0.082], tint: ['#E8B093', 0.056], shade: ['#D3BEC0', 0.018], paper: ['#FDE9DD', 0.028], edge: 0.034 },
  { at: 18.5, key: 'sun', screen: ['#FFF2EE', 0.072], tint: ['#D4A0A0', 0.052], shade: ['#C4B6B9', 0.023], paper: ['#F8E6E1', 0.03], edge: 0.03 },
  { at: 19, key: 'sun', screen: ['#F8F0EF', 0.052], tint: ['#B7969C', 0.042], shade: ['#AAA9B5', 0.032], paper: ['#F0E4E2', 0.027], edge: 0.023 },
  { at: 20, key: 'afterglow', screen: ['#F2F0EE', 0.018], tint: ['#A59A98', 0.012], shade: ['#9DA6B1', 0.04], paper: ['#F0EDEA', 0.018], edge: 0 },
  { at: 21, key: 'lamp', screen: ['#FFF1D6', 0.06], tint: ['#FFD98B', 0.045], shade: ['#9FB7DC', 0.018], paper: ['#FFF3DC', 0.02], edge: 0.018 },
  { at: 23, key: 'lamp', screen: ['#FFF1D6', 0.062], tint: ['#FFD98B', 0.046], shade: ['#9FB7DC', 0.02], paper: ['#FFF3DC', 0.02], edge: 0.018 },
]
const GLOSS_BY_HOUR = [{ at: 0, value: 0.02 }, { at: 6.5, value: 0.025 }, { at: 8, value: 0.08 }, { at: 10, value: 0.05 }, { at: 12, value: 0.025 }, { at: 15, value: 0.05 }, { at: 17.5, value: 0.064 }, { at: 18.5, value: 0.048 }, { at: 19, value: 0.028 }, { at: 20, value: 0 }, { at: 21, value: 0.018 }, { at: 23, value: 0.02 }, { at: 24, value: 0.02 }]

// 표지는 책상 빛을 이 비율만큼만 받는다(사용자 요청: 반 정도). 그늘 쪽 가는 선(farEdge)은 접지 단서라 줄이지 않는다.
const LIGHT_SHARE = 0.5

const mix = (a, b, t) => a + (b - a) * t
const hexRgb = hex => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255] }
const mixHex = (a, b, t) => { const [r1, g1, b1] = hexRgb(a), [r2, g2, b2] = hexRgb(b); const c = v => Math.round(v).toString(16).padStart(2, '0'); return `#${c(mix(r1, r2, t))}${c(mix(g1, g2, t))}${c(mix(b1, b2, t))}` }
const pair = (a, b, t) => [mixHex(a[0], b[0], t), mix(a[1], b[1], t)]

function rowAt(h) {
  const t24 = h
  const next = RECEIVER.findIndex(row => row.at > t24)
  const from = RECEIVER[next < 0 ? RECEIVER.length - 1 : Math.max(0, next - 1)]
  const to = next < 0 ? { ...RECEIVER[0], at: 24 } : RECEIVER[next]
  const t = to.at === from.at ? 0 : (t24 - from.at) / (to.at - from.at)
  return { screen: pair(from.screen, to.screen, t), tint: pair(from.tint, to.tint, t), shade: pair(from.shade, to.shade, t), paper: pair(from.paper, to.paper, t), edge: mix(from.edge, to.edge, t) }
}

function glossAt(h) {
  const next = GLOSS_BY_HOUR.findIndex(row => row.at > h)
  const from = GLOSS_BY_HOUR[next < 0 ? GLOSS_BY_HOUR.length - 1 : Math.max(0, next - 1)]
  const to = next < 0 ? { at: 24, value: GLOSS_BY_HOUR[0].value } : GLOSS_BY_HOUR[next]
  return to.at === from.at ? to.value : mix(from.value, to.value, (h - from.at) / (to.at - from.at))
}

/**
 * 시각 → 표지 수광 설정. night 이면 가로등이 키(왼쪽 위 쪽이 아니라 그림자 방향 반대), 낮에는 해가 키다.
 * keySide: 빛이 오는 쪽의 표지 가장자리('left' | 'right' | null). 아침 · 가로등은 왼쪽, 오후 · 저녁은 오른쪽, 정오 · 잔광은 없다.
 */
export function coverLightAt(hours) {
  const light = deskLightAt(hours)
  const h = light.hour
  const row = rowAt(h)
  const sunny = light.sun > 0.2
  const lamp = light.lampOpacity > 0.05
  const keySide = h >= 11.5 && h <= 13.5 ? null : lamp && !sunny ? 'left' : sunny ? (h < 12.5 ? 'left' : 'right') : null
  const direct = sunny ? 1 : lamp ? Math.min(1, light.lamp) : Math.min(1, light.afterglow.opacity / 0.05)
  const screenOpacity = row.screen[1] * (0.7 + 0.3 * direct)
  const tintOpacity = row.tint[1] * (0.62 + 0.38 * direct)
  const lift = Math.min(1, 0.115 / Math.max(0.001, screenOpacity + tintOpacity * 0.5)) // 합친 밝기 상한
  return {
    hour: h, keySide, direct,
    screen: { color: row.screen[0], opacity: screenOpacity * lift * LIGHT_SHARE },
    tint: { color: row.tint[0], opacity: tintOpacity * lift * LIGHT_SHARE },
    shade: { color: row.shade[0], opacity: Math.min(0.045, row.shade[1] * (1 - direct * 0.6)) * LIGHT_SHARE },
    paper: { color: row.paper[0], opacity: Math.min(0.032, row.paper[1]) * LIGHT_SHARE },
    edge: keySide ? row.edge * LIGHT_SHARE : 0,
    farEdge: keySide ? (lamp && !sunny ? 0.12 : light.afterglow.opacity > 0.03 ? 0.1 : 0.075) : 0,
    gloss: glossAt(h) * LIGHT_SHARE,
    glossLamp: lamp && !sunny,
    glossPhase: h < 11.5 ? 'morning' : h < 13.5 ? 'noon' : 'evening',
  }
}
