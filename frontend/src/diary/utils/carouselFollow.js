// 스와이프 카드의 크기 · 높이 변화(옆 카드 → 가운데 카드)와, 표지가 책상 창빛 마스크를 카드 이동에 맞춰 따라 받게 하는 계산.
// 카드는 스크롤만큼 왼쪽으로 밀리고, 위를 기준(transformOrigin: center top)으로 커지고 작아지며 위아래로 오른다.
// 책상 마스크는 화면에 고정돼 있으므로 표지 안 마스크는 그 반대로 움직여야 한다. 스크롤 값은 네이티브에서 도는 애니메이션 값이라 식으로만 이어 붙인다.
import { Animated } from 'react-native'

export const CAROUSEL_SCALE = [0.84, 1.06, 0.84] // 옆 · 가운데 · 옆 카드의 크기
export const CAROUSEL_LIFT = [30, -12, 30] // 옆 · 가운데 · 옆 카드의 아래로 내려간 거리(px)

const mid = values => [values[0], (values[0] + values[1]) / 2, values[1], (values[1] + values[2]) / 2, values[2]]

/** 카드(index)가 스크롤 위치(scroll)에 있을 때의 크기 · 내려간 거리. 애니메이션과 같은 식이다. */
export function carouselRestAt(index, scroll, step) {
  const t = Math.max(0, Math.min(2, (scroll - (index - 1) * step) / step))
  const lerp = values => t <= 1 ? values[0] + (values[1] - values[0]) * t : values[1] + (values[2] - values[1]) * (t - 1)
  return { scale: lerp(CAROUSEL_SCALE), lift: lerp(CAROUSEL_LIFT) }
}

/** 카드(index)의 크기 · 내려감 · 그 역수(애니메이션 값). 크기의 역수는 비선형이라 반 칸 지점을 한 번 더 찍는다. */
export function carouselFollowNodes(scrollX, index, step) {
  const inputRange = [(index - 1) * step, (index - 0.5) * step, index * step, (index + 0.5) * step, (index + 1) * step]
  const along = outputRange => scrollX.interpolate({ inputRange, outputRange, extrapolate: 'clamp' })
  const scales = mid(CAROUSEL_SCALE)
  return { scrollX, scale: along(scales), lift: along(mid(CAROUSEL_LIFT)), inverse: along(scales.map(value => 1 / value)) }
}

/**
 * 표지 상자 왼쪽 위(화면 px)에서 책상 마스크 왼쪽 위까지의 이동량(애니메이션 값).
 * anchor: 쉬는 동안 한 번 잰 표지 자리에서 구한 스크롤과 무관한 값 { cx: 카드 가운데 x 를 스크롤 0 으로 옮긴 값, yc: 위 기준 y }.
 * 표지 상자는 카드 가운데에 놓이고(크기를 바꿔도 가운데 x 는 그대로) 카드 맨 위에서 q 만큼 아래(가로 표지는 낮아서 아래로 붙는다)에 있다.
 */
export function followOffset(nodes, anchor, boxWidth, q, deskLeft, deskTop) {
  const x = Animated.add(Animated.add(nodes.scrollX, Animated.multiply(nodes.scale, boxWidth / 2)), deskLeft - anchor.cx)
  const y = Animated.add(Animated.add(Animated.multiply(nodes.lift, -1), Animated.multiply(nodes.scale, -q)), deskTop - anchor.yc)
  return { x, y }
}
