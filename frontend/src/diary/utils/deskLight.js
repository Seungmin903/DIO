// 다이어리 홈 '햇살 책상'의 창빛, 24시간. 창은 하나이고 고정이다: 낮에도 밤에도 같은 마스크(window-light.png) 한 장만 쓰고,
// 시간에 따라 바뀌는 것은 빛의 방향 · 높이 · 색 · 세기뿐이다(코덱스 24시간 설계 cycle24).
// 광원은 해(06:30–19:30) → 잔광(패치 없이 하늘빛만, 19:30–20:30) → 밤(가로등 하나, 20:30–05:45) → 새벽 잔광(05:45–06:30) 순으로 넘어간다.
// 밤의 푸른 달빛 패치는 없앴다(사용자 요청): 밤에는 같은 마스크를 고정된 가로등이 따뜻하게 비추는 한 가지 빛뿐이라 창이 하나로 읽힌다(LAMP_PATCH).
// 해는 낮은 광원일수록 길게 늘어나고 기울어진 같은 2×2 창이 되고, 가장 높을 때 (1, 1, 0, 0)에 가깝다.
// patch = [x, y, scaleX, scaleY, skewX(도), rotate(도)]: x · y 는 창빛이 책상 가운데에 올 때(정점)를 0 으로 한 이동(책상 폭 · 높이에 대한 비율), 나머지는 그림 가운데 기준 변형이다.
// sun · moon 은 그 순간 어느 광원이 패치를 맡는지(0~1, 연출 층 · 표시용), screen · tint · accent 는 패치 세 층(흰 밝기 · 곱하기 색 · soft-light 색)의 [색, 불투명도]다.
// lamp 는 가로등 세기(최대 LAMP_PATCH.maxOpacity), ambient · wash · dim 은 책상 전체의 하늘빛 그늘 · 안개색 · 밤 어둠이다.
// afterglow 는 해 질 녘 · 새벽의 하늘 잔광 [색, 불투명도]: 책상 아래에서 위로 옅어지는 전체 화면 soft-light 그라데이션이라 커다란 색 판을 칠하지 않고도 노을의 공기가 남는다.
// 패치가 꺼지는 행(잔광)의 patch 는 앞뒤 광원의 모양을 이어 붙여, 보간해도 패치가 가로질러 쓸려 가지 않는다(그 구간은 불투명도가 0).

export const DESK_COLORS = {
  base: '#EAE6EE', // 상판 기본색(원목 + 라벤더 + 그늘의 평균). 그림이 뜨기 전 · 안전 영역에 쓴다
}

