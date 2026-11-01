// 책상 창빛 마스크의 자리 계산. 창빛은 책상(상판)에만 비추고 표지 위에는 얹지 않는다.

export const LIGHT_ASPECT = 0.6357 // 창빛 그림의 세로 / 가로 (웹에는 Image.resolveAssetSource 가 없어 직접 적는다)
export const WINDOW_WIDTH = { tablet: 0.85, phone: 1.5 } // 책상 폭에 대한 창빛 폭
export const APEX_X = (1 - WINDOW_WIDTH.tablet) / 2 // 창빛이 가장 높을 때 책상 가운데에 오는 왼쪽 자리(책상 폭 비율)

/** 책상 크기(size)와 변형(patch)으로 창빛 마스크가 책상 위에 놓이는 자리(px) · 변형. */
export function maskFrame(patch, size, compact) {
  const lightWidth = size.width * (compact ? WINDOW_WIDTH.phone : WINDOW_WIDTH.tablet)
  const x = APEX_X + patch.x
  return {
    width: lightWidth,
    height: lightWidth * LIGHT_ASPECT,
    left: size.width * (compact ? x - 0.45 : x),
    top: size.height * (compact ? 0.1 + patch.y : patch.y),
    transform: [{ scaleX: patch.scaleX }, { scaleY: patch.scaleY }, { skewX: `${patch.skewX}deg` }, { rotate: `${patch.rotate}deg` }],
  }
}

