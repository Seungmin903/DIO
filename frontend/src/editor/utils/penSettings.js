// 격자와 펜이 함께 사용하는 MVP1 색상 체계.
export const EDITOR_COLORS = ['#92CCFA', '#D1E8FF', '#0B1957', '#B9D7EE', '#6F9FC6', '#365C7A', '#14B8A6', '#22A06B', '#F59E0B', '#EF476F', '#9B6BDF', '#6B7280']
export const PEN_TYPES = [
  { id: 'ball', label: '볼펜' }, { id: 'fountain', label: '만년필' },
  { id: 'brush', label: '붓펜' }, { id: 'pencil', label: '연필' },
]
export const DEFAULT_PEN_SETTINGS = { kind: 'fountain', color: '#1D1D1F', width: 2.5 }
export const HIGHLIGHTER_COLORS = ['#FFE066', '#FFB3C7', '#B5EAD7', '#A0C4FF', '#D0B8FF', '#FFD6A5', '#C7F0A0']
export const DEFAULT_HIGHLIGHTER_SETTINGS = { kind: 'highlighter', color: '#FFE066', width: 18, lineCap: 'square' }
export const HIGHLIGHTER_OPACITY = 0.42
export function normalizeHex(value) {
  const hex = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(hex)) return '#' + hex.split('').map((c) => c + c).join('').toUpperCase()
  return /^[0-9a-f]{6}$/i.test(hex) ? '#' + hex.toUpperCase() : null
}
// 실제 압력 센서가 없는 환경에서도 이동 속도에 따라 펜의 굵기 차이를 표현한다.
export function penPressure(kind, speed = 0) {
  if (kind === 'fountain') return Math.max(0.45, Math.min(1.5, 1.5 - speed * 0.45))
  if (kind === 'brush') return Math.max(0.55, Math.min(2.3, 0.35 + 1.95 / (1 + Math.max(0, speed) * 0.55)))
  return kind === 'pencil' ? 0.85 : 1
}
