// DIO MVP1의 기준 화면. 모든 화면은 이 비율 안에서 가장 크게 표시한다.
export const TABLET_WIDTH = 1280
export const TABLET_HEIGHT = 800
export const TABLET_ASPECT_RATIO = TABLET_WIDTH / TABLET_HEIGHT

export function fitTabletFrame(windowWidth, windowHeight) {
  const safeWidth = Math.max(0, windowWidth)
  const safeHeight = Math.max(0, windowHeight)
  const scale = Math.min(safeWidth / TABLET_WIDTH, safeHeight / TABLET_HEIGHT)

  return {
    width: TABLET_WIDTH * scale,
    height: TABLET_HEIGHT * scale,
  }
}

// 창의 짧은 변이 이 값(dp) 이상이면 태블릿 화면으로 본다. (Android sw600dp와 같은 기준)
export const TABLET_MIN_SHORT_SIDE = 600

// 기기 종류가 아니라 지금 창 크기로 판단해야 iPad Split View·접이식 폰·웹 창 크기 변경에도 맞게 바뀐다.
export function formFactorFor(windowWidth, windowHeight) {
  return Math.min(windowWidth, windowHeight) >= TABLET_MIN_SHORT_SIDE ? 'tablet' : 'phone'
}
