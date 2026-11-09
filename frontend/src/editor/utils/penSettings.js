// 격자와 펜이 함께 사용하는 MVP1 색상 체계.
// 앱 테마 파랑 계열 6색은 빼고, 기본 펜 색(검정)을 맨 앞에 둔다. 형광펜과 같은 7색이라 옵션 창에서 한 줄로 보인다.
// 기본 프리셋 색(코덱스 2026-10-31): DIO 성격(차분 · 따뜻)에 맞춘 한 세트 — 채도 · 명도를 맞춰 따뜻 · 차가움 · 무채를 고르게, 패널 한 줄에 들어가는 7색. 펜 · 글자는 흰 바탕 4.5:1 이상
export const EDITOR_COLORS = ['#18224D', '#A33C4B', '#917019', '#397A5B', '#34769F', '#7653A6', '#626878']
import { DASH_TYPES } from './dashedStroke.js'
export const PEN_TYPES = [
  // 2026-11-02: 만년필 · 펠트펜 · 붓펜이 불투명도 100 단색에서 거의 같아 볼펜(굵기 고정) · 캘리펜(평촉) · 붓펜(테이퍼)으로 바꿨다(코덱스).
  // 예전 식별자(fountain · felt · brush)는 고를 수 없을 뿐 이미 그린 획은 그대로 그린다. 새 붓펜은 식별자가 다르다.
  { id: 'ball', label: '볼펜' }, { id: 'calligraphy', label: '캘리펜' },
  { id: 'taperBrush', label: '붓펜' }, { id: 'pencil', label: '연필' },
  // 2026-11-09: 유리펜(글라스 딥펜) — 염료 투과 · 커피링 · 테(쉰) · 운모 글리터. 설계는 `유리펜 설계/` 참고
  { id: 'glass', label: '유리펜' },
  { id: 'dashed', label: '점선' },
]
export const DEFAULT_PEN_SETTINGS = { kind: 'ball', color: '#18224D', width: 2.5 }
// 유리펜 잉크: 글리터 · 테를 따로 켜고 끈다. 글리터 색은 색상환이 아니라 **운모 코팅 두께(nm)** 하나로 정한다 —
// 실제 펄 안료가 그렇다(운모판 + TiO2 코팅의 박막 간섭). 계산한 색 순서가 안료 업계 두께표와 일치한다.
export const GLASS_FILMS = [
  { id: 55, label: '은' }, { id: 72, label: '금' }, { id: 88, label: '구리' },
  { id: 103, label: '분홍' }, { id: 125, label: '파랑' }, { id: 145, label: '초록' },
]
// 테 색: 비워 두면 펜 색에서 물리식(프레넬)으로 자동 계산한다. 고르면 그 색으로 덮어쓴다
export const GLASS_SHEENS = [
  { id: '#C9A227', label: '금' }, { id: '#B06A3B', label: '구리' }, { id: '#3E8E6E', label: '초록' },
  { id: '#B5447E', label: '자주' }, { id: '#4A6FB5', label: '파랑' },
]
export const DEFAULT_GLASS_INK = { inkGlitter: true, inkSheen: true, inkFilm: 55, inkAmount: 1, inkSheenColor: null, inkSheenAmount: 1 }
// 종류를 고를 때 들어가는 기본 불투명도(사용자 2026-11-03: 연필은 기본을 반투명으로, 슬라이더는 100 까지 그대로 —
// 참고 필기 앱(Notability · 애플 노트) 연필은 순검정이 없고 겹칠수록 진해진다). 없는 종류는 1.
export const PEN_DEFAULT_OPACITY = { pencil: 0.8 }
export const penDefaultOpacity = kind => PEN_DEFAULT_OPACITY[kind] ?? 1
// 펜 종류마다 마지막으로 쓴 굵기 · 불투명도를 기억한다(사용자 2026-11-03: 다른 펜을 오가도 설정이 그대로여야 한다).
// 처음 쓰는 종류는 지금 굵기를 이어 받고 불투명도만 그 종류의 기본값이다.
export const rememberPen = (memory, settings) => ({ ...memory, [settings.kind]: { width: settings.width, opacity: settings.opacity ?? penDefaultOpacity(settings.kind) } })
export const applyPenKind = (memory, settings, kind) => ({ ...settings, kind, width: memory?.[kind]?.width ?? settings.width, opacity: memory?.[kind]?.opacity ?? penDefaultOpacity(kind) })
// 형광펜: 0.42 로 겹쳐 칠해도 · 속지 종이 색으로 깔아도 뽀얀 톤
export const HIGHLIGHTER_COLORS = ['#F7DF8A', '#F6C79B', '#F2B4AE', '#D8C5EF', '#C6D0F0', '#BDE4D1', '#E5DDD2']
export const DEFAULT_HIGHLIGHTER_SETTINGS = { kind: 'highlighter', color: '#F7DF8A', width: 18, lineCap: 'square' }
export const HIGHLIGHTER_OPACITY = 0.42
export function normalizeHex(value) {
  const hex = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(hex)) return '#' + hex.split('').map((c) => c + c).join('').toUpperCase()
  return /^[0-9a-f]{6}$/i.test(hex) ? '#' + hex.toUpperCase() : null
}
// 저장된 설정값 검사: 범위를 벗어나거나 손상된 항목만 기본값으로 되돌린다(펜 설정 막대와 같은 범위)
const validColor = (value, fallback) => typeof value === 'string' ? normalizeHex(value) ?? fallback : fallback
const inRange = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
export function sanitizePenSettings(saved) {
  if (!saved || typeof saved !== 'object') return undefined
  const kind = [...PEN_TYPES, ...DASH_TYPES].some(type => type.id === saved.kind) ? saved.kind : DEFAULT_PEN_SETTINGS.kind
  return { kind, color: validColor(saved.color, DEFAULT_PEN_SETTINGS.color), width: inRange(saved.width, 1, 16, DEFAULT_PEN_SETTINGS.width), opacity: inRange(saved.opacity, 0.1, 1, penDefaultOpacity(kind)),
    ...(kind === 'glass' && sanitizeGlassInk(saved)) }
}
export function sanitizePenKinds(saved) {
  if (!saved || typeof saved !== 'object') return undefined
  const result = {}
  for (const type of [...PEN_TYPES, ...DASH_TYPES]) {
    const item = saved[type.id]
    if (item && typeof item === 'object') result[type.id] = { width: inRange(item.width, 1, 16, DEFAULT_PEN_SETTINGS.width), opacity: inRange(item.opacity, 0.1, 1, penDefaultOpacity(type.id)) }
  }
  return result
}
export function sanitizeHighlighterSettings(saved) {
  if (!saved || typeof saved !== 'object') return undefined
  return { kind: 'highlighter', color: validColor(saved.color, DEFAULT_HIGHLIGHTER_SETTINGS.color), width: inRange(saved.width, 8, 40, DEFAULT_HIGHLIGHTER_SETTINGS.width), lineCap: saved.lineCap === 'round' ? 'round' : 'square' }
}
// 볼펜 · 캘리펜 · 붓펜(사용자 2026-11-03: 필압 · 기울기 적용): 힘 → 굵기 곡선 [바닥, 기울기, 하한, 상한]. 볼펜은 은은하게, 붓펜은 크게. 평소 힘 0.22 에서 1 안팎
// 사용자 2026-11-03: 볼펜 · 캘리펜 · 붓펜 필압 체감이 약하다(힘 0.04 → 0.65 에서 굵기가 볼펜 .9 → 1.25 배, 붓펜은 렌더 상한에 걸려 ±16%)
// → 코덱스 곡선: 배율 = clamp(lo, hi, base + slope · (힘 / 0.22)^지수). 힘 0.22(평소) 에서 슬라이더 굵기가 거의 그대로(1.03 · 1.05 · .84×몸통 1.25 = 1.05)
// [base, slope, 지수, lo, hi]. 붓펜 몸통은 렌더에서 1.25 배가 더해져 힘 0.65 에서 약 2.2D(상한 BRUSH_BODY_CAP 2.4)
const SENSED_WIDTH = { ball: [0.65, 0.38, 0.75, 0.72, 1.52], calligraphy: [0.52, 0.53, 0.85, 0.6, 1.72], taperBrush: [0.27, 0.57, 0.9, 0.38, 1.8] }
// 눕혀 쓸 때 넓어지는 정도. 연필은 점의 기울기 값으로 도장에서 따로 계산한다
// (코덱스는 힘 곡선이 넓어졌다며 T 를 .05 · .10 · .06 으로 낮추자고 했으나, 기울기 체감을 올리는 게 목표라 기존 값을 유지했다 — 내 판단)
const TILT_WIDTH = { ball: 0.12, calligraphy: 0.25, taperBrush: 0.35 }
// 기울기(도) → 0~1: 25° 이하 0, 55° 이상 1(코덱스. 예전엔 40°→55° 라 평소 30° 근처에서 반응이 없었다)
export const tiltAmount = event => Number.isFinite(event?.tiltX) && Number.isFinite(event?.tiltY) ? Math.max(0, Math.min(1, (Math.min(90, Math.hypot(event.tiltX, event.tiltY)) - 25) / 30)) : 0
// pressure는 센서 원값이 아니라 저장·렌더링용 굵기 배율이다.
export function penPressure(kind, speed = 0, force = null, tilt = 0) {
  const sensed = Number.isFinite(force) && force >= 0 && force <= 1
  const curve = SENSED_WIDTH[kind]
  if (curve && sensed) return Math.max(curve[3], Math.min(curve[4], curve[0] + curve[1] * (force / 0.22) ** curve[2])) * (1 + TILT_WIDTH[kind] * tilt)
  if (kind === 'fountain') return sensed ? 0.85 + 0.25 * Math.sqrt(force) : 0.94 + 0.12 / (1 + Math.max(0, speed))
  if (kind === 'brush') return sensed ? 0.18 + 1.22 * Math.sqrt(force) : 0.85 + 0.3 / (1 + Math.max(0, speed) * 0.7)
  if (kind === 'felt' && sensed) return 0.88 + 0.12 * Math.sqrt(force)
  // 붓펜(코덱스 3판): 필압 대신 화면 속도(px/ms)로 살짝 가늘게. 머리 · 삐침 모양은 그릴 때 거리로 곱한다(nibStroke)
  if (kind === 'taperBrush') return Math.max(0.78, Math.min(1.06, 1.06 - 0.035 * Math.max(0, speed))) * (1 + TILT_WIDTH.taperBrush * tilt)
  // 연필(사용자: 필압이 약하면 얇고 흐리게, 세면 굵고 진하게). S펜 실측 force: 대는 순간 0.02~0.05, 가볍게 0.1~0.15, 평소 0.2~0.25, 세게 0.4~0.65.
  // 예전 곡선은 0.34 에서 잘려 그보다 센 힘이 모두 같았다(사용자: 필압이 안 먹는다) → 코덱스 곡선: 0.05 → 0.72, 0.22 → 1.09, 0.5 → 1.46, 0.66 이상 1.48(× 0.85).
  // 상한을 더 올리면 세게 쓴 굵은 연필이 덮임이 차서 매끈한 마커 면이 된다(코덱스)
  if (kind === 'pencil') return sensed ? 0.85 * Math.max(0.62, Math.min(1.48, 0.38 + 0.68 * (force / 0.2) ** 0.5)) : 0.85
  return TILT_WIDTH[kind] ? 1 + TILT_WIDTH[kind] * tilt : 1
}

