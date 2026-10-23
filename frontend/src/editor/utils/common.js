export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// 웹·Node는 표준 crypto를 쓴다. 네이티브에는 전역 crypto가 없어 App.js가 expo-crypto의 randomUUID를 연결한다.
function standardUuid() {
  const crypto = globalThis.crypto
  if (crypto?.randomUUID) return crypto.randomUUID()
  const bytes = crypto?.getRandomValues
    ? crypto.getRandomValues(new Uint8Array(16))
    : Uint8Array.from({ length: 16 }, () => Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

let generateUuid = standardUuid

export function setUuidGenerator(generate) {
  generateUuid = generate
}

/** 다이어리·페이지·요소 ID. 나중에 서버로 올려도 기기끼리 겹치지 않도록 UUID v4를 쓴다. */
export function createId() {
  return generateUuid()
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
