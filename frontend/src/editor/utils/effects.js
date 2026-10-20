// 스티커·사진의 테두리와 그림자 설정. 값이 없으면 기본값을 쓴다. (기본은 둘 다 꺼짐, 색은 사용자가 피커로 고른다)
// 두께·거리·흐림은 페이지 논리 좌표 단위라 화면 배율(zoom)을 곱해 그린다.

// PPT '바깥쪽 그림자'처럼 9방향. 가운데는 사방으로 퍼지는 그림자(번짐)
export const SHADOW_DIRECTIONS = [
  { id: 'tl', name: '왼쪽 위', x: -1, y: -1 },
  { id: 't', name: '위', x: 0, y: -1 },
  { id: 'tr', name: '오른쪽 위', x: 1, y: -1 },
  { id: 'l', name: '왼쪽', x: -1, y: 0 },
  { id: 'c', name: '가운데', x: 0, y: 0 },
  { id: 'r', name: '오른쪽', x: 1, y: 0 },
  { id: 'bl', name: '왼쪽 아래', x: -1, y: 1 },
  { id: 'b', name: '아래', x: 0, y: 1 },
  { id: 'br', name: '오른쪽 아래', x: 1, y: 1 },
]

export const OUTLINE_WIDTH = { min: 1, max: 12 }
export const SHADOW_LIMITS = { distance: 20, blur: 24, spread: 20, opacityMin: 0.05, opacityMax: 0.5 }

export function outlineOf(object) {
  return {
    on: object.outline === true,
    color: object.outlineColor ?? '#FFFFFF',
    width: object.outlineWidth ?? (object.type === 'sticker' ? 4 : 3),
  }
}

export function shadowOf(object) {
  return {
    on: object.shadow === true,
    color: object.shadowColor ?? '#000000',
    opacity: object.shadowOpacity ?? 0.18,
    blur: object.shadowBlur ?? 8,
    // 크기: 그림자가 모양보다 얼마나 더 퍼지는지 (boxShadow 의 spread)
    spread: object.shadowSpread ?? 0,
    distance: object.shadowDistance ?? 5,
    direction: object.shadowDirection ?? 'b',
    // 예전 위치 패드로 정한 x·y (없으면 방향·거리로 계산)
    x: object.shadowX,
    y: object.shadowY,
    // 안쪽 그림자(사진이 오목하게 들어가 보이게). 사진만 지원
    inset: object.shadowInset === true,
  }
}

/** 방향·거리 → 이동량 (대각선도 같은 거리가 되도록 맞춘다) */
export function shadowOffset(shadow) {
  if (shadow.x != null && shadow.y != null) return { x: shadow.x, y: shadow.y }
  const dir = SHADOW_DIRECTIONS.find((d) => d.id === shadow.direction) ?? SHADOW_DIRECTIONS[7]
  const length = Math.hypot(dir.x, dir.y) || 1
  return { x: (dir.x / length) * shadow.distance, y: (dir.y / length) * shadow.distance }
}

export function rgba(hex, alpha) {
  const value = hex.replace('#', '')
  const n = parseInt(value.length === 3 ? value.replace(/./g, '$&$&') : value, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/**
 * 네모·둥근 모양(사진)용 그림자. RN 0.76+ 새 아키텍처의 boxShadow 는 Android·iOS·웹 모두 같은 방식으로 그린다.
 * (예전 shadow*·elevation 은 플랫폼마다 달라 Android 에서 배경 없는 View 에 그림자가 안 나오거나 남았다)
 */
export function boxShadowStyle(shadow, zoom) {
  if (!shadow.on || shadow.inset) return null
  const { x, y } = shadowOffset(shadow)
  return {
    boxShadow: `${(x * zoom).toFixed(2)}px ${(y * zoom).toFixed(2)}px ${(shadow.blur * zoom).toFixed(2)}px ${(shadow.spread * zoom).toFixed(2)}px ${rgba(shadow.color, shadow.opacity)}`,
  }
}

/** 안쪽 그림자: 사진 위에 덮는 투명 View 에 inset boxShadow 를 건다 (사진에 가려지지 않게) */
export function insetShadowStyle(shadow, zoom) {
  if (!shadow.on || !shadow.inset) return null
  const { x, y } = shadowOffset(shadow)
  return {
    boxShadow: `inset ${(x * zoom).toFixed(2)}px ${(y * zoom).toFixed(2)}px ${(shadow.blur * zoom).toFixed(2)}px ${(shadow.spread * zoom).toFixed(2)}px ${rgba(shadow.color, Math.min(1, shadow.opacity * 1.6))}`,
  }
}
