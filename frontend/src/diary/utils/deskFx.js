// 창빛에 얹는 연출. 빛이 유리를 지나며 꺾여 조각 가장자리가 파랑 · 주황으로 아주 얇게 갈라지고(번짐), 조각 안쪽에 옅은 무지개 띠와 빛 속 먼지가 비친다.
// 값은 코덱스가 작가들의 햇빛 연출(번짐광 · 빛 속 먼지 · 따뜻한 빛 + 시원한 그늘)을 조사해 설계했다.
// 해가 낮을수록(아침 · 저녁) 강하고 정오에 약하며, 밤에는 없다. strength 는 번짐 두 겹의 세기, rainbow · mote 는 무지개 띠 · 먼지의 불투명도,
// dx · dy 는 빛 방향에 따라 이 연출 층들이 밀리는 정도(창빛 폭 기준).

const FX_FRAMES = [
  { at: 6.5, warm: '#FF8072', cool: '#7CCEFF', strength: 0.24, rainbow: 0.25, mote: 0.3, dx: -0.038, dy: 0.01 },
  { at: 8, warm: '#FFAA73', cool: '#85E3FF', strength: 0.11, rainbow: 0.14, mote: 0.18, dx: -0.018, dy: 0 },
  { at: 12, warm: '#FFD09A', cool: '#B5EEFF', strength: 0.035, rainbow: 0.025, mote: 0.08, dx: 0, dy: -0.01 },
  { at: 15.5, warm: '#E5A48C', cool: '#B8C9C8', strength: 0.12, rainbow: 0.13, mote: 0.2, dx: 0.018, dy: 0 },
  { at: 17.5, warm: '#D89B8C', cool: '#AEBFBE', strength: 0.24, rainbow: 0.25, mote: 0.34, dx: 0.035, dy: 0.012 },
]
const NUMBERS = ['strength', 'rainbow', 'mote', 'dx', 'dy']
const FADE = { from: 5.8, fadeIn: 0.7, to: 19.3, fadeOut: 0.9 } // 이 시각 밖에서는 연출이 전혀 없다

const clamp01 = value => Math.max(0, Math.min(1, value))
const mix = (a, b, t) => a + (b - a) * t
const rgb = hex => { const value = parseInt(hex.slice(1), 16); return [(value >> 16) & 255, (value >> 8) & 255, value & 255] }
function mixHex(from, to, t) {
  const [r1, g1, b1] = rgb(from)
  const [r2, g2, b2] = rgb(to)
  const channel = value => Math.round(value).toString(16).padStart(2, '0')
  return `#${channel(mix(r1, r2, t))}${channel(mix(g1, g2, t))}${channel(mix(b1, b2, t))}`
}

/** 시각(0 ≤ h < 24) → 연출 설정. visible(0~1)이 0 이면 아무것도 그리지 않는다. */
export function deskFxAt(h) {
  const visible = clamp01((h - FADE.from) / FADE.fadeIn) * clamp01((FADE.to - h) / FADE.fadeOut)
  const next = FX_FRAMES.findIndex(frame => frame.at > h)
  const from = FX_FRAMES[next < 0 ? FX_FRAMES.length - 1 : Math.max(0, next - 1)]
  const to = FX_FRAMES[next < 0 ? FX_FRAMES.length - 1 : Math.max(0, next)]
  const t = to.at === from.at ? 0 : (h - from.at) / (to.at - from.at)
  const out = { visible, warm: mixHex(from.warm, to.warm, t), cool: mixHex(from.cool, to.cool, t) }
  for (const key of NUMBERS) out[key] = mix(from[key], to[key], t)
  // 광학적 흔적은 주광보다 훨씬 약하게(코덱스 최종 균형): 번짐 · 무지개 0.2, 먼지 0.24 를 넘지 않는다.
  out.strength = Math.min(out.strength, 0.2)
  out.rainbow = Math.min(out.rainbow, 0.2)
  out.mote = Math.min(out.mote, 0.24)
  return out
}
