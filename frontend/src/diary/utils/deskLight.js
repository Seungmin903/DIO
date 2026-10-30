// 다이어리 홈 '햇살 책상'의 창빛. 창 모양(크기 · 각도)과 상판은 고정이고, 하루 동안 빛이 놓이는 자리 · 세기 · 색과 소품 그림자 방향만 끊기지 않고 이어서 바뀐다.
// 키프레임 사이를 선형 보간한다. 밤에는 같은 십자 창으로 달빛이 든다.
// x · y 는 책상 폭 · 높이에 대한 창빛 그림 왼쪽 위 자리. 나무 그림자는 창빛과 한 장의 틀 안에 있어 항상 같이 움직인다.
// dim 은 상판을 남색으로 덮는 정도(밤).
// shadow 는 소품이 한 칸(lift 1) 떠 있을 때 그림자가 밀리는 dp [x, y], shadowOpacity 는 그림자 세기.

export const DESK_COLORS = {
  base: '#EAE6EE', // 상판 기본색(원목 + 라벤더 + 그늘의 평균). 그림이 뜨기 전 · 안전 영역에 쓴다
}

export const DESK_KEYFRAMES = [
  // 밤: 오른쪽 위 창으로 드는 옅은 푸른 달빛. 그림자는 왼쪽 아래로 옅게
  { at: 0, color: '#E4EBFF', opacity: 0.42, x: 0.36, y: -0.03, dim: 0.12, shadow: [-3, 4], shadowOpacity: 0.12 },
  { at: 5, color: '#E4EBFF', opacity: 0.42, x: 0.36, y: -0.03, dim: 0.11, shadow: [-3, 4], shadowOpacity: 0.12 },
  // 새벽 · 아침: 8시와 같은 자리(창빛이 놓이는 모양이 같다). 세기와 색만 달라진다. 그림자는 왼쪽으로
  { at: 6.5, color: '#EEF3FF', opacity: 0.6, x: 0.36, y: -0.03, dim: 0.03, shadow: [-6, 3], shadowOpacity: 0.18 },
  { at: 8, color: '#F8FAFF', opacity: 0.92, x: 0.36, y: -0.03, dim: 0, shadow: [-7, 5], shadowOpacity: 0.2 },
  // 한낮: 가운데로 옮겨 오고, 그림자는 짧게 아래로
  { at: 10, color: '#FFFFFF', opacity: 0.97, x: 0.28, y: -0.045, dim: 0, shadow: [-4, 5], shadowOpacity: 0.21 },
  { at: 12, color: '#FFFFFF', opacity: 1, x: 0.2, y: -0.06, dim: 0, shadow: [0, 5], shadowOpacity: 0.22 },
  // 오후: 왼쪽(서쪽)으로 옮겨 가 버터빛이 조금 돈다, 그림자는 오른쪽 아래로
  { at: 15, color: '#FFF9EC', opacity: 0.94, x: 0.06, y: 0.0, dim: 0, shadow: [7, 8], shadowOpacity: 0.28 },
  // 해 질 녘: 낮게 깔리는 옅은 살구빛, 그림자는 길게 옆으로
  { at: 17.5, color: '#FFEBDD', opacity: 0.8, x: -0.07, y: 0.08, dim: 0, shadow: [13, 6], shadowOpacity: 0.3 },
  { at: 19, color: '#F7DFE0', opacity: 0.55, x: -0.12, y: 0.1, dim: 0.05, shadow: [14, 5], shadowOpacity: 0.2 },
  // 저녁: 빛이 사라지지 않고 같은 창에서 색만 푸른 달빛으로 바뀌며 천천히 위쪽 오른쪽으로 옮겨 간다
  { at: 20, color: '#E9E5F3', opacity: 0.46, x: -0.04, y: 0.07, dim: 0.09, shadow: [8, 5], shadowOpacity: 0.15 },
  { at: 21.5, color: '#E4EBFF', opacity: 0.42, x: 0.2, y: 0.02, dim: 0.11, shadow: [-1, 4], shadowOpacity: 0.12 },
  { at: 23, color: '#E4EBFF', opacity: 0.42, x: 0.34, y: -0.03, dim: 0.12, shadow: [-3, 4], shadowOpacity: 0.12 },
  { at: 24, color: '#E4EBFF', opacity: 0.42, x: 0.36, y: -0.03, dim: 0.12, shadow: [-3, 4], shadowOpacity: 0.12 },
]

const NUMBER_KEYS = ['opacity', 'x', 'y', 'dim', 'shadowOpacity']
const PHASES = [
  [5, '밤'],
  [7, '이른 아침'],
  [10, '아침'],
  [14, '한낮'],
  [17, '오후'],
  [19, '해 질 녘'],
  [21.5, '저녁'],
  [24, '밤'],
]

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

const mix = (a, b, t) => a + (b - a) * t

/** 시각(소수 허용) → 0 ≤ h < 24 로 접는다. 범위를 벗어난 값은 24 로 나눈 나머지로 본다. */
export function normalizeHour(hours) {
  const value = Number(hours)
  return ((Number.isFinite(value) ? value : 0) % 24 + 24) % 24
}

/** 시각 → 그 순간의 창빛 설정. 숫자는 보간하고 색은 RGB 로 보간한다(color 는 '#RRGGBB' 로 돌려준다). */
export function deskLightAt(hours) {
  const h = normalizeHour(hours)
  let index = DESK_KEYFRAMES.findIndex(frame => frame.at > h) - 1
  if (index < 0) index = DESK_KEYFRAMES.length - 2
  const from = DESK_KEYFRAMES[index]
  const to = DESK_KEYFRAMES[index + 1]
  const t = (h - from.at) / (to.at - from.at)
  const out = { hour: h, phase: deskPhaseAt(h) }
  for (const key of NUMBER_KEYS) out[key] = mix(from[key], to[key], t)
  const [r1, g1, b1] = hexToRgb(from.color)
  const [r2, g2, b2] = hexToRgb(to.color)
  const channel = value => Math.round(value).toString(16).padStart(2, '0')
  out.color = `#${channel(mix(r1, r2, t))}${channel(mix(g1, g2, t))}${channel(mix(b1, b2, t))}`
  out.shadow = [mix(from.shadow[0], to.shadow[0], t), mix(from.shadow[1], to.shadow[1], t)]
  return out
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