export const CYCLE = [
  { at: 0, key: 'lamp', patch: [-0.06, 0.009, 1.004, 1.05, 4.889, 3.111], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.345, ambient: ['#32313A', 0.548], wash: ['#504B51', 0.036], dim: 0.073, afterglow: ['#F5A982', 0] },
  { at: 1, key: 'lamp', patch: [0, 0, 1, 1, 0, 0], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.345, ambient: ['#33323A', 0.546], wash: ['#504C51', 0.036], dim: 0.073, afterglow: ['#F5A982', 0] },
  { at: 2, key: 'lamp', patch: [0.06, 0.009, 1.004, 1.05, -4.889, -3.111], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.345, ambient: ['#35333C', 0.538], wash: ['#544E53', 0.038], dim: 0.074, afterglow: ['#F5A982', 0] },
  { at: 3, key: 'lamp', patch: [0.12, 0.0351, 1.018, 1.192, -9.778, -6.222], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.343, ambient: ['#39363E', 0.528], wash: ['#5A5155', 0.042], dim: 0.075, afterglow: ['#F5A982', 0] },
  { at: 4, key: 'lamp', patch: [0.18, 0.075, 1.038, 1.41, -14.67, -9.333], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.337, ambient: ['#403C43', 0.514], wash: ['#62595C', 0.048], dim: 0.076, afterglow: ['#F5A982', 0] },
  { at: 5, key: 'lamp', patch: [0.24, 0.124, 1.062, 1.678, -19.56, -12.44], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.32, ambient: ['#4A454B', 0.494], wash: ['#6C6265', 0.056], dim: 0.077, afterglow: ['#F5A982', 0] },
  { at: 5.5, key: 'lamp', patch: [0.27, 0.15, 1.075, 1.82, -22, -14], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.28, ambient: ['#575158', 0.465], wash: ['#766B6E', 0.064], dim: 0.077, afterglow: ['#F5A982', 0] },
  { at: 6, key: 'afterglow', patch: [0.3, 0.176, 1.088, 1.962, -24.44, -15.56], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.14, ambient: ['#6C666C', 0.405], wash: ['#85797C', 0.074], dim: 0.071, afterglow: ['#F5A982', 0.042] },
  { at: 6.5, key: 'afterglow', patch: [-0.2699, 0.1497, 1.075, 1.819, 22, 14], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#FFC19B', 0], accent: ['#FFD7B1', 0], lamp: 0, ambient: ['#8490AA', 0.27], wash: ['#EBC8BC', 0.038], dim: 0.025, afterglow: ['#F7B18B', 0.035] },
  { at: 7, key: 'sun', patch: [-0.2492, 0.1319, 1.066, 1.721, 20.31, 12.92], sun: 0.741, moon: 0, screen: ['#FFFFFF', 0.4], tint: ['#FFC38F', 0.11], accent: ['#FFD6A3', 0.048], lamp: 0, ambient: ['#A1A8B9', 0.237], wash: ['#F5D4C6', 0.04], dim: 0.004, afterglow: ['#F7BA94', 0.016] },
  { at: 7.5, key: 'sun', patch: [-0.2285, 0.1141, 1.057, 1.624, 18.61, 11.85], sun: 1, moon: 0, screen: ['#FFFFFF', 0.54], tint: ['#FFC897', 0.12], accent: ['#FFD6A3', 0.055], lamp: 0, ambient: ['#BFC1C6', 0.163], wash: ['#F5D4C6', 0.045], dim: 0, afterglow: ['#F7BA94', 0] },
  { at: 8, key: 'sun', patch: [-0.2077, 0.0968, 1.048, 1.529, 16.92, 10.77], sun: 1, moon: 0, screen: ['#FFFFFF', 0.54], tint: ['#FFCD9E', 0.12], accent: ['#FFD6A3', 0.055], lamp: 0, ambient: ['#DEDAD3', 0.09], wash: ['#F5D4C6', 0.045], dim: 0, afterglow: ['#F7BA94', 0] },
  { at: 9, key: 'sun', patch: [-0.1662, 0.0648, 1.032, 1.354, 13.54, 8.615], sun: 1, moon: 0, screen: ['#FFFFFF', 0.54], tint: ['#FFD7AD', 0.12], accent: ['#FFF3D2', 0.055], lamp: 0, ambient: ['#E2DED6', 0.08], wash: ['#EDF3FF', 0.045], dim: 0, afterglow: ['#F7BA94', 0] },
  { at: 10, key: 'sun', patch: [-0.1246, 0.0377, 1.019, 1.206, 10.15, 6.462], sun: 1, moon: 0, screen: ['#FFFFFF', 0.54], tint: ['#FFE0BC', 0.12], accent: ['#FFF3D2', 0.018], lamp: 0, ambient: ['#E6E2D8', 0.07], wash: ['#EDF3FF', 0.045], dim: 0, afterglow: ['#F7BA94', 0] },
  { at: 11, key: 'sun', patch: [-0.0831, 0.0172, 1.009, 1.094, 6.769, 4.308], sun: 1, moon: 0, screen: ['#FFFFFF', 0.54], tint: ['#FFEACB', 0.12], accent: ['#FFF3D2', 0.018], lamp: 0, ambient: ['#EBE7DB', 0.06], wash: ['#EDF3FF', 0.045], dim: 0, afterglow: ['#F7BA94', 0] },
  { at: 12, key: 'sun', patch: [-0.0415, 0.0044, 1.002, 1.024, 3.385, 2.154], sun: 1, moon: 0, screen: ['#FFFFFF', 0.54], tint: ['#FFF4DA', 0.12], accent: ['#FFF3D2', 0.018], lamp: 0, ambient: ['#EFEBDE', 0.05], wash: ['#EDF3FF', 0.045], dim: 0, afterglow: ['#F7BA94', 0] },
  { at: 13, key: 'sun', patch: [0, 0, 1, 1, 0, 0], sun: 1, moon: 0, screen: ['#FFFFFF', 0.54], tint: ['#FFF4DA', 0.12], accent: ['#FFF3D2', 0.018], lamp: 0, ambient: ['#ECE6DA', 0.06], wash: ['#EDF3FF', 0.045], dim: 0, afterglow: ['#FF9A55', 0] },
  { at: 14, key: 'sun', patch: [0.0415, 0.0044, 1.002, 1.024, -3.385, -2.154], sun: 1, moon: 0, screen: ['#FFFFFF', 0.54], tint: ['#FFEACB', 0.12], accent: ['#FFF3D2', 0.018], lamp: 0, ambient: ['#E8E2D6', 0.07], wash: ['#EDF3FF', 0.045], dim: 0, afterglow: ['#FF9A55', 0] },
  { at: 15, key: 'sun', patch: [0.0831, 0.0172, 1.009, 1.094, -6.769, -4.308], sun: 1, moon: 0, screen: ['#FFFFFF', 0.54], tint: ['#FFE0BC', 0.12], accent: ['#FFF3D2', 0.018], lamp: 0, ambient: ['#E5DDD3', 0.08], wash: ['#EDF3FF', 0.045], dim: 0, afterglow: ['#FF9A55', 0] },
  { at: 16, key: 'sun', patch: [0.1246, 0.0377, 1.019, 1.206, -10.15, -6.462], sun: 1, moon: 0, screen: ['#FFFDF8', 0.54], tint: ['#EFD6B8', 0.12], accent: ['#F0D6AE', 0.048], lamp: 0, ambient: ['#D9CEC7', 0.095], wash: ['#E8D4C3', 0.04], dim: 0, afterglow: ['#D4AF90', 0] },
  { at: 16.5, key: 'sun', patch: [0.1454, 0.0513, 1.026, 1.28, -11.85, -7.54], sun: 1, moon: 0, screen: ['#FFFAF3', 0.545], tint: ['#EBCDB0', 0.132], accent: ['#EACDAA', 0.058], lamp: 0, ambient: ['#D2C5C0', 0.115], wash: ['#E4CCBB', 0.048], dim: 0, afterglow: ['#D1AB8C', 0.004] },
  { at: 17, key: 'sun', patch: [0.1662, 0.0648, 1.032, 1.354, -13.54, -8.615], sun: 1, moon: 0, screen: ['#FFF8F0', 0.55], tint: ['#E7C3A7', 0.145], accent: ['#E6C5A5', 0.068], lamp: 0, ambient: ['#CABDBA', 0.14], wash: ['#DEC2B2', 0.058], dim: 0, afterglow: ['#CCA588', 0.01] },
  { at: 17.5, key: 'sun', patch: [0.187, 0.0808, 1.04, 1.442, -15.23, -9.692], sun: 1, moon: 0, screen: ['#FFF6EF', 0.54], tint: ['#DFB7A5', 0.155], accent: ['#DFBBA4', 0.076], lamp: 0, ambient: ['#BFB2B1', 0.17], wash: ['#D5B5AA', 0.065], dim: 0, afterglow: ['#C99B87', 0.018] },
  { at: 18, key: 'sun', patch: [0.2077, 0.0968, 1.048, 1.529, -16.92, -10.77], sun: 1, moon: 0, screen: ['#FFF5F0', 0.505], tint: ['#D7AC9F', 0.15], accent: ['#D8B09F', 0.072], lamp: 0, ambient: ['#B2A4A5', 0.205], wash: ['#CBA79E', 0.07], dim: 0.004, afterglow: ['#BD9184', 0.03] },
  { at: 18.5, key: 'sun', patch: [0.2285, 0.1141, 1.057, 1.624, -18.61, -11.85], sun: 0.95, moon: 0, screen: ['#FAF4F0', 0.42], tint: ['#C49FA0', 0.12], accent: ['#C7A8A4', 0.058], lamp: 0, ambient: ['#988C92', 0.27], wash: ['#B99594', 0.072], dim: 0.012, afterglow: ['#AB827D', 0.042] },
  { at: 19, key: 'sun', patch: [0.2492, 0.1319, 1.066, 1.721, -20.31, -12.92], sun: 0.78, moon: 0, screen: ['#F5F1EF', 0.3], tint: ['#AA9295', 0.085], accent: ['#AD9B9C', 0.045], lamp: 0, ambient: ['#827881', 0.35], wash: ['#998486', 0.068], dim: 0.027, afterglow: ['#8E7474', 0.045] },
  { at: 19.25, key: 'afterglow', patch: [0.2596, 0.1408, 1.071, 1.77, -21.15, -13.46], sun: 0.52, moon: 0, screen: ['#F1EFF0', 0.21], tint: ['#93878D', 0.06], accent: ['#999398', 0.035], lamp: 0, ambient: ['#716D76', 0.405], wash: ['#817A80', 0.065], dim: 0.045, afterglow: ['#7E6E72', 0.038] },
  { at: 19.5, key: 'afterglow', patch: [0.2699, 0.1497, 1.075, 1.819, -22, -14], sun: 0.3, moon: 0, screen: ['#ECEDEE', 0.13], tint: ['#7D7D84', 0.032], accent: ['#858287', 0.02], lamp: 0, ambient: ['#605D66', 0.455], wash: ['#706C73', 0.06], dim: 0.065, afterglow: ['#71656A', 0.026] },
  { at: 19.75, key: 'afterglow', patch: [0.2803, 0.1586, 1.08, 1.868, -22.85, -14.54], sun: 0.12, moon: 0, screen: ['#E8E9E9', 0.055], tint: ['#696870', 0.014], accent: ['#737077', 0.01], lamp: 0, ambient: ['#504D55', 0.5], wash: ['#625E64', 0.057], dim: 0.085, afterglow: ['#675D62', 0.016] },
  { at: 20, key: 'afterglow', patch: [0.2906, 0.1675, 1.084, 1.916, -23.69, -15.08], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#000000', 0], accent: ['#000000', 0], lamp: 0, ambient: ['#47454C', 0.535], wash: ['#5C585E', 0.054], dim: 0.102, afterglow: ['#62595D', 0.008] },
  { at: 20.5, key: 'afterglow', patch: [-0.27, 0.1493, 1.075, 1.816, 22, 14], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#D8D2D4', 0], accent: ['#CFC7C8', 0], lamp: 0.29, ambient: ['#474348', 0.485], wash: ['#655D60', 0.06], dim: 0.079, afterglow: ['#62595D', 0] },
  { at: 21, key: 'lamp', patch: [-0.24, 0.124, 1.062, 1.678, 19.56, 12.44], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.32, ambient: ['#403C43', 0.505], wash: ['#60585C', 0.052], dim: 0.077, afterglow: ['#756B70', 0] },
  { at: 21.5, key: 'lamp', patch: [-0.21, 0.0987, 1.049, 1.54, 17.11, 10.89], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.335, ambient: ['#3B3840', 0.52], wash: ['#5B5458', 0.046], dim: 0.075, afterglow: ['#705AA1', 0] },
  { at: 22, key: 'lamp', patch: [-0.18, 0.075, 1.038, 1.41, 14.67, 9.333], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.345, ambient: ['#38363D', 0.532], wash: ['#575157', 0.042], dim: 0.074, afterglow: ['#705AA1', 0] },
  { at: 23, key: 'lamp', patch: [-0.12, 0.0351, 1.018, 1.192, 9.778, 6.222], sun: 0, moon: 0, screen: ['#FFFFFF', 0], tint: ['#BFD9FF', 0], accent: ['#8BB9F2', 0], lamp: 0.345, ambient: ['#35343B', 0.542], wash: ['#534E53', 0.038], dim: 0.073, afterglow: ['#705AA1', 0] },
]

// 가로등: 같은 마스크를 고정 변환으로 쓴다(해 변환과 같은 규칙의 오른쪽 저고도 쪽, 시간에 따라 움직이지 않는다). 호박색, 세기는 행의 lamp(최대 maxOpacity, 코덱스 가로등 단독 밤).
export const LAMP_PATCH = { patch: [0.18, 0.067, 1.025, 1.14, -6.6, -4.6], color: '#FFD98B', maxOpacity: 0.345 }

const mix = (a, b, t) => a + (b - a) * t

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function mixHex(from, to, t) {
  const channel = value => Math.round(value).toString(16).padStart(2, '0')
  const [r1, g1, b1] = hexToRgb(from)
  const [r2, g2, b2] = hexToRgb(to)
  return `#${channel(mix(r1, r2, t))}${channel(mix(g1, g2, t))}${channel(mix(b1, b2, t))}`
}

const PHASES = [
  [5, '밤'],
  [7, '이른 아침'],
  [10, '아침'],
  [14, '한낮'],
  [17, '오후'],
  [19.5, '해 질 녘'],
  [21.5, '저녁'],
  [24, '밤'],
]

/** 시각(소수 허용) → 0 ≤ h < 24 로 접는다. 범위를 벗어난 값은 24 로 나눈 나머지로 본다. */
export function normalizeHour(hours) {
  const value = Number(hours)
  return ((Number.isFinite(value) ? value : 0) % 24 + 24) % 24
}

const pair = (a, b, t) => [mixHex(a[0], b[0], t), mix(a[1], b[1], t)]

/**
 * 시각 → 그 순간의 창빛 설정. 행 사이를 선형으로 보간한다(마지막 행 → 0 시 행으로 이어져 24 시 경계에서도 끊기지 않는다).
 * 돌려주는 값: hour, phase, key(그 순간의 주 광원 'sun' | 'moon' | 'afterglow'; 달은 쓰지 않아 밤은 'afterglow'), patch {x, y, scaleX, scaleY, skewX, rotate},
 * sun · moon(0~1), screen · tint · accent {color, opacity}, lamp(0~1: 가로등 세기 / 0.22), lampOpacity, ambient · wash {color, opacity}, dim.
 */
export function deskLightAt(hours) {
  const h = normalizeHour(hours)
  const next = CYCLE.findIndex(row => row.at > h)
  const from = CYCLE[next < 0 ? CYCLE.length - 1 : Math.max(0, next - 1)]
  const to = next < 0 ? { ...CYCLE[0], at: 24 } : CYCLE[next]
  const t = (h - from.at) / (to.at - from.at)
  const patch = from.patch.map((value, index) => mix(value, to.patch[index], t))
  const [x, y, scaleX, scaleY, skewX, rotate] = patch
  const sun = mix(from.sun, to.sun, t), moon = mix(from.moon, to.moon, t)
  const [screenColor, screenOpacity] = pair(from.screen, to.screen, t)
  const [tintColor, tintOpacity] = pair(from.tint, to.tint, t)
  const [accentColor, accentOpacity] = pair(from.accent, to.accent, t)
  const [ambientColor, ambientOpacity] = pair(from.ambient, to.ambient, t)
  const [washColor, washOpacity] = pair(from.wash, to.wash, t)
  const lampOpacity = mix(from.lamp, to.lamp, t)
  const [afterglowColor, afterglowOpacity] = pair(from.afterglow, to.afterglow, t)
  return {
    hour: h, phase: deskPhaseAt(h),
    key: sun > 0.05 && sun >= moon ? 'sun' : moon > 0.05 ? 'moon' : 'afterglow',
    patch: { x, y, scaleX, scaleY, skewX, rotate },
    sun, moon,
    screen: { color: screenColor, opacity: screenOpacity },
    tint: { color: tintColor, opacity: tintOpacity },
    accent: { color: accentColor, opacity: accentOpacity },
    lamp: lampOpacity / LAMP_PATCH.maxOpacity, lampOpacity,
    ambient: { color: ambientColor, opacity: ambientOpacity },
    wash: { color: washColor, opacity: washOpacity },
    dim: mix(from.dim, to.dim, t),
    afterglow: { color: afterglowColor, opacity: afterglowOpacity }, // 잔광: 책상 아래쪽에서 올라오는 세로 그라데이션(soft-light, 창 마스크가 아니다)
  }
}

/** 슬라이더 이름표용 시간대 이름 */
export function deskPhaseAt(hours) {
  const h = normalizeHour(hours)
  return PHASES.find(([until]) => h < until)[1]
}

/** 시각 → '오전 8:30' */
export function deskClockLabel(hours) {
  const h = normalizeHour(hours)
  const hour = Math.floor(h)
  const minute = Math.floor((h - hour) * 60)
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(minute).padStart(2, '0')}`
}
