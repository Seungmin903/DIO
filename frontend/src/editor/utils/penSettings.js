// 격자와 펜이 함께 사용하는 MVP1 색상 체계.
// 앱 테마 파랑 계열 6색은 빼고, 기본 펜 색(검정)을 맨 앞에 둔다. 형광펜과 같은 7색이라 옵션 창에서 한 줄로 보인다.
// 기본 프리셋 색(코덱스 2026-10-31): DIO 성격(차분 · 따뜻)에 맞춘 한 세트 — 채도 · 명도를 맞춰 따뜻 · 차가움 · 무채를 고르게, 패널 한 줄에 들어가는 7색. 펜 · 글자는 흰 바탕 4.5:1 이상
export const EDITOR_COLORS = ['#18224D', '#A33C4B', '#917019', '#397A5B', '#34769F', '#7653A6', '#626878']
export const PEN_TYPES = [
  // 저장 식별자는 유지해 기존 획과 새 펜의 만년필 필기감을 그대로 보존한다.
  { id: 'fountain', label: '만년필' }, { id: 'felt', label: '펠트펜' },
  { id: 'brush', label: '붓펜' }, { id: 'pencil', label: '연필' },
]
export const DEFAULT_PEN_SETTINGS = { kind: 'fountain', color: '#18224D', width: 2.5 }
// 형광펜: 0.42 로 겹쳐 칠해도 · 속지 종이 색으로 깔아도 뽀얀 톤
export const HIGHLIGHTER_COLORS = ['#F7DF8A', '#F6C79B', '#F2B4AE', '#D8C5EF', '#C6D0F0', '#BDE4D1', '#E5DDD2']
export const DEFAULT_HIGHLIGHTER_SETTINGS = { kind: 'highlighter', color: '#F7DF8A', width: 18, lineCap: 'square' }
export const HIGHLIGHTER_OPACITY = 0.42
export function normalizeHex(value) {
  const hex = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(hex)) return '#' + hex.split('').map((c) => c + c).join('').toUpperCase()
  return /^[0-9a-f]{6}$/i.test(hex) ? '#' + hex.toUpperCase() : null
}
// pressure는 센서 원값이 아니라 저장·렌더링용 굵기 배율이다.
export function penPressure(kind, speed = 0, force = null) {
  const sensed = Number.isFinite(force) && force >= 0 && force <= 1
  if (kind === 'fountain') return sensed ? 0.85 + 0.25 * Math.sqrt(force) : 0.94 + 0.12 / (1 + Math.max(0, speed))
  if (kind === 'brush') return sensed ? 0.18 + 1.22 * Math.sqrt(force) : 0.85 + 0.3 / (1 + Math.max(0, speed) * 0.7)
  if (kind === 'felt' && sensed) return 0.88 + 0.12 * Math.sqrt(force)
  return kind === 'pencil' ? 0.85 : 1
}

// RN iOS forceは最大圧力で正規化済み。欠落・0だけの未対応入力を実測扱いしない。
export function readPenForce(event) {
  if (event?.pointerType === 'mouse' || event?.pointerType === 'touch') return null
  const value = event?.pointerType === 'pen' ? event.pressure ?? event.force : event?.force
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
}

export function createPenPressureSampler(kind) {
  let lastForce = null, lastPressure = null, min = Infinity, max = -Infinity, samples = 0
  return {
    sample(event, speed = 0, elapsed = 16) {
      if (event?.isRelease && lastPressure != null) return lastPressure
      const force = readPenForce(event)
      // 펜을 뗄 때 전달되는 0으로 끝을 강제로 뾰족하게 만들지 않는다.
      if (!event?.isRelease && force != null && (event?.pointerType === 'pen' || force > 0 || lastForce != null)) {
        lastForce = force
        min = Math.min(min, force); max = Math.max(max, force); samples++
      }
      const target = penPressure(kind, speed, lastForce)
      const weight = 1 - Math.exp(-Math.max(1, Math.min(50, elapsed)) / 16)
      lastPressure = lastPressure == null ? target : lastPressure + (target - lastPressure) * weight
      return lastPressure
    },
    report() { return { source: samples ? 'force' : 'speed-fallback', samples, min: samples ? min : null, max: samples ? max : null } },
    force() { return lastForce },
  }
}
