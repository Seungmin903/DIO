export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const toRadians = (deg) => (deg * Math.PI) / 180

/** 각도를 0 이상 360 미만으로 맞춘다. (명세: 회전 중 0–360° 표시) */
export function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360
}

/** 로컬(회전된) 좌표 → 월드 좌표 */
export function rotateVector(x, y, deg) {
  const r = toRadians(deg)
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) }
}

export const centerOf = (object) => ({ x: object.x + object.w / 2, y: object.y + object.h / 2 })

/** 회전된 박스의 축 정렬 경계 상자 */
export function rotatedBounds(object) {
  const { x: cx, y: cy } = centerOf(object)
  const r = toRadians(object.rotation)
  const cos = Math.abs(Math.cos(r))
  const sin = Math.abs(Math.sin(r))
  const halfW = (object.w * cos + object.h * sin) / 2
  const halfH = (object.w * sin + object.h * cos) / 2
  return { left: cx - halfW, right: cx + halfW, top: cy - halfH, bottom: cy + halfH, cx, cy }
}

export function unionBounds(objects) {
  const boxes = objects.map(rotatedBounds)
  const left = Math.min(...boxes.map((b) => b.left))
  const right = Math.max(...boxes.map((b) => b.right))
  const top = Math.min(...boxes.map((b) => b.top))
  const bottom = Math.max(...boxes.map((b) => b.bottom))
  return { left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 }
}