// 개발 테스트용 손힘 덮어쓰기(개발 빌드에서만 읽는다). 출시 전엔 반드시 null. 예: 0.22 = S펜 평소 필압
const DEV_PEN_FORCE = null
// RN iOS forceは最大圧力で正規化済み。欠落・0だけの未対応入力を実測扱いしない。
export function readPenForce(event) {
  if (event?.pointerType === 'mouse' || event?.pointerType === 'touch') return null
  // 개발용(2026-11-03): adb 로 넣는 스타일러스 입력은 힘이 늘 1 이라 손힘 테스트가 안 된다 → 아래 DEV_PEN_FORCE(파일을 고치면 Fast Refresh 로 바로 적용) 또는 globalThis.__DIO_FORCE 가 숫자면 그 값으로 그린다(null 이면 끔)
  const forced = typeof __DEV__ !== 'undefined' && __DEV__ ? (DEV_PEN_FORCE ?? globalThis.__DIO_FORCE) : null
  const value = Number.isFinite(forced) ? forced : event?.pointerType === 'pen' ? event.pressure ?? event.force : event?.force
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
}

// 힘 · 속도 배율 평활화 시간상수(코덱스 2026-11-03: 붓펜 30 · 볼펜 20 · 캘리펜 25ms, 반응이 느려 보이지 않게 줄임). 연필은 16ms.
const PRESSURE_SMOOTHING = { taperBrush: 30, ball: 20, calligraphy: 25 }
// useForce · useTilt: 환경설정 필압 · 기울기(shared/penDynamics). 끄면 읽지 않는다
export function createPenPressureSampler(kind, useForce = true, useTilt = true) {
  const smoothing = PRESSURE_SMOOTHING[kind] ?? 16
  let lastForce = null, lastPressure = null, min = Infinity, max = -Infinity, samples = 0
  return {
    sample(event, speed = 0, elapsed = 16) {
      if (event?.isRelease && lastPressure != null) return lastPressure
      const force = useForce ? readPenForce(event) : null
      // 펜을 뗄 때 전달되는 0으로 끝을 강제로 뾰족하게 만들지 않는다.
      if (!event?.isRelease && force != null && (event?.pointerType === 'pen' || force > 0 || lastForce != null)) {
        lastForce = force
        min = Math.min(min, force); max = Math.max(max, force); samples++
      }
      const target = penPressure(kind, speed, lastForce, useTilt ? tiltAmount(event) : 0)
      const weight = 1 - Math.exp(-Math.max(1, Math.min(50, elapsed)) / smoothing)
      lastPressure = lastPressure == null ? target : lastPressure + (target - lastPressure) * weight
      return lastPressure
    },
    report() { return { source: samples ? 'force' : 'speed-fallback', samples, min: samples ? min : null, max: samples ? max : null } },
    force() { return lastForce },
  }
}

// 유리펜 잉크 설정 검사. 모르는 값은 기본값으로 — 다른 펜에도 그냥 실려 있어도 해가 없다(유리펜일 때만 읽는다)
export function sanitizeGlassInk(saved) {
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_GLASS_INK }
  const film = GLASS_FILMS.some(one => one.id === saved.inkFilm) ? saved.inkFilm : DEFAULT_GLASS_INK.inkFilm
  return {
    inkGlitter: typeof saved.inkGlitter === 'boolean' ? saved.inkGlitter : DEFAULT_GLASS_INK.inkGlitter,
    inkSheen: typeof saved.inkSheen === 'boolean' ? saved.inkSheen : DEFAULT_GLASS_INK.inkSheen,
    inkFilm: film,
    inkAmount: inRange(saved.inkAmount, 0, 1, DEFAULT_GLASS_INK.inkAmount),
    inkSheenColor: saved.inkSheenColor == null ? null : validColor(saved.inkSheenColor, null),
    inkSheenAmount: inRange(saved.inkSheenAmount, 0, 1, DEFAULT_GLASS_INK.inkSheenAmount),
  }
}
