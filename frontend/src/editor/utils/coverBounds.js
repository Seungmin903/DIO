/**
 * 요소가 **덮는 자리**(페이지 좌표의 왼쪽 · 오른쪽 · 위 · 아래).
 *
 * 돌린 요소는 돌린 뒤 네 모서리를 감싸는 네모로 본다 — 가로로 긴 메모를 90도 가까이 돌려
 * 무언가에 걸치면, 돌리기 전 네모로는 안 겹치기 때문이다(코드리뷰 2026-11-13).
 * utils/common.js 의 rotatedBounds 와 같은 식인데, 그쪽은 w · h 가 반드시 있어야 하고
 * 이 함수는 **없을 수도 있는 값**(자리표 · 덜 채워진 요소)을 받아 0 으로 본다.
 */
export function coverBounds(object) {
  const w = object?.w ?? 0, h = object?.h ?? 0, x = object?.x ?? 0, y = object?.y ?? 0
  const angle = ((object?.rotation ?? 0) % 360) * Math.PI / 180
  if (!angle) return { left: x, right: x + w, top: y, bottom: y + h }
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle))
  const rw = w * cos + h * sin, rh = w * sin + h * cos
  const cx = x + w / 2, cy = y + h / 2
  return { left: cx - rw / 2, right: cx + rw / 2, top: cy - rh / 2, bottom: cy + rh / 2 }
}

/** 두 자리가 겹치나 */
export const coversEach = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
